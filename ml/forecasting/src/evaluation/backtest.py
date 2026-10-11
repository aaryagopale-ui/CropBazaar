"""Chronological, purged, expanding-window backtesting for one (series, horizon) cell.

Every method is trained on the same rows and scored on the same test origins:
* validation folds  -> used for model selection
* final holdout     -> never used for selection; confirmation only
Training rows for a split are only those whose *target date* precedes the split's first test
origin, so no label from the test period (or overlapping it) is ever seen in training.
"""

import numpy as np
import pandas as pd

from src import config
from src.features.forecast_features import build_horizon_dataset, horizon_diagnostics
from src.models.candidates import ALL_METHOD_NAMES, BASELINE_NAMES, build_forecaster


def error_metrics(actual, predicted) -> dict:
    actual = np.asarray(actual, dtype=float)
    err = np.asarray(predicted, dtype=float) - actual
    return {
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "median_ae": float(np.median(np.abs(err))),
    }


def block_bootstrap_ci(diff, block: int = config.BOOTSTRAP_BLOCK,
                       draws: int = config.BOOTSTRAP_DRAWS, seed: int = config.RANDOM_SEED):
    """95% CI of mean(diff) using a moving-block bootstrap (errors are autocorrelated)."""
    diff = np.asarray(diff, dtype=float)
    n = len(diff)
    if n < 2:
        return (float("nan"), float("nan"))
    block = max(1, min(block, n))
    rng = np.random.default_rng(seed)
    n_blocks = int(np.ceil(n / block))
    starts = rng.integers(0, n - block + 1, size=(draws, n_blocks))
    index = (starts[:, :, None] + np.arange(block)[None, None, :]).reshape(draws, -1)[:, :n]
    means = diff[index].mean(axis=1)
    low, high = np.percentile(means, [2.5, 97.5])
    return float(low), float(high)


def make_splits(data: pd.DataFrame):
    """Yield (name, train, test) for each validation fold and the final holdout.

    `data` holds only rows with an observed exact-date target, sorted by origin date.
    Returns (splits, skipped) where skipped explains folds that could not be formed.
    """
    splits, skipped = [], []
    windows = [(f"fold{i + 1}", pd.Timestamp(a), pd.Timestamp(b))
               for i, (a, b) in enumerate(config.VALIDATION_FOLDS)]
    windows.append(("holdout", pd.Timestamp(config.HOLDOUT_START), None))
    for name, start, end in windows:
        in_window = data.index >= start
        if end is not None:
            in_window &= data.index < end
        test = data[in_window]
        train = data[data["target_date"] < start]  # purge: labels fully known before `start`
        if len(test) < config.MIN_FOLD_TEST_ROWS:
            skipped.append((name, f"only {len(test)} test rows"))
        elif len(train) < config.MIN_TRAIN_ROWS:
            skipped.append((name, f"only {len(train)} training rows"))
        else:
            splits.append((name, train, test))
    return splits, skipped


def evaluate_cell(commodity: str, market: str, series: pd.DataFrame, weather,
                  horizon: int, methods=ALL_METHOD_NAMES) -> dict:
    """Score all methods for one commodity/market/horizon. Raises on any model failure."""
    dataset = build_horizon_dataset(series, weather, horizon)
    diagnostics = horizon_diagnostics(dataset)
    labelled = dataset[dataset["target_observed"]]
    splits, skipped = make_splits(labelled)

    fold_rows = []
    pooled = {m: {"actual": [], "pred": []} for m in methods}  # validation folds, in order
    holdout = {}
    for split_name, train, test in splits:
        for method in methods:
            forecaster = build_forecaster(method).fit(train)
            predicted = forecaster.predict(test)
            actual = test["target_price"].to_numpy()
            metrics = error_metrics(actual, predicted)
            fold_rows.append({
                "commodity": commodity, "market": market, "horizon_days": horizon,
                "split": split_name, "method": method,
                "n_train": len(train), "n_test": len(test),
                "test_start": test.index.min().date().isoformat(),
                "test_end": test.index.max().date().isoformat(),
                **metrics,
            })
            if split_name == "holdout":
                holdout[method] = {"actual": actual, "pred": predicted}
            else:
                pooled[method]["actual"].append(actual)
                pooled[method]["pred"].append(predicted)

    valid_folds = [s for s, _, _ in splits if s != "holdout"]
    result = {
        "commodity": commodity, "market": market, "horizon_days": horizon,
        "diagnostics": diagnostics,
        "folds_used": valid_folds, "has_holdout": "holdout" in [s for s, _, _ in splits],
        "skipped_splits": skipped, "fold_rows": fold_rows,
        "n_train_final": int(len(labelled)),
        "methods": {},
    }
    if len(valid_folds) == 0:
        return result

    val_actual = np.concatenate(pooled[methods[0]]["actual"])
    best_baseline = min(
        (m for m in methods if m in BASELINE_NAMES),
        key=lambda m: error_metrics(val_actual, np.concatenate(pooled[m]["pred"]))["mae"],
    )
    base_val_pred = np.concatenate(pooled[best_baseline]["pred"])
    fold_table = pd.DataFrame(fold_rows)
    result["best_baseline"] = best_baseline

    for method in methods:
        val_pred = np.concatenate(pooled[method]["pred"])
        val = error_metrics(val_actual, val_pred)
        entry = {"n_val": int(len(val_actual)), "val": val}
        fm = fold_table[(fold_table["method"] == method) & fold_table["split"].isin(valid_folds)]
        fb = fold_table[(fold_table["method"] == best_baseline) & fold_table["split"].isin(valid_folds)]
        entry["fold_maes"] = fm.set_index("split")["mae"].reindex(valid_folds).tolist()
        entry["folds_won_vs_baseline"] = int(
            (fm.set_index("split")["mae"] < fb.set_index("split")["mae"]).sum()
        )
        diff = np.abs(val_pred - val_actual) - np.abs(base_val_pred - val_actual)
        low, high = block_bootstrap_ci(diff)
        entry["val_mae_diff_vs_baseline"] = float(diff.mean())
        entry["val_mae_diff_ci95"] = [low, high]
        if method in holdout:
            hold_actual = holdout[method]["actual"]
            entry["n_holdout"] = int(len(hold_actual))
            entry["holdout"] = error_metrics(hold_actual, holdout[method]["pred"])
            hd = (np.abs(holdout[method]["pred"] - hold_actual)
                  - np.abs(holdout[best_baseline]["pred"] - hold_actual))
            entry["holdout_mae_diff_vs_baseline"] = float(hd.mean())
            entry["holdout_mae_diff_ci95"] = list(block_bootstrap_ci(hd))
        result["methods"][method] = entry
    return result

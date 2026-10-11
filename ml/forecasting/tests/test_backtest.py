import numpy as np
import pandas as pd
import pytest

from src import config
from src.evaluation.backtest import block_bootstrap_ci, error_metrics, evaluate_cell, make_splits
from src.features.forecast_features import build_horizon_dataset
from tests.conftest import make_series, make_weather


@pytest.fixture(scope="module")
def long_series():
    return make_series(start="2024-01-01", days=1000, seed=3), make_weather(days=1100)


def test_error_metrics():
    m = error_metrics([100, 200, 300], [110, 190, 330])
    assert m["mae"] == pytest.approx(50 / 3)
    assert m["rmse"] == pytest.approx(np.sqrt((100 + 100 + 900) / 3))
    assert m["median_ae"] == 10


def test_splits_are_chronological_and_purged(long_series):
    series, weather = long_series
    data = build_horizon_dataset(series, weather, 7)
    data = data[data["target_observed"]]
    splits, skipped = make_splits(data)
    assert [s[0] for s in splits][-1] == "holdout"
    for name, train, test in splits:
        assert train.index.max() < test.index.min()
        assert (train["target_date"] < test.index.min()).all()   # no label overlaps the test period
        assert not set(train.index) & set(test.index)
    folds = [t for n, _, t in splits if n != "holdout"]
    for a, b in zip(folds, folds[1:]):
        assert a.index.max() < b.index.min()
    holdout = dict((n, t) for n, _, t in splits)["holdout"]
    assert holdout.index.min() >= pd.Timestamp(config.HOLDOUT_START)


def test_all_methods_scored_on_identical_rows_and_baseline_matches_independent_calc(long_series):
    series, weather = long_series
    cell = evaluate_cell("Synthetic", "Mkt", series, weather, 3,
                         methods=("persistence", "rolling_mean_7d", "ridge_core"))
    rows = pd.DataFrame(cell["fold_rows"])
    sizes = rows.groupby("split")["n_test"].nunique()
    assert (sizes == 1).all()
    assert rows.groupby("split")["test_start"].nunique().eq(1).all()
    # independent recomputation of persistence MAE on the holdout
    by_date = series.set_index("date")["modal_price"]
    ho = rows[(rows.split == "holdout") & (rows.method == "persistence")].iloc[0]
    errs = []
    for origin, price in by_date.items():
        target = origin + pd.Timedelta(days=3)
        if origin >= pd.Timestamp(config.HOLDOUT_START) and target in by_date.index \
                and origin >= by_date.index[0] + pd.Timedelta(days=config.MIN_HISTORY_DAYS):
            errs.append(abs(by_date[target] - price))
    assert ho.n_test == len(errs)
    assert ho.mae == pytest.approx(np.mean(errs))
    assert cell["diagnostics"]["targets_missing_market_day"] > 0   # reported, not scored


def test_bootstrap_ci_brackets_true_mean_and_is_deterministic():
    diff = np.random.default_rng(0).normal(-5, 10, 300)
    lo, hi = block_bootstrap_ci(diff)
    assert lo < diff.mean() < hi and hi < 0
    assert block_bootstrap_ci(diff) == (lo, hi)
    assert all(np.isnan(block_bootstrap_ci([1.0])))

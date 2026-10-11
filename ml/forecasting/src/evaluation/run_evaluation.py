"""Reproduce the full evaluation and regenerate the serving policy.

    python -m src.evaluation.run_evaluation            # all commodities, horizons 1-7

Writes (all deterministic given the series store):
    reports/fold_results.csv        per split x method metrics
    reports/method_comparison.csv   every method, per commodity/horizon, vs best baseline
    reports/evaluation_summary.csv  one row per commodity/horizon with the approval decision
    reports/EVALUATION.md           human-readable report
    artifacts/forecast_policy.json  what the prediction interface reads
Any failure aborts the run; nothing is skipped silently.
"""

import argparse
import hashlib
from pathlib import Path

import pandas as pd
from joblib import Parallel, delayed

from src import config
from src.data.series import load_series, load_weather
from src.evaluation.backtest import evaluate_cell
from src.evaluation.policy import cell_key, cell_policy_entry, decide, write_policy


def _run_cell(commodity, market, horizon, series_path, weather_path):
    series = load_series(commodity, market, series_path)
    weather = load_weather(weather_path)
    return evaluate_cell(commodity, market, series, weather, horizon)


def _summary_row(cell: dict, decision: dict) -> dict:
    m = cell["methods"]
    base = m.get(decision["best_baseline"], {})
    cand_name = decision["experimental_candidate"] or (
        decision["selected_method"] if decision["status"] == "validated_model" else None
    )
    cand = m.get(cand_name, {}) if cand_name else {}
    d = cell["diagnostics"]

    def get(entry, *path):
        for key in path:
            entry = entry.get(key) if isinstance(entry, dict) else None
        return entry

    def improvement(base_mae, cand_mae):
        return None if not base_mae or cand_mae is None else 100 * (base_mae - cand_mae) / base_mae

    return {
        "commodity": cell["commodity"], "market": cell["market"], "horizon_days": cell["horizon_days"],
        "valid_origins": d["valid_origins"], "targets_observed": d["targets_observed"],
        "targets_missing_market_day": d["targets_missing_market_day"],
        "targets_after_data_end": d["targets_after_data_end"],
        "n_train_final": cell["n_train_final"],
        "n_validation": base.get("n_val"), "n_holdout": base.get("n_holdout"),
        "validation_folds": len(cell["folds_used"]),
        "best_baseline": decision["best_baseline"],
        "baseline_val_mae": get(base, "val", "mae"), "baseline_val_rmse": get(base, "val", "rmse"),
        "baseline_holdout_mae": get(base, "holdout", "mae"),
        "baseline_holdout_rmse": get(base, "holdout", "rmse"),
        "best_candidate": cand_name,
        "cand_val_mae": get(cand, "val", "mae"), "cand_val_rmse": get(cand, "val", "rmse"),
        "val_improvement_pct": improvement(get(base, "val", "mae"), get(cand, "val", "mae")),
        "folds_won": cand.get("folds_won_vs_baseline"),
        "val_diff_ci_low": (cand.get("val_mae_diff_ci95") or [None, None])[0],
        "val_diff_ci_high": (cand.get("val_mae_diff_ci95") or [None, None])[1],
        "cand_holdout_mae": get(cand, "holdout", "mae"),
        "cand_holdout_rmse": get(cand, "holdout", "rmse"),
        "holdout_improvement_pct": improvement(get(base, "holdout", "mae"), get(cand, "holdout", "mae")),
        "status": decision["status"], "selected_method": decision["selected_method"],
        "failed_criteria": ";".join(decision["failed_criteria"]),
    }


def _comparison_rows(cell: dict) -> list:
    rows = []
    for name, e in cell["methods"].items():
        base_val = cell["methods"][cell["best_baseline"]]["val"]["mae"]
        base_hold = cell["methods"][cell["best_baseline"]].get("holdout", {}).get("mae")
        hold = e.get("holdout", {})
        rows.append({
            "commodity": cell["commodity"], "horizon_days": cell["horizon_days"], "method": name,
            "is_best_baseline": name == cell["best_baseline"],
            "n_validation": e["n_val"], "n_holdout": e.get("n_holdout"),
            "val_mae": e["val"]["mae"], "val_rmse": e["val"]["rmse"], "val_median_ae": e["val"]["median_ae"],
            "val_vs_best_baseline_pct": 100 * (base_val - e["val"]["mae"]) / base_val,
            "folds_won_vs_baseline": e["folds_won_vs_baseline"],
            "val_diff_ci_low": e["val_mae_diff_ci95"][0], "val_diff_ci_high": e["val_mae_diff_ci95"][1],
            "holdout_mae": hold.get("mae"), "holdout_rmse": hold.get("rmse"),
            "holdout_median_ae": hold.get("median_ae"),
            "holdout_vs_best_baseline_pct": (
                100 * (base_hold - hold["mae"]) / base_hold if hold and base_hold else None
            ),
            "fold_maes": " ".join(f"{x:.1f}" for x in e["fold_maes"]),
        })
    return rows


def _markdown(summary: pd.DataFrame, policy_meta: dict) -> str:
    n_cells = len(summary)
    n_ok = int((summary["status"] == "validated_model").sum())
    lines = [
        "# CropBazaar forecast evaluation",
        "",
        f"Data through **{policy_meta['evaluated_through']}**. Generated by "
        "`python -m src.evaluation.run_evaluation` (deterministic).",
        "",
        "## Protocol",
        "- Forecast origin = an observation date; horizon h = 1..7 calendar days; target = the price "
        "observed on **exactly** origin + h. Missing target days are excluded from scoring and counted, "
        "never replaced by a later date.",
        f"- Five expanding-window validation folds ({config.VALIDATION_FOLDS[0][0]} to "
        f"{config.VALIDATION_FOLDS[-1][1]}), then an untouched final holdout from {config.HOLDOUT_START}. "
        "Training labels must be fully realised before each test window (purged).",
        "- Every method sees identical origins/targets. Metrics are in Rs./quintal.",
        "- Selection uses validation folds only; the holdout only confirms.",
        f"- A model is `validated_model` only if: validation MAE improves on the **best baseline** by "
        f">= {config.CRITERIA.min_improvement_pct}%, wins >= {int(config.CRITERIA.min_folds_won_fraction*100)}% of folds, "
        "the 95% block-bootstrap CI of the MAE difference excludes zero, the holdout MAE is also better, "
        "and RMSE is not worse on validation or holdout. Otherwise the best baseline is served.",
        "",
        f"## Outcome: {n_ok} of {n_cells} commodity-horizon cells have a validated model",
        "",
    ]
    for commodity, group in summary.groupby("commodity", sort=False):
        lines += [f"### {commodity} ({group['market'].iloc[0]})", "",
                  "| h | n val / hold | best baseline | base val MAE | base hold MAE | best ML candidate | "
                  "cand val MAE (Δ%) | folds won | ΔMAE 95% CI | cand hold MAE (Δ%) | decision |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        for _, r in group.iterrows():
            def f(x, nd=1):
                return "-" if pd.isna(x) else f"{x:.{nd}f}"
            lines.append(
                f"| {r.horizon_days} | {r.n_validation}/{r.n_holdout} | {r.best_baseline} | "
                f"{f(r.baseline_val_mae)} | {f(r.baseline_holdout_mae)} | {r.best_candidate or '-'} | "
                f"{f(r.cand_val_mae)} ({f(r.val_improvement_pct)}%) | {r.folds_won}/{r.validation_folds} | "
                f"[{f(r.val_diff_ci_low)}, {f(r.val_diff_ci_high)}] | "
                f"{f(r.cand_holdout_mae)} ({f(r.holdout_improvement_pct)}%) | "
                f"**{'MODEL' if r.status == 'validated_model' else 'baseline'}** `{r.selected_method}` |"
            )
        lines.append("")
    lines += [
        "## Limitations",
        "- Only ~2.7 years of data; validation folds are 3 months each, so seasonality is learned from at most two cycles.",
        "- Reporting is irregular (market holidays, Sundays for some mandis). Scores apply to target dates "
        "that have a recorded price; coverage is in `evaluation_summary.csv` (`targets_missing_market_day`).",
        "- The source contains isolated bad prints (e.g. a single-day 10,000 Rs/q Cabbage price amid ~1,250). "
        "Targets are scored as reported, so all methods, including baselines, are penalised by them. "
        "`method_comparison.csv` also lists median absolute error.",
        "- Weather is Nashik-city observed weather up to the day before the origin; no historical weather "
        "forecasts exist, so future weather is deliberately not used.",
        "- Past performance does not guarantee future accuracy. Intervals are not forecast-uncertainty bands.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--series", type=Path, default=config.SERIES_PATH)
    parser.add_argument("--weather", type=Path, default=config.WEATHER_PATH)
    parser.add_argument("--reports-dir", type=Path, default=config.REPORTS_DIR)
    parser.add_argument("--policy-out", type=Path, default=config.POLICY_PATH)
    parser.add_argument("--jobs", type=int, default=-1, help="parallel workers (default: all cores)")
    args = parser.parse_args(argv)

    series_sha = hashlib.sha256(Path(args.series).read_bytes()).hexdigest()
    jobs = [(c, m, h) for c, ms in config.SUPPORTED_SERIES.items() for m in ms for h in config.HORIZONS]
    cells = Parallel(n_jobs=args.jobs)(
        delayed(_run_cell)(c, m, h, args.series, args.weather) for c, m, h in jobs
    )

    fold_rows, comparison, summary, entries = [], [], [], {}
    for cell in cells:
        decision = decide(cell)
        fold_rows += cell["fold_rows"]
        if cell["methods"]:
            comparison += _comparison_rows(cell)
        summary.append(_summary_row(cell, decision))
        if cell["methods"]:
            entry = cell_policy_entry(cell, decision)
        else:
            entry = {
                "status": "baseline_estimate", "selected_method": "persistence",
                "baseline_method": "persistence", "experimental_candidate": None,
                "failed_criteria": decision["failed_criteria"],
            }
        entry["diagnostics"] = cell["diagnostics"]
        entries[cell_key(cell["commodity"], cell["market"], cell["horizon_days"])] = entry

    out = Path(args.reports_dir)
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(fold_rows).to_csv(out / "fold_results.csv", index=False, float_format="%.4f")
    pd.DataFrame(comparison).to_csv(out / "method_comparison.csv", index=False, float_format="%.4f")
    summary_df = pd.DataFrame(summary)
    summary_df.to_csv(out / "evaluation_summary.csv", index=False, float_format="%.4f")

    evaluated_through = max(
        load_series(c, m, args.series)["date"].max() for c, ms in config.SUPPORTED_SERIES.items() for m in ms
    ).date().isoformat()
    meta = {"series_sha256": series_sha}
    write_policy(args.policy_out, entries, evaluated_through, meta)
    (out / "EVALUATION.md").write_text(_markdown(summary_df, {"evaluated_through": evaluated_through}))

    print(summary_df[["commodity", "horizon_days", "n_validation", "n_holdout", "best_baseline",
                      "best_candidate", "val_improvement_pct", "holdout_improvement_pct",
                      "status"]].round(2).to_string(index=False))
    print(f"\nValidated models: {int((summary_df['status'] == 'validated_model').sum())} of {len(summary_df)} cells")
    print(f"Wrote reports to {out} and policy to {args.policy_out}")


if __name__ == "__main__":
    main()

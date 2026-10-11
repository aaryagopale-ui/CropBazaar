import json

import pytest

from src import config
from src.errors import PolicyError
from src.evaluation.policy import cell_policy_entry, decide, json_safe, read_policy


def method(val_mae, hold_mae, folds_won=4, ci=(-30.0, -5.0), val_rmse=None, hold_rmse=None, n_val=300, n_hold=100):
    return {
        "n_val": n_val, "n_holdout": n_hold,
        "val": {"mae": val_mae, "rmse": val_rmse or val_mae * 1.3, "median_ae": val_mae * 0.8},
        "holdout": {"mae": hold_mae, "rmse": hold_rmse or hold_mae * 1.3, "median_ae": hold_mae * 0.8},
        "fold_maes": [val_mae] * 5, "folds_won_vs_baseline": folds_won,
        "val_mae_diff_ci95": list(ci),
    }


def make_cell(candidate, baseline=None, extra=None):
    baseline = baseline or method(100.0, 100.0, folds_won=0, ci=(0.0, 0.0))
    methods = {"persistence": baseline, "rolling_mean_7d": method(110.0, 110.0, 0, (5, 20)),
               "ridge_core": candidate}
    methods.update(extra or {})
    return {"commodity": "X", "market": "M", "horizon_days": 1, "best_baseline": "persistence",
            "folds_used": ["f1", "f2", "f3", "f4", "f5"], "methods": methods, "n_train_final": 500}


def test_clearly_better_model_is_approved():
    d = decide(make_cell(method(90.0, 92.0)))
    assert d["status"] == "validated_model" and d["selected_method"] == "ridge_core"
    assert d["failed_criteria"] == [] and d["experimental_candidate"] is None


@pytest.mark.parametrize("candidate, failure", [
    (method(99.0, 90.0), "improvement_pct"),                       # < 2% better
    (method(90.0, 90.0, folds_won=2), "folds_won"),                # inconsistent across folds
    (method(90.0, 90.0, ci=(-20.0, 3.0)), "ci_excludes_zero"),     # not significant
    (method(90.0, 105.0), "holdout_mae_better"),                   # fails on untouched holdout
    (method(90.0, 90.0, hold_rmse=200.0), "rmse_not_worse"),       # tail errors worse
    (method(90.0, 90.0, n_hold=5), "holdout_available"),           # too little holdout evidence
])
def test_each_criterion_blocks_approval_and_falls_back_to_baseline(candidate, failure):
    d = decide(make_cell(candidate))
    assert failure in d["failed_criteria"]
    assert d["status"] == "baseline_estimate"
    assert d["selected_method"] == "persistence"          # the best baseline, not a weaker one
    assert d["experimental_candidate"] == "ridge_core"


def test_model_compared_against_strongest_baseline_not_persistence():
    strong = method(80.0, 80.0, 0, (0, 0))
    cell = make_cell(method(90.0, 90.0), baseline=strong)  # beats nothing: 90 > 80
    d = decide(cell)
    assert d["status"] == "baseline_estimate"


def test_best_candidate_chosen_on_validation_not_holdout():
    good_val = method(92.0, 99.0)       # best validation, so it is the one judged
    lucky_holdout = method(97.0, 50.0)  # would look great on holdout
    d = decide(make_cell(lucky_holdout, extra={"xgb_core": good_val}))
    assert d["experimental_candidate"] == "xgb_core" or d["selected_method"] == "xgb_core"


def test_no_data_means_baseline():
    d = decide({"methods": {}})
    assert d["status"] == "baseline_estimate" and d["selected_method"] == "persistence"


def test_policy_entry_is_json_serialisable_and_labels_methods():
    cell = make_cell(method(99.0, 90.0))
    entry = cell_policy_entry(cell, decide(cell))
    json.dumps(json_safe(entry), allow_nan=False)
    assert entry["status"] == "baseline_estimate" and entry["baseline_method"] == "persistence"


def test_committed_policy_covers_all_cells_and_is_consistent():
    policy = read_policy()
    expected = {f"{c}|{m}|{h}" for c, ms in config.SUPPORTED_SERIES.items() for m in ms for h in config.HORIZONS}
    assert set(policy["cells"]) == expected
    for key, entry in policy["cells"].items():
        assert entry["status"] in ("validated_model", "baseline_estimate")
        if entry["status"] == "validated_model":
            assert entry["failed_criteria"] == [] and entry["selected_validation_mae"] < entry["baseline_validation_mae"]
            assert entry["selected_holdout_mae"] < entry["baseline_holdout_mae"]
        else:
            assert entry["selected_method"] == entry["baseline_method"]
            assert entry["selected_method"] in ("persistence", "rolling_mean_7d")


def test_policy_errors_are_explicit(tmp_path):
    with pytest.raises(PolicyError, match="not found"):
        read_policy(tmp_path / "missing.json")
    bad = tmp_path / "old.json"
    bad.write_text(json.dumps({"policy_compat_version": -1}))
    with pytest.raises(PolicyError, match="incompatible"):
        read_policy(bad)


def test_readme_numbers_match_the_committed_policy():
    """Guard against documentation drift: the headline counts must equal the policy file."""
    from collections import Counter
    from src.config import ROOT
    cells = read_policy()["cells"].values()
    validated = sum(c["status"] == "validated_model" for c in cells)
    baseline = Counter(c["selected_method"] for c in cells if c["status"] == "baseline_estimate")
    readme = (ROOT / "README.md").read_text()
    assert f"{validated} validated models, {sum(baseline.values())} baseline fallbacks" in readme
    assert f"**{validated}** (" in readme and f"**{sum(baseline.values())}** ({baseline['persistence']} persistence, " \
        f"{baseline['rolling_mean_7d']} 7-day mean)" in readme


def test_backend_frontend_handoff_counts_and_matrix_match_the_policy():
    from src.config import ROOT
    cells = read_policy()["cells"]
    validated = [k for k, c in cells.items() if c["status"] == "validated_model"]
    text = (ROOT / "docs/BACKEND_FRONTEND_HANDOFF.md").read_text()
    n_base = len(cells) - len(validated)
    assert f"**{len(validated)} of {len(cells)} cells are validated models, {n_base} are baselines**" in text
    # every table row marks exactly the validated horizons with **model**
    for line in text.splitlines():
        for commodity in ("Onion", "Tomato", "Brinjal", "Cabbage", "Cauliflower"):
            if line.startswith(f"| {commodity} ("):
                marks = [c.strip().startswith("**model**") for c in line.strip("|").split("|")[1:]]
                expected = [cells[f"{commodity}|{k}"]["status"] == "validated_model"
                            for k in sorted({key.split('|', 1)[1] for key in cells if key.startswith(commodity + "|")},
                                            key=lambda s: int(s.split("|")[1]))]
                assert marks == expected, f"{commodity}: documented {marks} != policy {expected}"

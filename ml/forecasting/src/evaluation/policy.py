"""Predefined model-approval policy and its on-disk representation.

`decide` is a pure function of evaluation results: a model is approved only if every criterion
in `ApprovalCriteria` passes; otherwise the strongest baseline (chosen on validation data) is
served. No criterion is ever relaxed per commodity.
"""

import json
import math
from pathlib import Path

from src import config
from src.config import ApprovalCriteria
from src.errors import PolicyError
from src.models.candidates import MODEL_NAMES


def decide(cell: dict, criteria: ApprovalCriteria = config.CRITERIA) -> dict:
    """Return the serving decision for one evaluated cell (see backtest.evaluate_cell)."""
    methods = cell.get("methods", {})
    base_name = cell.get("best_baseline")
    if not methods or base_name is None:
        return {
            "status": "baseline_estimate", "selected_method": "persistence",
            "best_baseline": "persistence", "experimental_candidate": None,
            "failed_criteria": ["insufficient data to evaluate any validation fold"],
            "checks": {},
        }
    candidates = {m: methods[m] for m in MODEL_NAMES if m in methods}
    best_name = min(candidates, key=lambda m: candidates[m]["val"]["mae"])
    base, cand = methods[base_name], candidates[best_name]
    n_folds = len(cell["folds_used"])

    improvement = 100.0 * (base["val"]["mae"] - cand["val"]["mae"]) / base["val"]["mae"]
    needed_folds = max(criteria.min_valid_folds,
                       math.ceil(criteria.min_folds_won_fraction * n_folds))
    ci_high = cand["val_mae_diff_ci95"][1]
    checks = {
        "improvement_pct": (improvement, improvement >= criteria.min_improvement_pct),
        "folds_won": (cand["folds_won_vs_baseline"],
                      n_folds >= criteria.min_valid_folds
                      and cand["folds_won_vs_baseline"] >= needed_folds),
        "ci_excludes_zero": (ci_high,
                             (not criteria.require_ci_excludes_zero)
                             or (not math.isnan(ci_high) and ci_high < 0)),
        "holdout_available": (cand.get("n_holdout", 0),
                              cand.get("n_holdout", 0) >= criteria.min_holdout_rows),
    }
    if "holdout" in cand:
        hold_better = cand["holdout"]["mae"] < base["holdout"]["mae"]
        checks["holdout_mae_better"] = (
            cand["holdout"]["mae"] - base["holdout"]["mae"],
            hold_better or not criteria.require_holdout_mae_better,
        )
        rmse_ok = (cand["val"]["rmse"] <= base["val"]["rmse"]
                   and cand["holdout"]["rmse"] <= base["holdout"]["rmse"])
        checks["rmse_not_worse"] = (None, rmse_ok or not criteria.require_rmse_not_worse)
    else:
        checks["holdout_mae_better"] = (None, False)
        checks["rmse_not_worse"] = (None, False)

    failed = [name for name, (_, ok) in checks.items() if not ok]
    approved = not failed
    return {
        "status": "validated_model" if approved else "baseline_estimate",
        "selected_method": best_name if approved else base_name,
        "best_baseline": base_name,
        "experimental_candidate": None if approved else best_name,
        "failed_criteria": failed,
        "checks": {k: {"value": v, "passed": bool(ok)} for k, (v, ok) in checks.items()},
    }


def cell_policy_entry(cell: dict, decision: dict) -> dict:
    """Compact, serving-oriented record stored in the policy file."""
    methods = cell["methods"]
    base = methods.get(decision["best_baseline"], {})
    chosen = methods.get(decision["selected_method"], {})
    cand_name = decision["experimental_candidate"] or (
        decision["selected_method"] if decision["status"] == "validated_model" else None
    )
    cand = methods.get(cand_name, {}) if cand_name else {}

    def pick(entry, key, sub):
        return entry.get(key, {}).get(sub)

    return {
        "status": decision["status"],
        "selected_method": decision["selected_method"],
        "baseline_method": decision["best_baseline"],
        "experimental_candidate": decision["experimental_candidate"],
        "failed_criteria": decision["failed_criteria"],
        "n_validation": chosen.get("n_val") or base.get("n_val"),
        "n_holdout": base.get("n_holdout"),
        "n_train_final": cell["n_train_final"],
        "baseline_validation_mae": pick(base, "val", "mae"),
        "baseline_holdout_mae": pick(base, "holdout", "mae"),
        "candidate_method": cand_name,
        "candidate_validation_mae": pick(cand, "val", "mae"),
        "candidate_holdout_mae": pick(cand, "holdout", "mae"),
        "selected_validation_mae": pick(chosen, "val", "mae"),
        "selected_holdout_mae": pick(chosen, "holdout", "mae"),
    }


def json_safe(obj):
    """Recursively convert numpy scalars / NaN / inf so output is strict JSON."""
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if hasattr(obj, "item") and not isinstance(obj, (str, bytes)):
        obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


def write_policy(path: Path, entries: dict, evaluated_through: str, extra: dict) -> None:
    payload = {
        "policy_compat_version": config.POLICY_COMPAT_VERSION,
        "evaluated_through": evaluated_through,
        "criteria": config.CRITERIA.__dict__,
        "protocol": {
            "validation_folds": config.VALIDATION_FOLDS,
            "holdout_start": config.HOLDOUT_START,
            "horizons": list(config.HORIZONS),
        },
        **extra,
        "cells": entries,
    }
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(json_safe(payload), indent=2, sort_keys=True, allow_nan=False) + "\n")


def cell_key(commodity: str, market: str, horizon: int) -> str:
    return f"{commodity}|{market}|{horizon}"


def read_policy(path: Path = None) -> dict:
    path = Path(path or config.POLICY_PATH)
    if not path.exists():
        raise PolicyError(
            f"Forecast policy not found: {path}. Run `python run_pipeline.py evaluate`."
        )
    policy = json.loads(path.read_text())
    if policy.get("policy_compat_version") != config.POLICY_COMPAT_VERSION:
        raise PolicyError(
            "Forecast policy was produced by an incompatible feature/model configuration "
            f"(policy v{policy.get('policy_compat_version')}, code v{config.POLICY_COMPAT_VERSION}). "
            "Re-run evaluation."
        )
    return policy

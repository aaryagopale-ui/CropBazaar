# Integration guide (backend / frontend)

The integration boundary is **one function / one CLI** that returns strict JSON. No server, database or
pickled model is required; everything it needs is versioned in this directory.

## Setup

See the module README for the environment (`ml/.venv`, `ml/requirements.txt`). The Python package is named `src` and lives in
`ml/forecasting/`, so that directory must be importable (on `sys.path`, or the working directory):

```python
import sys
sys.path.insert(0, "<repo>/ml/forecasting")
from src.forecasting.predict import forecast
```

The FastAPI example and the frontend flow are in [BACKEND_FRONTEND_HANDOFF.md](BACKEND_FRONTEND_HANDOFF.md).

## Calling it

**Python (recommended)**

```python
from src.forecasting.predict import forecast
from src.errors import ForecastError

try:
    result = forecast("Onion", market=None, horizons=range(1, 8))   # market optional -> default market
except ForecastError as exc:
    payload = exc.to_dict()          # {"code": "...", "message": "..."}
```

**Any language (subprocess, stdout = JSON)**

```bash
python run_pipeline.py forecast --commodity Onion --horizons 1-7          # exit code 0
python run_pipeline.py forecast --commodity Onion --horizons 12           # exit code 2, JSON {"error": ...}
```

| Parameter | Meaning |
|---|---|
| `commodity` | Onion, Tomato, Brinjal, Cabbage, Cauliflower (case-insensitive) |
| `market` | optional; must be the supported market for that commodity (see README) |
| `horizons` | `1`–`7`; int, list, `range`, or string `"1-7"`, `"1,3,7"` |
| `as_of` | optional date; ignore later observations ("what would we have forecast then") |
| `reference_date` | optional "today" for freshness checks (default: `as_of`, else today) |
| `include_experimental` | also return the best *non-approved* model under `experimental` |
| `strict` | raise `MODEL_FAILURE` instead of falling back to the baseline if an approved model fails |

## Request and response schema

**Request** (`forecast(...)` arguments; CLI flags are the same names with `--` and dashes):
see the parameter table above. Required: `commodity`. Defaults: `market` = the supported market, `horizons` = 1-7.

**Response**: one JSON object. Field types: `string`, `number`, `integer`, `array`, `object`; "or null" means
the value can be null. Dates are ISO `YYYY-MM-DD`; all prices are Rs./Quintal.

### Top level

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | string | `"1.0"`; changes if fields are removed or renamed |
| `commodity` | string | canonical name: Onion, Tomato, Brinjal, Cabbage or Cauliflower |
| `market` | string | canonical market name |
| `price_unit` | string | always `Rs./Quintal` |
| `forecast_origin` | string | date the forecasts start from = latest observation used |
| `last_observed_date` | string | same as `forecast_origin` (kept explicit for clients) |
| `last_observed_price` | number | modal price on that date |
| `reference_date` | string | "today" used for freshness checks |
| `data_age_days` | integer | `reference_date - last_observed_date` |
| `policy` | object | evaluation the approvals come from (below) |
| `warnings` | array | series-level warnings (below) |
| `forecasts` | array | one element per requested horizon, ascending |
| `disclaimer` | string | text to show with forecasts |

### policy

| Field | Type | Meaning |
|---|---|---|
| `evaluated_through` | string | last data date used in the evaluation |
| `policy_compat_version` | integer | code/policy compatibility version |

### forecasts[]

| Field | Type | Meaning |
|---|---|---|
| `horizon_days` | integer | 1-7 |
| `target_date` | string | exactly `forecast_origin + horizon_days` |
| `prediction` | number | point estimate for that date |
| `price_unit` | string | `Rs./Quintal` |
| `method` | string | `persistence`, `rolling_mean_7d`, `ridge_core` or `ridge_extended` |
| `status` | string | `validated_model` or `baseline_estimate` |
| `validation` | object | evidence behind the label (below) |
| `warnings` | array | warnings for this horizon |
| `experimental` | object | **optional**; only with `include_experimental` and only for non-approved cells |

### forecasts[].validation

| Field | Type | Meaning |
|---|---|---|
| `policy_status` | string | same as the parent `status` unless a failure forced a fallback |
| `selected_method` | string | method the policy approved for this cell |
| `baseline_method` | string | strongest baseline on validation data |
| `n_validation` | integer or null | validation rows |
| `n_holdout` | integer or null | holdout rows |
| `baseline_validation_mae` | number or null | baseline MAE on validation folds |
| `baseline_holdout_mae` | number or null | baseline MAE on the untouched holdout |
| `selected_validation_mae` | number or null | selected method's validation MAE |
| `selected_holdout_mae` | number or null | selected method's holdout MAE |
| `failed_criteria` | array | approval criteria the best model failed (empty when validated) |

### forecasts[].experimental (optional)

| Field | Type | Meaning |
|---|---|---|
| `status` | string | always `experimental` (not approved; do not present as a forecast) |
| `method` | string | candidate model |
| `not_approved_because` | array | failed approval criteria |
| `validation_mae` | number or null | candidate's validation MAE |
| `holdout_mae` | number or null | candidate's holdout MAE |
| `warnings` | array | warnings from fitting/predicting the candidate |
| `prediction` | number | candidate estimate (absent if it failed) |

### warnings[] (series-level and per-horizon)

| Field | Type | Meaning |
|---|---|---|
| `code` | string | machine-readable code (see Warnings below) |
| `message` | string | human-readable text |

### Error (exception `.to_dict()`, or CLI stdout with exit code 2)

`{"error": {"code": "<CODE>", "message": "<text>"}}`; codes are listed under Errors below.

## Response (real output, `Cauliflower`, horizon 7, reference date 2026-10-09)

Requested horizons each get their own entry with their own `target_date`. `status` tells the frontend how
much to trust a number:

* `validated_model` – a model that passed the predefined approval policy for this commodity and horizon.
* `baseline_estimate` – no model passed; the best baseline on validation data is served
  (`method` = `persistence` or `rolling_mean_7d`).
* `experimental` objects (only when requested) are **not** approved; show them as such or not at all.

```json
{
  "schema_version": "1.0",
  "commodity": "Cauliflower",
  "market": "APMC Nasik",
  "price_unit": "Rs./Quintal",
  "forecast_origin": "2026-10-06",
  "last_observed_date": "2026-10-06",
  "last_observed_price": 1250.0,
  "reference_date": "2026-10-09",
  "data_age_days": 3,
  "policy": {
    "evaluated_through": "2026-10-06",
    "policy_compat_version": 1
  },
  "warnings": [],
  "forecasts": [
    {
      "horizon_days": 7,
      "target_date": "2026-10-13",
      "prediction": 1085.87,
      "price_unit": "Rs./Quintal",
      "method": "ridge_extended",
      "status": "validated_model",
      "validation": {
        "policy_status": "validated_model",
        "selected_method": "ridge_extended",
        "baseline_method": "rolling_mean_7d",
        "n_validation": 381,
        "n_holdout": 163,
        "baseline_validation_mae": 402.26191101112363,
        "baseline_holdout_mae": 254.88716038562666,
        "selected_validation_mae": 363.5514281262994,
        "selected_holdout_mae": 232.6705174689372,
        "failed_criteria": []
      },
      "warnings": []
    }
  ],
  "disclaimer": "Statistical estimate from historical mandi prices; not guaranteed. Target dates without a market report have no published price. Each horizon is selected and fitted independently, so the sequence is a set of separate per-day estimates, not a smooth price trajectory."
}
```

### Baseline cell with an experimental candidate (Onion, horizon 7)

```json
{
  "schema_version": "1.0",
  "commodity": "Onion",
  "market": "Lasalgaon(Vinchur)",
  "price_unit": "Rs./Quintal",
  "forecast_origin": "2026-10-06",
  "last_observed_date": "2026-10-06",
  "last_observed_price": 3600.0,
  "reference_date": "2026-10-09",
  "data_age_days": 3,
  "policy": {
    "evaluated_through": "2026-10-06",
    "policy_compat_version": 1
  },
  "warnings": [],
  "forecasts": [
    {
      "horizon_days": 7,
      "target_date": "2026-10-13",
      "prediction": 3600.0,
      "price_unit": "Rs./Quintal",
      "method": "persistence",
      "status": "baseline_estimate",
      "validation": {
        "policy_status": "baseline_estimate",
        "selected_method": "persistence",
        "baseline_method": "persistence",
        "n_validation": 290,
        "n_holdout": 136,
        "baseline_validation_mae": 151.31193103448277,
        "baseline_holdout_mae": 192.51264705882355,
        "selected_validation_mae": 151.31193103448277,
        "selected_holdout_mae": 192.51264705882355,
        "failed_criteria": [
          "improvement_pct",
          "folds_won",
          "ci_excludes_zero",
          "rmse_not_worse"
        ]
      },
      "warnings": [],
      "experimental": {
        "status": "experimental",
        "method": "ridge_extended",
        "not_approved_because": [
          "improvement_pct",
          "folds_won",
          "ci_excludes_zero",
          "rmse_not_worse"
        ],
        "validation_mae": 151.7738029781576,
        "holdout_mae": 188.5205870136982,
        "warnings": [],
        "prediction": 3509.65
      }
    }
  ],
  "disclaimer": "Statistical estimate from historical mandi prices; not guaranteed. Target dates without a market report have no published price. Each horizon is selected and fitted independently, so the sequence is a set of separate per-day estimates, not a smooth price trajectory."
}
```

`validation` contains the evidence behind the label: MAE of the served method and of its baseline on
validation folds and on the untouched holdout, with sample counts. These are historical errors in
Rs./quintal, **not** prediction intervals.

## Errors

Every failure raises a `ForecastError` subclass (Python) or prints `{"error": {"code", "message"}}` and exits with
code 2 (CLI). Nothing is swallowed silently.

| `code` | When |
|---|---|
| `UNSUPPORTED_COMMODITY` / `UNSUPPORTED_MARKET` | not one of the five evaluated series |
| `INVALID_HORIZON` | not an integer 1–7 (e.g. `0`, `8`, `3.5`, `"abc"`) |
| `INVALID_DATE` | unparsable `as_of` / `reference_date`, or `reference_date` before the latest observation |
| `STALE_DATA` | latest observation more than 14 days before the reference date |
| `INSUFFICIENT_HISTORY` | fewer than 14 calendar days of history, or too few labelled rows to fit |
| `DATA_UNAVAILABLE` | series file missing/malformed or no rows for the series |
| `POLICY_UNAVAILABLE` | `artifacts/forecast_policy.json` missing or from an incompatible code version |
| `MODEL_FAILURE` | approved model failed and `strict=True` |

## Warnings (non-fatal, in `warnings` arrays)

`STALE_DATA` (>3 days old; forecasts are anchored on the latest observation date, not today),
`TARGET_NOT_IN_FUTURE` (origin + h is not after the reference date, which happens when data lags),
`TARGET_WEEKDAY_RARELY_REPORTED` (e.g. Onion on Sundays: no price may be published that day),
`LAST_OBSERVATION_ANOMALOUS` (last price >2x or <0.5x the previous-14-day median: possible bad print),
`MISSING_FEATURES_IMPUTED`, `MODEL_FAILURE_FALLBACK` (an approved model failed; baseline served and the
reason is included), `POLICY_STALE` (data much newer than the last evaluation: re-run it).

## Keeping it current

1. Replace `data/raw/mandi_data.csv` (AGMARKNET export) and `data/raw/nashik_historical_weather.csv`.
2. `python run_pipeline.py prepare` → rewrites `data/series/*.csv` (the versioned inputs).
3. `python run_pipeline.py evaluate` → re-runs every backtest (≈35 s), rewrites `reports/` and the policy.
   Model approvals are *data-dependent*: always re-run after refreshing data, and review `git diff reports/`.
4. `python -m pytest`.

Models are refit from `data/series/` on the first call per process (≈0.3 s for 7 horizons) and cached.
All default paths are resolved from the package location, so the working directory does not matter; the repo root only needs to be importable (install it as a path dependency or set `PYTHONPATH=<repo>`). Override with `series_path` / `weather_path` / `policy_path` if you store data elsewhere.

**Freshness:** with no `reference_date`, "today" is the system date, and the call raises `STALE_DATA` once the latest observation is more than 14 days old. Refresh the data (steps above) on a schedule.

## Presenting the 7 values

Horizons are evaluated, approved and fitted **independently**. A series can therefore mix methods
(e.g. Brinjal: ridge for days 1–3, a 7-day mean for day 4, ridge for day 5, persistence for days 6–7) and
need not be monotone or smooth. Show each day as its own estimate with its `status` label; do not
interpolate or draw it as a continuous price path.

## Contract guarantees and non-guarantees

* The origin is always the latest observation; the response states it (`forecast_origin`,
  `last_observed_date`, `data_age_days`). `schema_version` changes if fields are removed/renamed.
* Predictions are point estimates in Rs./quintal for a single market's *modal* price.
* Not guaranteed: accuracy, that a market reports on the target date, or that approvals persist after new data.

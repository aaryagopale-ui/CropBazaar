# Backend and frontend handoff

How the forecasting module in `ml/forecasting/` is meant to be consumed. **Status of each piece:**

| Piece | Status |
|---|---|
| `forecast()` Python function and `run_pipeline.py forecast` CLI | **Implemented and tested** (`tests/`) |
| `examples/fastapi_integration.py` (FastAPI router + `/supported`) | **Example only. Not wired into `backend/`.** Tested with its own tests, a live `uvicorn` run, and by copying the router into a throwaway copy of `backend/app/` |
| Backend endpoint in `backend/app/` | **Not done.** The backend teammate adds it (steps below) |
| Frontend calls | **Not done.** Sample consumer code below (the JavaScript was run with Node against the example server; the Vite proxy snippet was not run) |

```
frontend (React/Vite)  ->  existing FastAPI backend  ->  ml/forecasting  forecast()  ->  JSON
   fetch("/api/forecast/Onion?horizons=1-7")      calls the Python function in-process
```
The frontend must never call the Python module directly; it only talks to the backend.

## 1. Backend teammate: add the endpoint

1. **Dependencies.** The backend environment must be able to import the ML libraries:
   `pip install -r ml/requirements.txt` (numpy, pandas, scikit-learn, xgboost). The team README keeps `backend/.venv` and
   `ml/.venv` separate; either install `ml/requirements.txt` into the backend venv, or run the backend from `ml/.venv`
   with `pip install -r backend/requirements.txt` added. No other runtime package is needed.
2. **Copy the router** (from the repository root):
   ```bash
   cp ml/forecasting/examples/fastapi_integration.py backend/app/forecast_router.py
   ```
   In the copy, (a) change the path line to `ML_FORECASTING_DIR = Path(__file__).resolve().parents[2] / "ml" / "forecasting"`
   and (b) delete everything from `app = FastAPI(` to the end of the file (the standalone app and its CORS middleware).
3. **Include it** in `backend/app/main.py`:
   ```python
   from fastapi import FastAPI
   from .forecast_router import router

   app = FastAPI(title="CropBazaar API")
   app.include_router(router)
   ```
4. **CORS** (browser calls from the Vite dev server on a different port) either add
   `CORSMiddleware(allow_origins=["http://localhost:5173"])` to the backend, or use the Vite proxy in section 3.
5. **Run:** `cd backend && uvicorn app.main:app --reload`, then open `http://127.0.0.1:8000/docs`.

Endpoints in the router:

| Method and path | Purpose |
|---|---|
| `GET /api/forecast/supported` | commodities, their markets, horizons and the price unit (for dropdowns) |
| `GET /api/forecast/{commodity}?market=&horizons=1-7` | separate exact-date forecasts per horizon; `horizons` accepts `7`, `1-7` or `1,3,7` |

Error mapping used by the router (body is always `{"detail": {"code", "message"}}`):
`UNSUPPORTED_COMMODITY` / `UNSUPPORTED_MARKET` -> 404; `INVALID_HORIZON` / `INVALID_DATE` -> 400;
`STALE_DATA` / `INSUFFICIENT_HISTORY` / `DATA_UNAVAILABLE` / `POLICY_UNAVAILABLE` -> 503; `MODEL_FAILURE` -> 500.

Notes: the endpoint functions are plain `def` so FastAPI runs them in its thread pool. The first call per commodity and
horizon fits the model (about 0.3 s for all seven horizons) and caches it in memory; later calls take about 0.06 s.
The router deliberately does not expose `include_experimental`, `strict` or `as_of`.

### The actual Python interface

```python
from src.forecasting.predict import forecast      # `src` is this module's package name; ml/forecasting must be on sys.path
from src.errors import ForecastError              # .code (string) and .to_dict() -> {"code", "message"}

forecast(commodity: str, market: str = None, horizons=(1, 2, 3, 4, 5, 6, 7), *, as_of=None, reference_date=None, include_experimental: bool = False, strict: bool = False, series_path: Path = None, weather_path: Path = None, policy_path: Path = None) -> dict
```
Full parameter table, response schema, error codes and warning codes: [INTEGRATION.md](INTEGRATION.md).

## 2. What the response looks like (real output)

`GET /api/forecast/Cauliflower?horizons=1,4` from the running example server (reference date 2026-10-09):

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
      "horizon_days": 1,
      "target_date": "2026-10-07",
      "prediction": 1171.01,
      "price_unit": "Rs./Quintal",
      "method": "ridge_extended",
      "status": "validated_model",
      "validation": {
        "policy_status": "validated_model",
        "selected_method": "ridge_extended",
        "baseline_method": "persistence",
        "n_validation": 392,
        "n_holdout": 171,
        "baseline_validation_mae": 271.4362244897959,
        "baseline_holdout_mae": 160.06432748538012,
        "selected_validation_mae": 245.33961445041191,
        "selected_holdout_mae": 151.07239012587542,
        "failed_criteria": []
      },
      "warnings": [
        {
          "code": "TARGET_NOT_IN_FUTURE",
          "message": "Target date 2026-10-07 is not after 2026-10-09."
        }
      ]
    },
    {
      "horizon_days": 4,
      "target_date": "2026-10-10",
      "prediction": 1193.57,
      "price_unit": "Rs./Quintal",
      "method": "rolling_mean_7d",
      "status": "baseline_estimate",
      "validation": {
        "policy_status": "baseline_estimate",
        "selected_method": "rolling_mean_7d",
        "baseline_method": "rolling_mean_7d",
        "n_validation": 381,
        "n_holdout": 166,
        "baseline_validation_mae": 352.0105674290714,
        "baseline_holdout_mae": 217.51269363166955,
        "selected_validation_mae": 352.0105674290714,
        "selected_holdout_mae": 217.51269363166955,
        "failed_criteria": [
          "ci_excludes_zero"
        ]
      },
      "warnings": []
    }
  ],
  "disclaimer": "Statistical estimate from historical mandi prices; not guaranteed. Target dates without a market report have no published price. Each horizon is selected and fitted independently, so the sequence is a set of separate per-day estimates, not a smooth price trajectory."
}
```

Reading it: `status` is `validated_model` for horizon 1 (ridge passed the approval policy) and `baseline_estimate` for
horizon 4 (a 7-day mean was served because no model passed for that cell). `validation` gives the historical errors behind
the label in Rs./quintal. `TARGET_NOT_IN_FUTURE` appears because the data ends on 2026-10-06 and the reference date is
2026-10-09.

An error (`GET /api/forecast/Mango`, HTTP 404):

```json
{
  "detail": {
    "code": "UNSUPPORTED_COMMODITY",
    "message": "Unsupported commodity 'Mango'. Supported: ['Brinjal', 'Cabbage', 'Cauliflower', 'Onion', 'Tomato']"
  }
}
```

### Which horizons use a validated model and which use a baseline (from `artifacts/forecast_policy.json`)

| Commodity (market) | h1 | h2 | h3 | h4 | h5 | h6 | h7 |
|---|---|---|---|---|---|---|---|
| Onion (Lasalgaon(Vinchur)) | baseline: last price | baseline: last price | baseline: last price | baseline: last price | baseline: last price | baseline: last price | baseline: last price |
| Tomato (APMC Pimpalgaon Baswant) | baseline: last price | baseline: last price | baseline: last price | baseline: last price | baseline: last price | baseline: last price | baseline: 7-day mean |
| Brinjal (APMC Nasik) | **model** (ridge) | **model** (ridge) | **model** (ridge) | baseline: 7-day mean | **model** (ridge) | baseline: last price | baseline: last price |
| Cabbage (APMC Nasik) | baseline: last price | baseline: 7-day mean | baseline: 7-day mean | baseline: 7-day mean | baseline: 7-day mean | baseline: 7-day mean | baseline: last price |
| Cauliflower (APMC Nasik) | **model** (ridge) | **model** (ridge) | **model** (ridge) | baseline: 7-day mean | **model** (ridge) | **model** (ridge) | **model** (ridge) |

**10 of 35 cells are validated models, 25 are baselines** (17 last-price, 8 seven-day mean). Show the `status` label to
users; a `baseline_estimate` means "last known or recent average price", not a model forecast.

## 3. Frontend flow

Call the backend endpoint, branch on `status`, and show the warnings. This consumer ran with Node 24 against the example
server (`CROPBAZAAR_FORECAST_REFERENCE_DATE=2026-10-09`):

```js
const BASE = import.meta.env?.VITE_API_BASE ?? "";          // "" when using the Vite proxy below

export async function loadForecast(commodity, horizons = "1-7", market) {
  const params = new URLSearchParams({ horizons });
  if (market) params.set("market", market);
  const res = await fetch(`${BASE}/api/forecast/${encodeURIComponent(commodity)}?${params}`);
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.detail?.message ?? res.statusText), { code: body.detail?.code, http: res.status });
  return body;                                                // shape: INTEGRATION.md "Request and response schema"
}

const label = (f) => (f.status === "validated_model" ? "Model forecast" : "Baseline estimate");
```

Observed output of that consumer for Cauliflower: `2026-10-07  1171 Rs./Quintal  [Model forecast: ridge_extended]` ... and for an
unknown commodity `ERROR http=404 code=UNSUPPORTED_COMMODITY`.

Dev proxy (not run; add to `frontend/vite.config.js` if you do not want to configure CORS):
`server: { proxy: { "/api": "http://127.0.0.1:8000" } }`.

UI rules that follow from the contract:
* Show `last_observed_date` and `data_age_days`. Forecasts start from the last observation, not from today.
* Label each day with its `status`; never present a `baseline_estimate` as a model forecast.
* Each horizon is chosen independently, so the seven values are separate daily estimates. **Do not draw them as a smooth
  trend line**, and do not interpolate.
* Display `warnings` (`STALE_DATA`, `TARGET_WEEKDAY_RARELY_REPORTED`, `LAST_OBSERVATION_ANOMALOUS`, ...). Onion is never
  reported on Sundays, so that day may have no published price.
* Prices are Rs./Quintal modal prices for one market per commodity.

## 4. Data freshness and demo day

The versioned data ends on **2026-10-06**. Without a reference date the module treats "today" as the system date and
raises `STALE_DATA` when the data is more than 14 days old: calls succeed through 2026-10-20 and **fail from 2026-10-21**.
For a demo after that, set `CROPBAZAAR_FORECAST_REFERENCE_DATE=2026-10-09` (any date from 2026-10-06 to 2026-10-20) for the
backend process and show `last_observed_date` in the UI. Refreshing the data needs the raw AGMARKNET and weather files
(not in git; see the module README) and `python run_pipeline.py prepare` then `evaluate`.

## 5. Remaining work for the teammates

* Backend: add the router (section 1), CORS or proxy, and decide how the ML dependencies reach the backend environment.
* Frontend: build the forecast view on `/api/forecast/{commodity}` and `/api/forecast/supported`.
* Everyone: agree on a data-refresh owner (raw files are not versioned) and on whether to rename the package `src` to
  `cropbazaar_ml` (the layout the scaffold's `ml/src/cropbazaar_ml/` hints at). It needs import and path edits, so it was left
  for a follow-up.
* Not covered: authentication, rate limiting, deployment, Python 3.10-3.12 (untested), model retraining on new data.

## 6. Limitations

About 2.7 years of data from a single market per commodity; scores cover dates with a recorded price only; some approvals
could be chance (35 cells x 6 candidate models); the source has isolated bad prints that can distort baselines; point
estimates only (the MAE numbers are historical errors, not prediction intervals); no guarantee of future accuracy.
See the module README for the evaluation protocol and results.

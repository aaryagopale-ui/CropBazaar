# CropBazaar ML: price forecasting module (`ml/forecasting`)

ML forecasting for CropBazaar: **1–7 calendar-day modal-price forecasts** for five Nashik-region
vegetables. A predefined approval policy serves a model *only* where it demonstrably beats the best simple
baseline on held-out data; everywhere else a baseline is served and labelled as such.

| Commodity | Market |
|---|---|
| Onion | Lasalgaon(Vinchur) |
| Tomato | APMC Pimpalgaon Baswant |
| Brinjal, Cabbage, Cauliflower | APMC Nasik |

Prices are AGMARKNET modal prices in **Rs./Quintal**, 2024-01-01 → 2026-10-06.

## Setup (inside the CropBazaar monorepo)

This module lives in `ml/forecasting/` and uses the ML workspace's shared environment and `ml/requirements.txt`
(numpy, pandas, scikit-learn, xgboost). It needs **no extra runtime dependency**; `joblib` comes with scikit-learn.
The team README asks for Python 3.10+. This module was tested on **Python 3.13 and 3.14** (3.10–3.12 not run;
a static check found no syntax newer than 3.10) with the newest versions allowed by `ml/requirements.txt`.

```bash
# from the repository root
cd ml
python3 -m venv .venv && source .venv/bin/activate     # ml/.venv is already git-ignored
pip install -r requirements.txt                        # the team's ML dependencies
pip install -r forecasting/requirements-dev.txt        # adds pytest (+ fastapi/httpx for the example's test)

cd forecasting                                         # every command below runs from ml/forecasting/
python -m pytest                                       # 87 tests, ~10 s
python run_pipeline.py forecast --commodity Onion --horizons 1-7     # JSON forecast
python run_pipeline.py evaluate                        # reproduce every backtest (~35 s) -> reports/ + artifacts/
```

Use from Python (see [docs/INTEGRATION.md](docs/INTEGRATION.md) for the full contract and error codes, and
[docs/BACKEND_FRONTEND_HANDOFF.md](docs/BACKEND_FRONTEND_HANDOFF.md) for the FastAPI example and the frontend flow):

```python
import sys; sys.path.insert(0, "<repo>/ml/forecasting")      # makes the package `src` importable
from src.forecasting.predict import forecast
result = forecast("Cauliflower", horizons=range(1, 8))
```

**Library versions.** `reports/` and `artifacts/forecast_policy.json` were produced with pandas 3.0.6 / xgboost 3.4.1.
Re-running `evaluate` under the team's ranges (pandas 2.3.3, xgboost 2.1.4) gives identical serving decisions
(the same 10 validated cells); only the XGBoost rows of `reports/fold_results.csv` and `reports/method_comparison.csv`
change, because xgboost 2.x builds different trees. XGBoost is not approved in any cell.

## Data requirements

**Needed to run forecasts, evaluation and tests (versioned, ≈350 KB, nothing else required):**

| File | Content |
|---|---|
| `data/series/price_series.csv` | 4,325 rows: `commodity, market, date, modal_price, price_unit, arrival_quantity, arrival_unit` for the 5 supported series |
| `data/series/nashik_weather_daily.csv` | 1,010 daily rows of Nashik weather (temperature, precipitation, humidity) |
| `artifacts/forecast_policy.json` | which method is served per commodity/horizon, with its validation evidence |

**Needed only to refresh the data (not versioned, ~4 MB):** place these in `data/raw/`, then run
`python run_pipeline.py prepare` followed by `python run_pipeline.py evaluate`:

* `mandi_data.csv`: AGMARKNET "All Type of Report (All Grades)" CSV export (one title line, then the header
  `State/UT, District, Market, Commodity Group, Commodity, Date (dd-mm-YYYY), Arrival Quantity …, Arrival Unit,
  Modal Price …, Price Unit`). It must contain all five supported commodity/market pairs, priced in Rs./Quintal;
  `prepare` stops with an explicit error otherwise.
* `nashik_historical_weather.csv`: daily weather in Open-Meteo export format (3 metadata lines, then the header
  `time, temperature_2m_mean (°C), temperature_2m_max (°C), temperature_2m_min (°C), precipitation_sum (mm),
  rain_sum (mm), precipitation_hours (h), relative_humidity_2m_mean (%)`), here for 20.0°N 73.8°E.

Models are **not** pickled. The approved model is refit deterministically from `data/series/` on first use
(about 0.3 s for all seven horizons, ~0.06 s afterwards) with exactly the training code and cached in-process.

**Freshness:** forecasts anchor on the latest observation. If it is more than 3 days old a `STALE_DATA` warning
is returned; more than 14 days old (relative to `reference_date`, default today) raises `STALE_DATA`. With the
current data (last observation 2026-10-06) calls without `reference_date` start failing on 2026-10-21. Refresh the
data, or pass `reference_date=` explicitly and display `last_observed_date` to users.

## Forecast contract

* **Forecast origin** = the latest observation of the series (`as_of` truncates it for what-if runs).
* **Horizons** 1–7 days; each has its **own** exact target date `origin + h` and its own prediction.
* **Targets** are the price recorded on *exactly* that date. If a market did not report that day, that example is
  excluded from training and scoring and counted (`targets_missing_market_day`); it is never replaced by a later date.
  At serving time the target date may simply have no published price (e.g. Onion never reports on Sundays; a warning says so).
* **Features** (`src/features/forecast_features.py`; one implementation for training, evaluation and serving):
  calendar-anchored lags ("last price observed on or before origin − k days", never "k-th previous record"),
  calendar-window means and dispersion, reporting gap/density, seasonality, same-day arrivals, and Nashik weather
  observed **up to the day before the origin**. Future weather is never used (no historical weather forecasts exist).
* **Status** of each returned forecast: `validated_model` (passed the policy) or `baseline_estimate`.
  A non-approved model appears only under `experimental`, and only if requested.

## Evaluation protocol (all numbers in `reports/EVALUATION.md`)

* Five purged expanding-window validation folds (2025-01 → 2026-03) plus an untouched final holdout from 2026-04-01.
* Eight methods on identical rows: persistence, 7-day rolling mean, and ridge / random forest / XGBoost, each of
  those on a `core` (16 features) and `extended` (21; adds arrivals and trailing weather) feature set.
  ML models predict `log(target / last price)`.
* Selection uses validation folds only. A model is approved for a commodity/horizon only if **all** hold:
  ≥ 2 % lower pooled validation MAE than the best baseline; wins ≥ 60 % of folds; the 95 % block-bootstrap CI of the
  MAE difference excludes 0; lower MAE on the holdout; RMSE not worse on validation or holdout.

## Results: 10 validated models, 25 baseline fallbacks (35 cells = 5 commodities × 7 horizons)

| Commodity | Validated model (ridge) | Baseline fallback |
|---|---|---|
| Onion | – | persistence: h1–h7 (7) |
| Tomato | – | persistence: h1–h6; 7-day mean: h7 (7) |
| Brinjal | **h1, h2, h3, h5** (4): h1 `ridge_core`, h2/h3/h5 `ridge_extended` | 7-day mean: h4; persistence: h6, h7 (3) |
| Cabbage | – | persistence: h1, h7; 7-day mean: h2–h6 (7) |
| Cauliflower | **h1, h2, h3, h5, h6, h7** (6), all `ridge_extended` | 7-day mean: h4 (1) |
| **Total** | **10** (9 `ridge_extended`, 1 `ridge_core`) | **25** (17 persistence, 8 7-day mean) |

On the untouched holdout the 10 validated models have 3–15 % lower MAE than the best baseline for their cell.
XGBoost and random forest were evaluated like every other method and passed the policy nowhere.
Typical holdout error of what is served is about 3–9 % of price for Onion and 12–28 % for the other four
(growing with horizon); see `reports/EVALUATION.md` for every cell.

Limitations: ~2.7 years of data; 35 cells × 6 candidate models means some approvals could be chance (the horizons of
one commodity are strongly correlated, so they are not independent confirmations); gains concentrate in large-error
days (the source contains isolated bad prints such as a single 10,000 Rs/q Cabbage day among ~1,250 prints);
scores cover only dates with a recorded price; each horizon is chosen independently, so a 7-day set can mix methods
and is **not** a smooth price trajectory. Past performance does not guarantee future accuracy.

## Layout

```
src/config.py                     supported series, horizons, protocol, approval criteria
src/data/series.py                raw export -> data/series/ ; loaders
src/features/forecast_features.py leak-free features (single implementation)
src/models/candidates.py          baselines + ridge / random forest / XGBoost
src/evaluation/backtest.py        purged folds, metrics, block bootstrap
src/evaluation/policy.py          approval decision + policy file I/O
src/evaluation/run_evaluation.py  reproduce evaluation -> reports/ + artifacts/forecast_policy.json
src/forecasting/predict.py        forecast() function and CLI   <- integration boundary
run_pipeline.py                   prepare | evaluate | forecast
tests/                            tests for features, backtests, policy, API, CLI, docs/schema, FastAPI example
examples/fastapi_integration.py   EXAMPLE FastAPI router (not wired into backend/)
data/series/  reports/  artifacts/   versioned inputs, evaluation outputs, serving policy
docs/INTEGRATION.md               forecast() / CLI contract, request/response schema, errors, warnings
docs/BACKEND_FRONTEND_HANDOFF.md  FastAPI example, frontend flow, remaining work
```

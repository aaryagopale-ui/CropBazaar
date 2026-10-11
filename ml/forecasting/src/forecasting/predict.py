"""Prediction interface: 1-7 calendar-day price forecasts for a supported commodity/market.

Python
------
    from src.forecasting.predict import forecast
    result = forecast("Onion", horizons=range(1, 8))

Command line (prints JSON; non-zero exit and a JSON error object on failure)
-----------------------------------------------------------------------------
    python -m src.forecasting.predict --commodity Onion --horizons 1-7

Contract
--------
* Forecast origin = the latest observation of the series (optionally truncated at `as_of`).
* Each horizon h has its own exact target date = origin + h calendar days and its own prediction.
* `status` is one of
    - "validated_model"   a model that passed the predefined approval policy for this
                          commodity/horizon (see reports/EVALUATION.md),
    - "baseline_estimate" no model passed; the best baseline from validation is served.
  A non-approved model is only ever returned under `experimental` and only when requested.
* Models are refit deterministically on all labelled history at serving time with exactly the
  training feature code and configuration, then cached in-process.
"""

import argparse
import json
import logging
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from src import config
from src.data.series import DataError, load_series, load_weather
from src.errors import (
    DataUnavailableError, ForecastError, InsufficientHistoryError, InvalidDateError,
    InvalidHorizonError, ModelFailureError, PolicyError, StaleDataError,
    UnsupportedCommodityError, UnsupportedMarketError,
)
from src.evaluation.policy import cell_key, json_safe, read_policy
from src.features.forecast_features import build_horizon_dataset, latest_origin_row
from src.models.candidates import build_forecaster

logger = logging.getLogger(__name__)


def resolve_series(commodity: str, market: str = None) -> tuple:
    """Validate and canonicalise (commodity, market). Case/whitespace-insensitive."""
    if not isinstance(commodity, str) or not commodity.strip():
        raise UnsupportedCommodityError("commodity must be a non-empty string")
    lookup = {c.lower(): c for c in config.SUPPORTED_SERIES}
    canonical = lookup.get(commodity.strip().lower())
    if canonical is None:
        raise UnsupportedCommodityError(
            f"Unsupported commodity '{commodity}'. Supported: {sorted(config.SUPPORTED_SERIES)}"
        )
    markets = config.SUPPORTED_SERIES[canonical]
    if market is None or not str(market).strip():
        return canonical, markets[0]
    by_name = {m.lower(): m for m in markets}
    resolved = by_name.get(str(market).strip().lower())
    if resolved is None:
        raise UnsupportedMarketError(
            f"Market '{market}' is not supported for {canonical}. Supported: {list(markets)}"
        )
    return canonical, resolved


def parse_horizons(horizons) -> list:
    """Accept an int, an iterable of ints, or a string like '1-7' / '1,3,7'."""
    invalid = InvalidHorizonError(f"Invalid horizons: {horizons!r}")
    try:
        if isinstance(horizons, str):
            values = []
            for token in horizons.split(","):
                token = token.strip()
                if "-" in token:
                    lo, hi = token.split("-", 1)
                    values.extend(range(int(lo), int(hi) + 1))
                elif token:
                    values.append(int(token))
        elif isinstance(horizons, (int, np.integer)) and not isinstance(horizons, bool):
            values = [int(horizons)]
        else:
            values = list(horizons)
        for v in values:
            if isinstance(v, bool) or (isinstance(v, (float, np.floating)) and v != int(v)):
                raise invalid
        values = [int(v) for v in values]
    except (TypeError, ValueError):
        raise invalid from None
    if not values:
        raise InvalidHorizonError("At least one horizon is required")
    bad = [h for h in values if h not in config.HORIZONS]
    if bad:
        raise InvalidHorizonError(
            f"Unsupported horizon(s) {bad}. Supported: {config.HORIZONS[0]}-{config.HORIZONS[-1]} days"
        )
    return sorted(set(values))


def _to_timestamp(value, name: str) -> pd.Timestamp:
    try:
        ts = pd.Timestamp(value)
    except (ValueError, TypeError):
        raise InvalidDateError(f"{name} is not a valid date: {value!r}") from None
    if pd.isna(ts):
        raise InvalidDateError(f"{name} is not a valid date: {value!r}")
    return ts.tz_localize(None).normalize() if ts.tzinfo else ts.normalize()


@lru_cache(maxsize=256)
def _fitted(commodity, market, horizon, method, data_key, series_path, weather_path):
    """Fit `method` on all labelled origins for this horizon (cached per data snapshot)."""
    series = _load_truncated(commodity, market, data_key[0], series_path)
    weather = load_weather(weather_path)
    dataset = build_horizon_dataset(series, weather, horizon)
    train = dataset[dataset["target_observed"]]
    if len(train) < config.MIN_TRAIN_ROWS:
        raise InsufficientHistoryError(
            f"Only {len(train)} labelled training rows for {commodity} h={horizon} "
            f"(need {config.MIN_TRAIN_ROWS})"
        )
    return build_forecaster(method).fit(train), int(len(train))


def _load_truncated(commodity, market, as_of_iso, series_path):
    try:
        series = load_series(commodity, market, series_path)
    except DataError as exc:
        raise DataUnavailableError(str(exc)) from exc
    if as_of_iso is not None:
        series = series[series["date"] <= pd.Timestamp(as_of_iso)]
    if series.empty:
        raise DataUnavailableError(f"No {commodity}/{market} observations on or before {as_of_iso}")
    return series.reset_index(drop=True)


def _series_warnings(series: pd.DataFrame, origin: pd.Timestamp, reference: pd.Timestamp) -> list:
    warnings = []
    age = (reference - origin).days
    if age > config.STALE_WARNING_DAYS:
        warnings.append({
            "code": "STALE_DATA",
            "message": f"Latest observation is {age} days old; forecasts are anchored on "
                       f"{origin.date()}, not on {reference.date()}.",
        })
    recent = series[(series["date"] < origin) & (series["date"] >= origin - pd.Timedelta(days=14))]
    last_price = float(series["modal_price"].iloc[-1])
    if len(recent) >= 3:
        median = float(recent["modal_price"].median())
        ratio = last_price / median
        if ratio > config.ANOMALY_RATIO or ratio < 1 / config.ANOMALY_RATIO:
            warnings.append({
                "code": "LAST_OBSERVATION_ANOMALOUS",
                "message": f"Last price {last_price:.0f} is {ratio:.2f}x the median of the previous "
                           "14 days (possible bad print); price-anchored forecasts are less reliable.",
            })
    return warnings


def _weekday_report_rate(series: pd.DataFrame, origin: pd.Timestamp, weekday: int) -> float:
    window = series[series["date"] > origin - pd.Timedelta(days=364)]
    days = pd.date_range(origin - pd.Timedelta(days=363), origin, freq="D")
    same = days[days.dayofweek == weekday]
    if len(same) == 0:
        return float("nan")
    return float(window["date"].isin(same).sum() / len(same))


def forecast(
    commodity: str,
    market: str = None,
    horizons=config.HORIZONS,
    *,
    as_of=None,
    reference_date=None,
    include_experimental: bool = False,
    strict: bool = False,
    series_path: Path = None,
    weather_path: Path = None,
    policy_path: Path = None,
) -> dict:
    """Return separate exact-date forecasts for each requested horizon (see module docstring).

    as_of           ignore observations after this date (what would have been forecast then)
    reference_date  "today" for freshness checks (default: as_of if given, else today's date)
    include_experimental  also attach the best non-approved model under `experimental`
    strict          raise instead of falling back to the baseline if an approved model fails
    Raises a `ForecastError` subclass (with a stable `.code`) for invalid input / unusable data.
    """
    commodity, market = resolve_series(commodity, market)
    horizon_list = parse_horizons(horizons)
    as_of_ts = _to_timestamp(as_of, "as_of") if as_of is not None else None
    if reference_date is not None:
        reference = _to_timestamp(reference_date, "reference_date")
    elif as_of_ts is not None:
        reference = as_of_ts  # historical what-if: freshness is judged as of that date
    else:
        reference = pd.Timestamp.today().normalize()
    series_path = Path(series_path or config.SERIES_PATH)
    weather_path = Path(weather_path or config.WEATHER_PATH)

    policy = read_policy(policy_path)
    series = _load_truncated(commodity, market, as_of_ts.isoformat() if as_of_ts is not None else None,
                             series_path)
    weather = load_weather(weather_path)
    origin = series["date"].iloc[-1]
    age_days = int((reference - origin).days)
    if age_days > config.STALE_ERROR_DAYS:
        raise StaleDataError(
            f"Latest {commodity}/{market} observation is {origin.date()} ({age_days} days before "
            f"{reference.date()}); refusing to forecast from data older than {config.STALE_ERROR_DAYS} days."
        )
    if age_days < 0:
        raise InvalidDateError(f"reference_date {reference.date()} precedes the latest observation {origin.date()}")

    series_warnings = _series_warnings(series, origin, reference)
    policy_age = (origin - pd.Timestamp(policy["evaluated_through"])).days
    if policy_age > config.POLICY_STALE_DAYS:
        series_warnings.append({
            "code": "POLICY_STALE",
            "message": f"Data extends {policy_age} days beyond the last evaluation "
                       f"({policy['evaluated_through']}); re-run the evaluation to refresh model approvals.",
        })

    data_key = (origin.date().isoformat(), len(series))
    forecasts = []
    for h in horizon_list:
        entry = policy["cells"].get(cell_key(commodity, market, h))
        if entry is None:
            raise PolicyError(f"Policy has no entry for {commodity}/{market} horizon {h}")
        try:
            row = latest_origin_row(series, weather, h)
        except ValueError as exc:
            raise InsufficientHistoryError(f"{commodity}/{market}: {exc}") from exc

        warnings = []
        target = origin + pd.Timedelta(days=h)
        if target <= reference:
            warnings.append({"code": "TARGET_NOT_IN_FUTURE",
                             "message": f"Target date {target.date()} is not after {reference.date()}."})
        rate = _weekday_report_rate(series, origin, target.dayofweek)
        if rate < config.RARE_WEEKDAY_REPORT_RATE:
            warnings.append({
                "code": "TARGET_WEEKDAY_RARELY_REPORTED",
                "message": f"This market reported on only {rate:.0%} of {target.day_name()}s in the past year; "
                           "no price may be published for the target date.",
            })

        method, status = entry["selected_method"], entry["status"]
        prediction, fallback_reason = _predict_one(
            commodity, market, h, method, row, data_key, series_path, weather_path, warnings
        ) if status == "validated_model" else (None, None)
        if status == "validated_model" and prediction is None:
            # Approved model failed at serving time: explicit, never silent.
            if strict:
                raise ModelFailureError(fallback_reason)
            warnings.append({"code": "MODEL_FAILURE_FALLBACK", "message": fallback_reason})
            method, status = entry["baseline_method"], "baseline_estimate"
        if prediction is None:
            prediction = float(build_forecaster(method).predict(row)[0])

        item = {
            "horizon_days": h,
            "target_date": target.date().isoformat(),
            "prediction": round(float(prediction), 2),
            "price_unit": config.PRICE_UNIT,
            "method": method,
            "status": status,
            "validation": _validation_block(entry),
            "warnings": warnings,
        }
        if include_experimental and entry.get("experimental_candidate") and status != "validated_model":
            item["experimental"] = _experimental_block(
                commodity, market, h, entry, row, data_key, series_path, weather_path
            )
        forecasts.append(item)

    return json_safe({
        "schema_version": config.SCHEMA_VERSION,
        "commodity": commodity,
        "market": market,
        "price_unit": config.PRICE_UNIT,
        "forecast_origin": origin.date().isoformat(),
        "last_observed_date": origin.date().isoformat(),
        "last_observed_price": round(float(series["modal_price"].iloc[-1]), 2),
        "reference_date": reference.date().isoformat(),
        "data_age_days": age_days,
        "policy": {"evaluated_through": policy["evaluated_through"],
                   "policy_compat_version": policy["policy_compat_version"]},
        "warnings": series_warnings,
        "forecasts": forecasts,
        "disclaimer": "Statistical estimate from historical mandi prices; not guaranteed. "
                      "Target dates without a market report have no published price. Each horizon is "
                      "selected and fitted independently, so the sequence is a set of separate "
                      "per-day estimates, not a smooth price trajectory.",
    })


def _predict_one(commodity, market, h, method, row, data_key, series_path, weather_path, warnings):
    """Return (prediction, None) or (None, failure_message) for an ML method."""
    try:
        model, n_train = _fitted(commodity, market, h, method, data_key, series_path, weather_path)
        missing = model.missing_features(row)
        if missing:
            warnings.append({
                "code": "MISSING_FEATURES_IMPUTED",
                "message": f"Features unavailable at the origin were imputed with training medians: {missing}",
            })
        return float(model.predict(row)[0]), None
    except Exception as exc:  # reported to the caller, never swallowed silently
        logger.exception("Model %s failed for %s/%s h=%s", method, commodity, market, h)
        return None, f"Model '{method}' failed at serving time ({type(exc).__name__}: {exc}); baseline used."


def _validation_block(entry: dict) -> dict:
    return {
        "policy_status": entry["status"],
        "selected_method": entry["selected_method"],
        "baseline_method": entry["baseline_method"],
        "n_validation": entry.get("n_validation"),
        "n_holdout": entry.get("n_holdout"),
        "baseline_validation_mae": entry.get("baseline_validation_mae"),
        "baseline_holdout_mae": entry.get("baseline_holdout_mae"),
        "selected_validation_mae": entry.get("selected_validation_mae"),
        "selected_holdout_mae": entry.get("selected_holdout_mae"),
        "failed_criteria": entry.get("failed_criteria", []),
    }


def _experimental_block(commodity, market, h, entry, row, data_key, series_path, weather_path):
    method = entry["experimental_candidate"]
    warnings = []
    prediction, failure = _predict_one(commodity, market, h, method, row, data_key,
                                       series_path, weather_path, warnings)
    block = {
        "status": "experimental", "method": method,
        "not_approved_because": entry.get("failed_criteria", []),
        "validation_mae": entry.get("candidate_validation_mae"),
        "holdout_mae": entry.get("candidate_holdout_mae"),
        "warnings": warnings,
    }
    if prediction is None:
        block["error"] = failure
    else:
        block["prediction"] = round(prediction, 2)
    return block


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="CropBazaar 1-7 day price forecast (JSON output).")
    parser.add_argument("--commodity", required=True)
    parser.add_argument("--market", default=None, help="default: the commodity's primary market")
    parser.add_argument("--horizons", default="1-7", help="e.g. 1-7, 7, or 1,3,7")
    parser.add_argument("--as-of", default=None, help="YYYY-MM-DD: ignore later observations")
    parser.add_argument("--reference-date", default=None, help="YYYY-MM-DD 'today' for freshness checks")
    parser.add_argument("--include-experimental", action="store_true")
    parser.add_argument("--strict", action="store_true", help="fail instead of falling back on model errors")
    args = parser.parse_args(argv)
    try:
        result = forecast(
            args.commodity, args.market, args.horizons, as_of=args.as_of,
            reference_date=args.reference_date, include_experimental=args.include_experimental,
            strict=args.strict,
        )
    except ForecastError as exc:
        print(json.dumps({"error": exc.to_dict()}, indent=2))
        return 2
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

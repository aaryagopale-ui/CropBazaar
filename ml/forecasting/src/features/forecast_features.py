"""Leak-free features for the origin-date -> origin+h forecast problem.

Contract
--------
* A *forecast origin* is an observation date `o` of a series. Everything known at `o` may be
  used: prices observed on or before `o`, arrivals reported with the price on `o`, weather up
  to the day before `o`, and the calendar.
* The target for horizon `h` is the price observed on **exactly** `o + h` days. If the market
  did not report that day the target is *missing* (never replaced by a later date).
* "Lag" features are calendar-anchored ("as-of"): `ret_asof_kd` uses the last price observed on
  or before `o - k` days. They are never k-th previous records, so irregular reporting does not
  change their meaning.

`origin_features` is the single implementation used for training, evaluation and serving; row
`o` depends only on data dated <= `o` (weather: < `o`), which the tests verify.
"""

import numpy as np
import pandas as pd

from src import config

PRICE_FEATURES = (
    [f"ret_asof_{k}d" for k in config.ASOF_LAG_DAYS]
    + [f"dev_mean_{w}d" for w in config.MEAN_WINDOWS_DAYS]
    + ["cv_14d", "gap_days", "obs_count_14d"]
)
CALENDAR_FEATURES = [
    "origin_dow_sin", "origin_dow_cos",
    "target_dow_sin", "target_dow_cos",
    "target_doy_sin", "target_doy_cos",
]
ARRIVAL_FEATURES = ["arrival_log", "arrival_dev_28d"]
WEATHER_FEATURES = ["weather_temp_7d", "weather_precip_7d", "weather_humidity_7d"]

FEATURE_SETS = {
    "core": PRICE_FEATURES + CALENDAR_FEATURES,
    "extended": PRICE_FEATURES + CALENDAR_FEATURES + ARRIVAL_FEATURES + WEATHER_FEATURES,
}
# Must be present (non-NaN) for an origin to be usable. Everything else is optional and is
# imputed with training medians (and reported) when missing.
REQUIRED_FEATURES = [f for f in PRICE_FEATURES if f != "cv_14d"]
BASELINE_INPUTS = ["last_price", "mean_7d_price"]


def origin_features(series: pd.DataFrame, weather: pd.DataFrame = None) -> pd.DataFrame:
    """Horizon-independent features for every observation date (the potential origins).

    `series` has columns [date, modal_price, arrival_quantity]. Returns a frame indexed by
    `origin_date` with price, baseline inputs, features and a `valid_origin` flag.
    """
    s = series.sort_values("date")
    if s["date"].duplicated().any():
        raise ValueError("series contains duplicate dates")
    price = s.set_index("date")["modal_price"].astype(float)
    price.index.name = "origin_date"
    idx = price.index

    out = pd.DataFrame(index=idx)
    out["last_price"] = price

    # Calendar-anchored lags: last price observed on or before (origin - k days).
    carried = price.resample("D").last().ffill()
    for k in config.ASOF_LAG_DAYS:
        prior = carried.shift(k).reindex(idx)
        out[f"ret_asof_{k}d"] = np.log(price / prior).clip(-config.RET_CLIP, config.RET_CLIP)

    # Calendar windows ending at (and including) the origin.
    for w in config.MEAN_WINDOWS_DAYS:
        mean_w = price.rolling(f"{w}D").mean()
        out[f"mean_{w}d_price"] = mean_w
        out[f"dev_mean_{w}d"] = np.log(price / mean_w).clip(-config.RET_CLIP, config.RET_CLIP)
    roll14 = price.rolling("14D")
    out["cv_14d"] = roll14.std() / roll14.mean()  # NaN when only one observation
    out["obs_count_14d"] = roll14.count()
    out["gap_days"] = pd.Series(idx, index=idx).diff().dt.days

    dow = idx.dayofweek.to_numpy()
    out["origin_dow_sin"] = np.sin(2 * np.pi * dow / 7)
    out["origin_dow_cos"] = np.cos(2 * np.pi * dow / 7)

    # Arrivals are published with the same-day price, so they are known at the origin.
    arrival = s.set_index("date")["arrival_quantity"].astype(float).reindex(idx)
    arrival.index.name = "origin_date"
    out["arrival_log"] = np.log1p(arrival)
    out["arrival_dev_28d"] = np.log1p(arrival) - np.log1p(arrival.rolling("28D").mean())

    # Weather: observed history only, ending the day BEFORE the origin. Future weather is
    # never used because no historical weather *forecasts* are available.
    for col in WEATHER_FEATURES:
        out[col] = np.nan
    if weather is not None and len(weather):
        trailing = weather.shift(1).rolling(config.WEATHER_WINDOW_DAYS, min_periods=5).mean()
        for feature, source in (
            ("weather_temp_7d", "temperature_mean_c"),
            ("weather_precip_7d", "precipitation_mm"),
            ("weather_humidity_7d", "relative_humidity_mean_pct"),
        ):
            out[feature] = trailing[source].reindex(idx).to_numpy()

    out["valid_origin"] = out[REQUIRED_FEATURES].notna().all(axis=1) & np.isfinite(
        out[REQUIRED_FEATURES]
    ).all(axis=1)
    return out


def add_horizon(frame: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """Attach the exact target date and the target-calendar features for one horizon."""
    if horizon not in config.HORIZONS:
        raise ValueError(f"horizon must be in {config.HORIZONS}, got {horizon}")
    out = frame.copy()
    target_date = out.index + pd.Timedelta(days=horizon)
    out["horizon_days"] = horizon
    out["target_date"] = target_date
    dow = target_date.dayofweek.to_numpy()
    doy = target_date.dayofyear.to_numpy()
    out["target_dow_sin"] = np.sin(2 * np.pi * dow / 7)
    out["target_dow_cos"] = np.cos(2 * np.pi * dow / 7)
    out["target_doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["target_doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    return out


def build_horizon_dataset(
    series: pd.DataFrame, weather: pd.DataFrame, horizon: int
) -> pd.DataFrame:
    """All usable origins for one horizon, with the exact-date target where it exists.

    Rows whose target date has no observation keep `target_observed=False` and a NaN target:
    they are missing data, not model failures, and are excluded from fitting and scoring.
    """
    frame = add_horizon(origin_features(series, weather), horizon)
    frame = frame[frame["valid_origin"]].copy()
    observed = series.set_index("date")["modal_price"].astype(float)
    frame["target_price"] = observed.reindex(frame["target_date"]).to_numpy()  # exact date only
    frame["target_observed"] = frame["target_price"].notna()
    # Distinguish "market did not report that day" from "that day has not happened yet".
    data_end = series["date"].max()
    frame["target_status"] = np.where(
        frame["target_observed"],
        "observed",
        np.where(frame["target_date"] > data_end, "after_data_end", "missing_market_day"),
    )
    frame["target_log_ratio"] = np.log(frame["target_price"] / frame["last_price"])
    return frame


def latest_origin_row(series: pd.DataFrame, weather: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """One-row feature frame for the latest observation (the live forecast origin).

    Raises ValueError if the latest origin lacks the required history.
    """
    frame = add_horizon(origin_features(series, weather), horizon).tail(1)
    if not bool(frame["valid_origin"].iloc[0]):
        raise ValueError(
            "insufficient history before the latest observation "
            f"(need {config.MIN_HISTORY_DAYS} calendar days of prior prices)"
        )
    return frame


def horizon_diagnostics(frame: pd.DataFrame) -> dict:
    """Counts separating unusable origins from missing targets."""
    status = frame["target_status"]
    return {
        "valid_origins": int(len(frame)),
        "targets_observed": int((status == "observed").sum()),
        "targets_missing_market_day": int((status == "missing_market_day").sum()),
        "targets_after_data_end": int((status == "after_data_end").sum()),
    }

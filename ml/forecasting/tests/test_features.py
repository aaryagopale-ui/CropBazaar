import numpy as np
import pandas as pd
import pytest

from src import config
from src.data.series import load_series, load_weather
from src.features.forecast_features import (
    FEATURE_SETS, REQUIRED_FEATURES, build_horizon_dataset, horizon_diagnostics,
    latest_origin_row, origin_features,
)
from tests.conftest import make_series, make_weather

FEATURE_COLUMNS = sorted({c for cols in FEATURE_SETS.values() for c in cols})


def test_calendar_anchored_lags_respect_irregular_reporting():
    dates = pd.to_datetime("2024-01-01") + pd.to_timedelta([0, 5, 10, 15, 20], unit="D")
    s = pd.DataFrame({"date": dates, "modal_price": [100.0, 110, 120, 130, 140],
                      "arrival_quantity": 10.0})
    f = origin_features(s)
    row = f.loc[dates[-1]]  # origin = day 20
    # last price observed on or before (origin - k days)
    assert row["ret_asof_1d"] == pytest.approx(np.log(140 / 130))   # day 19 -> day 15
    assert row["ret_asof_7d"] == pytest.approx(np.log(140 / 120))   # day 13 -> day 10
    assert row["ret_asof_14d"] == pytest.approx(np.log(140 / 110))  # day 6  -> day 5
    assert row["gap_days"] == 5
    # a row-based lag would have said "7 records back"; here 7 days back is only 1.4 records
    assert not f.loc[dates[1], "valid_origin"]  # not enough calendar history yet


def test_exact_target_date_and_missing_target_is_not_replaced(series):
    series = series.copy()
    origin = series["date"].iloc[100]
    target = origin + pd.Timedelta(days=3)
    # remove the exact target day but keep the following days
    series = series[series["date"] != target].reset_index(drop=True)
    later_price = series.loc[series["date"] > target, "modal_price"].iloc[0]
    d = build_horizon_dataset(series, None, 3)
    row = d.loc[origin]
    assert row["target_date"] == target
    assert not row["target_observed"] and np.isnan(row["target_price"])
    assert row["target_status"] == "missing_market_day"
    assert np.isnan(row["target_log_ratio"])
    assert later_price not in [row["target_price"]]


@pytest.mark.parametrize("h", config.HORIZONS)
def test_target_is_origin_plus_h_days_and_value_matches(series, h):
    d = build_horizon_dataset(series, None, h)
    assert ((d["target_date"] - d.index).dt.days == h).all()
    observed = d[d["target_observed"]]
    by_date = series.set_index("date")["modal_price"]
    assert (by_date.loc[observed["target_date"]].to_numpy() == observed["target_price"].to_numpy()).all()


def test_targets_after_data_end_are_distinguished_from_missing_days(series):
    d = build_horizon_dataset(series, None, 7)
    counts = horizon_diagnostics(d)
    assert counts["targets_after_data_end"] > 0
    assert counts["valid_origins"] == sum(
        counts[k] for k in ("targets_observed", "targets_missing_market_day", "targets_after_data_end")
    )
    after = d[d["target_status"] == "after_data_end"]
    assert (after["target_date"] > series["date"].max()).all()


def test_features_never_use_information_after_the_origin(series, weather):
    cut = series["date"].iloc[200]
    base = origin_features(series, weather)
    s2 = series.copy()
    later = s2["date"] > cut
    s2.loc[later, "modal_price"] *= 9.0
    s2.loc[later, "arrival_quantity"] *= 9.0
    w2 = weather.copy()
    w2.loc[w2.index >= cut] = -999.0  # weather on/after the origin day must not matter
    pert = origin_features(s2, w2)
    cols = [c for c in base.columns if c != "valid_origin"]
    np.testing.assert_allclose(
        base.loc[:cut, cols].to_numpy(float), pert.loc[:cut, cols].to_numpy(float), equal_nan=True
    )


def test_feature_sets_contain_no_target_columns():
    forbidden = {"target_price", "target_log_ratio", "target_date", "target_status",
                 "target_observed", "horizon_days"}
    for cols in FEATURE_SETS.values():
        assert not forbidden & set(cols)


def test_training_and_inference_features_are_identical(series, weather):
    """The live feature row for origin o equals the training row for o (history truncated at o)."""
    h = 5
    full = build_horizon_dataset(series, weather, h)
    for origin in full.index[[30, 120, 250, -1]]:
        truncated = series[series["date"] <= origin]
        live = latest_origin_row(truncated, weather, h)
        assert live.index[0] == origin
        np.testing.assert_allclose(
            live[FEATURE_COLUMNS + ["last_price", "mean_7d_price"]].to_numpy(float),
            full.loc[[origin], FEATURE_COLUMNS + ["last_price", "mean_7d_price"]].to_numpy(float),
            equal_nan=True,
        )


def test_parity_on_real_committed_series():
    weather = load_weather()
    for commodity, markets in config.SUPPORTED_SERIES.items():
        series = load_series(commodity, markets[0])
        full = build_horizon_dataset(series, weather, 7)
        origin = full.index[len(full) // 2]
        live = latest_origin_row(series[series["date"] <= origin], weather, 7)
        np.testing.assert_allclose(
            live[FEATURE_COLUMNS].to_numpy(float), full.loc[[origin], FEATURE_COLUMNS].to_numpy(float),
            equal_nan=True,
        )


def test_insufficient_history_is_explicit():
    short = make_series(days=10, drop_frac=0.0)
    with pytest.raises(ValueError, match="insufficient history"):
        latest_origin_row(short, None, 1)
    assert build_horizon_dataset(short, None, 1).empty


def test_missing_optional_features_stay_nan_not_zero(series):
    f = origin_features(series, weather=None)
    assert f["weather_temp_7d"].isna().all()           # explicit missing, no fabricated zeros
    assert f.loc[f["valid_origin"], REQUIRED_FEATURES].notna().all().all()


def test_weather_window_ends_the_day_before_origin():
    s = make_series(days=60, drop_frac=0.0, skip_sunday=False)
    w = make_weather(start="2023-12-01", days=200)
    origin = s["date"].iloc[40]
    f = origin_features(s, w)
    expected = w["temperature_mean_c"].loc[origin - pd.Timedelta(days=7): origin - pd.Timedelta(days=1)].mean()
    assert f.loc[origin, "weather_temp_7d"] == pytest.approx(expected)


def test_duplicate_dates_rejected(series):
    dup = pd.concat([series, series.iloc[[5]]])
    with pytest.raises(ValueError, match="duplicate"):
        origin_features(dup)

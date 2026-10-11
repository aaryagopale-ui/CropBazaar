import json

import numpy as np
import pandas as pd
import pytest

from src import config
from src.data.series import load_series, load_weather
from src.errors import (
    DataUnavailableError, InsufficientHistoryError, InvalidDateError, InvalidHorizonError,
    ModelFailureError, PolicyError, StaleDataError, UnsupportedCommodityError, UnsupportedMarketError,
)
from src.features.forecast_features import build_horizon_dataset
from src.forecasting import predict as predict_module
from src.forecasting.predict import forecast, main, parse_horizons, resolve_series
from src.models.candidates import build_forecaster
from tests.conftest import edit_policy

REF = "2026-10-09"
ALL = [(c, m[0]) for c, m in config.SUPPORTED_SERIES.items()]
TOP_KEYS = {"schema_version", "commodity", "market", "price_unit", "forecast_origin", "last_observed_date",
            "last_observed_price", "reference_date", "data_age_days", "policy", "warnings", "forecasts", "disclaimer"}
ITEM_KEYS = {"horizon_days", "target_date", "prediction", "price_unit", "method", "status", "validation", "warnings"}


@pytest.mark.parametrize("commodity, market", ALL)
def test_all_five_commodities_return_seven_separate_exact_date_forecasts(commodity, market):
    result = forecast(commodity, market, range(1, 8), reference_date=REF)
    assert TOP_KEYS <= set(result)
    assert result["commodity"] == commodity and result["market"] == market
    assert result["forecast_origin"] == result["last_observed_date"]
    origin = pd.Timestamp(result["forecast_origin"])
    assert [f["horizon_days"] for f in result["forecasts"]] == list(range(1, 8))
    for f in result["forecasts"]:
        assert ITEM_KEYS <= set(f)
        assert pd.Timestamp(f["target_date"]) == origin + pd.Timedelta(days=f["horizon_days"])
        assert f["price_unit"] == config.PRICE_UNIT
        assert np.isfinite(f["prediction"]) and f["prediction"] > 0
        assert f["status"] in ("validated_model", "baseline_estimate")
    assert len({f["target_date"] for f in result["forecasts"]}) == 7   # not one number relabelled
    json.dumps(result, allow_nan=False)                                # strict JSON


def test_origin_is_latest_observation_for_selected_series():
    for commodity, market in ALL:
        series = load_series(commodity, market)
        result = forecast(commodity, market, 1, reference_date=REF)
        assert result["forecast_origin"] == series["date"].max().date().isoformat()
        assert result["last_observed_price"] == float(series["modal_price"].iloc[-1])


def test_validated_forecast_is_exactly_the_trained_model_on_training_features():
    """Serving parity: same features + same config as the training/evaluation path."""
    commodity, market, h = "Cauliflower", "APMC Nasik", 1
    result = forecast(commodity, market, h, reference_date=REF)["forecasts"][0]
    assert result["status"] == "validated_model"
    series, weather = load_series(commodity, market), load_weather()
    data = build_horizon_dataset(series, weather, h)
    model = build_forecaster(result["method"]).fit(data[data["target_observed"]])
    live_row = data.tail(1)   # latest origin row from the training builder
    assert result["prediction"] == pytest.approx(float(model.predict(live_row)[0]), abs=0.01)


def test_baseline_cells_serve_the_declared_baseline(policy_copy):
    series = load_series("Onion", "Lasalgaon(Vinchur)")
    edit_policy(policy_copy, "Onion", "Lasalgaon(Vinchur)", 2, status="baseline_estimate",
                selected_method="persistence", baseline_method="persistence")
    edit_policy(policy_copy, "Onion", "Lasalgaon(Vinchur)", 3, status="baseline_estimate",
                selected_method="rolling_mean_7d", baseline_method="rolling_mean_7d")
    res = forecast("Onion", horizons=[2, 3], reference_date=REF, policy_path=policy_copy)["forecasts"]
    origin = series["date"].max()
    window = series[series["date"] > origin - pd.Timedelta(days=7)]["modal_price"]
    assert res[0]["prediction"] == float(series["modal_price"].iloc[-1]) and res[0]["status"] == "baseline_estimate"
    assert res[1]["prediction"] == pytest.approx(window.mean(), abs=0.01) and res[1]["method"] == "rolling_mean_7d"


def test_non_approved_model_is_never_primary_only_experimental():
    res = forecast("Onion", horizons=range(1, 8), reference_date=REF, include_experimental=True)
    for f in res["forecasts"]:
        assert f["status"] == "baseline_estimate"
        assert f["method"] in ("persistence", "rolling_mean_7d")
        assert f["experimental"]["status"] == "experimental" and f["experimental"]["not_approved_because"]
    plain = forecast("Onion", horizons=1, reference_date=REF)["forecasts"][0]
    assert "experimental" not in plain


def test_model_failure_falls_back_explicitly_or_raises_in_strict_mode(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("simulated failure")
    monkeypatch.setattr(predict_module, "_fitted", boom)
    f = forecast("Cauliflower", horizons=1, reference_date=REF)["forecasts"][0]
    assert f["status"] == "baseline_estimate" and f["method"] == "persistence"
    assert any(w["code"] == "MODEL_FAILURE_FALLBACK" and "simulated failure" in w["message"] for w in f["warnings"])
    with pytest.raises(ModelFailureError, match="simulated failure"):
        forecast("Cauliflower", horizons=1, reference_date=REF, strict=True)


# ---- input validation / error handling -------------------------------------------------------
def test_unsupported_commodity_and_market():
    with pytest.raises(UnsupportedCommodityError):
        forecast("Mango", reference_date=REF)
    with pytest.raises(UnsupportedCommodityError):
        forecast(None, reference_date=REF)
    with pytest.raises(UnsupportedMarketError, match="not supported"):
        forecast("Onion", "APMC Nasik", reference_date=REF)
    assert resolve_series("  onion ", "lasalgaon(vinchur)") == ("Onion", "Lasalgaon(Vinchur)")


@pytest.mark.parametrize("bad", [0, 8, -1, [], [1, 9], "0-3", "abc", None, 3.5, True, "1-", "1;3"])
def test_invalid_horizons(bad):
    with pytest.raises(InvalidHorizonError):
        parse_horizons(bad)


def test_horizon_parsing_forms():
    assert parse_horizons("1-3,7") == [1, 2, 3, 7]
    assert parse_horizons(5) == [5] and parse_horizons([3, 1, 3]) == [1, 3]
    assert parse_horizons(range(1, 8)) == list(range(1, 8))


def test_date_and_freshness_errors():
    with pytest.raises(InvalidDateError):
        forecast("Onion", as_of="not-a-date")
    with pytest.raises(InvalidDateError, match="precedes"):
        forecast("Onion", reference_date="2026-01-01")
    with pytest.raises(StaleDataError):
        forecast("Onion", reference_date="2026-12-31")
    stale = forecast("Onion", horizons=1, reference_date="2026-10-14")
    assert stale["data_age_days"] == 8 and any(w["code"] == "STALE_DATA" for w in stale["warnings"])


def test_as_of_truncates_history_and_moves_the_origin():
    res = forecast("Tomato", horizons=[1, 7], as_of="2026-03-01")
    assert res["forecast_origin"] <= "2026-03-01"
    assert res["reference_date"] == "2026-03-01"
    origin = pd.Timestamp(res["forecast_origin"])
    assert res["forecasts"][1]["target_date"] == (origin + pd.Timedelta(days=7)).date().isoformat()
    assert res["data_age_days"] == (pd.Timestamp("2026-03-01") - origin).days


def test_as_of_result_does_not_depend_on_later_data(tmp_path):
    """Appending future rows must not change a forecast made as of an earlier date."""
    store = pd.read_csv(config.SERIES_PATH)
    mask = (store.commodity == "Cabbage")
    future = store[mask & (store.date > "2026-06-01")].copy()
    store.loc[future.index, "modal_price"] = future["modal_price"] * 10
    altered = tmp_path / "s.csv"
    store.to_csv(altered, index=False)
    a = forecast("Cabbage", horizons=range(1, 8), as_of="2026-06-01")
    b = forecast("Cabbage", horizons=range(1, 8), as_of="2026-06-01", series_path=altered)
    assert [f["prediction"] for f in a["forecasts"]] == [f["prediction"] for f in b["forecasts"]]


def test_insufficient_history_and_missing_data(tmp_path):
    store = pd.read_csv(config.SERIES_PATH)
    tiny = store[store.commodity == "Onion"].head(6)
    path = tmp_path / "tiny.csv"
    tiny.to_csv(path, index=False)
    with pytest.raises(InsufficientHistoryError):
        forecast("Onion", horizons=1, series_path=path, reference_date="2024-01-10")
    with pytest.raises(DataUnavailableError):
        forecast("Onion", series_path=tmp_path / "nope.csv", reference_date=REF)
    with pytest.raises(DataUnavailableError):
        forecast("Tomato", series_path=path, reference_date="2024-01-10")  # no Tomato rows in tiny
    with pytest.raises(PolicyError):
        forecast("Onion", policy_path=tmp_path / "nope.json", reference_date=REF)


def test_anomalous_last_price_and_rare_weekday_warnings():
    res = forecast("Onion", horizons=range(1, 8), reference_date=REF)
    sunday = [f for f in res["forecasts"] if pd.Timestamp(f["target_date"]).dayofweek == 6][0]
    assert any(w["code"] == "TARGET_WEEKDAY_RARELY_REPORTED" for w in sunday["warnings"])


# ---- CLI ---------------------------------------------------------------------------------
def test_cli_success_and_error_json(capsys):
    assert main(["--commodity", "Brinjal", "--horizons", "7", "--reference-date", REF]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["forecasts"][0]["horizon_days"] == 7
    assert main(["--commodity", "Brinjal", "--horizons", "9"]) == 2
    err = json.loads(capsys.readouterr().out)
    assert err["error"]["code"] == "INVALID_HORIZON"


# ---- documented schema must match real output ------------------------------------------------
def _documented_schema():
    from src.config import ROOT
    text = (ROOT / "docs/INTEGRATION.md").read_text()
    section = text.split("## Request and response schema")[1].split("\n## ")[0]
    groups, current = {}, None
    for line in section.splitlines():
        if line.startswith("### "):
            current = line[4:].strip()
            groups[current] = {}
        elif current and line.startswith("| `"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            groups[current][cells[0].strip("`")] = cells[1]
    return groups


_TYPES = {"string": str, "number": (int, float), "integer": int, "array": list, "object": dict}


def _check_object(documented, actual, optional=()):
    assert set(actual) <= set(documented), f"undocumented fields: {set(actual) - set(documented)}"
    assert set(documented) - set(optional) <= set(actual), f"documented but missing: {set(documented) - set(actual) - set(optional)}"
    for key, value in actual.items():
        spec = documented[key]
        nullable = spec.endswith("or null")
        base = spec.replace("or null", "").strip()
        if value is None:
            assert nullable, f"{key} is null but documented as {spec}"
        else:
            assert isinstance(value, _TYPES[base]) and not isinstance(value, bool), f"{key}: {value!r} is not {spec}"


def test_documented_response_schema_matches_actual_output():
    doc = _documented_schema()
    result = forecast("Onion", horizons=range(1, 8), reference_date="2026-10-14", include_experimental=True)
    _check_object(doc["Top level"], result)
    _check_object(doc["policy"], result["policy"])
    assert any(w for w in result["warnings"]), "expected a stale-data warning to exercise warnings[]"
    for w in result["warnings"]:
        _check_object(doc["warnings[] (series-level and per-horizon)"], w)
    for item in result["forecasts"]:
        _check_object(doc["forecasts[]"], item, optional=("experimental",))
        _check_object(doc["forecasts[].validation"], item["validation"])
        _check_object(doc["forecasts[].experimental (optional)"], item["experimental"])
        for w in item["warnings"]:
            _check_object(doc["warnings[] (series-level and per-horizon)"], w)
    # every documented enum value is real
    assert {f["status"] for f in result["forecasts"]} <= {"validated_model", "baseline_estimate"}
    cau = forecast("Cauliflower", horizons=range(1, 8), reference_date="2026-10-09")
    assert {"validated_model", "baseline_estimate"} == {f["status"] for f in cau["forecasts"]}
    assert {f["method"] for f in cau["forecasts"]} <= {"persistence", "rolling_mean_7d", "ridge_core", "ridge_extended"}

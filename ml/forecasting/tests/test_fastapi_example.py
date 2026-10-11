"""Tests for examples/fastapi_integration.py (an integration example; skipped if fastapi/httpx are absent)."""

import importlib.util
import json

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from src import config  # noqa: E402
from src.evaluation.policy import read_policy  # noqa: E402

REF = "2026-10-09"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CROPBAZAAR_FORECAST_REFERENCE_DATE", REF)   # keep tests independent of today's date
    path = config.ROOT / "examples" / "fastapi_integration.py"
    spec = importlib.util.spec_from_file_location("fastapi_integration_example", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app)


def test_supported_endpoint_lists_all_series_and_horizons(client):
    body = client.get("/api/forecast/supported").json()
    assert body["horizons"] == list(range(1, 8)) and body["price_unit"] == "Rs./Quintal"
    assert {c["commodity"] for c in body["commodities"]} == set(config.SUPPORTED_SERIES)


@pytest.mark.parametrize("commodity", list(config.SUPPORTED_SERIES))
def test_forecast_endpoint_follows_policy_for_every_commodity(client, commodity):
    response = client.get(f"/api/forecast/{commodity}?horizons=1-7")
    assert response.status_code == 200
    body = response.json()
    json.dumps(body, allow_nan=False)
    market = body["market"]
    cells = read_policy()["cells"]
    assert [f["horizon_days"] for f in body["forecasts"]] == list(range(1, 8))
    for f in body["forecasts"]:
        entry = cells[f"{commodity}|{market}|{f['horizon_days']}"]
        assert f["status"] == entry["status"] and f["method"] == entry["selected_method"]


@pytest.mark.parametrize("url, status, code", [
    ("/api/forecast/Mango", 404, "UNSUPPORTED_COMMODITY"),
    ("/api/forecast/Onion?market=APMC%20Nasik", 404, "UNSUPPORTED_MARKET"),
    ("/api/forecast/Onion?horizons=0", 400, "INVALID_HORIZON"),
    ("/api/forecast/Onion?horizons=8", 400, "INVALID_HORIZON"),
    ("/api/forecast/Onion?horizons=abc", 400, "INVALID_HORIZON"),
])
def test_errors_map_to_http_status_with_code_and_message(client, url, status, code):
    response = client.get(url)
    assert response.status_code == status
    detail = response.json()["detail"]
    assert detail["code"] == code and detail["message"]


def test_stale_data_is_a_503_not_a_silent_forecast(client, monkeypatch):
    monkeypatch.setenv("CROPBAZAAR_FORECAST_REFERENCE_DATE", "2027-06-01")
    response = client.get("/api/forecast/Onion")
    assert response.status_code == 503 and response.json()["detail"]["code"] == "STALE_DATA"

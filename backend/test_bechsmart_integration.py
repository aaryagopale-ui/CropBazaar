"""Integration tests for the shared forecast context used by BechSmart."""

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def _request_payload():
    return {
        "commodity": "Onion",
        "market": "Lasalgaon(Vinchur)",
        "quantity_quintals": 10,
        "transport_cost": 500,
        "storage_cost_per_day": 20,
        "spoilage_rate": 0.02,
        "preferences": {"urgency": "normal"},
    }


def test_bechsmart_returns_shared_forecast_context():
    response = client.post("/api/bechsmart/recommend", json=_request_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["recommendation_status"] in {"complete", "insufficient_data"}
    assert body["support"]["supported"] is True
    assert body["historical_coverage"]["record_count"] > 0
    assert len(body["forecast"]) == 7
    assert len(body["model_metrics"]) == 7
    assert body["recommendation"]["recommended_action"] in {"WAIT", "INSUFFICIENT_DATA"}
    assert body["comparison_options"][0]["price_status"] == "historical_scenario"
    assert body["comparison_options"][0]["eligible"] is False


def test_bechsmart_and_forecast_use_identical_predictions():
    forecast_response = client.get(
        "/api/forecast/Onion",
        params={"market": "Lasalgaon(Vinchur)", "horizons": "1-7"},
    )
    bechsmart_response = client.post("/api/bechsmart/recommend", json=_request_payload())

    assert forecast_response.status_code == 200
    assert bechsmart_response.status_code == 200
    forecast = forecast_response.json()
    bechsmart = bechsmart_response.json()
    assert bechsmart["forecast"] == forecast["forecasts"]
    assert bechsmart["freshness"]["forecast_origin"] == forecast["forecast_origin"]


def test_bechsmart_rejects_unsupported_crop_mandi_pair():
    payload = _request_payload()
    payload.update({"commodity": "Wheat", "market": "Indore Mandi"})

    response = client.post("/api/bechsmart/recommend", json=payload)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "UNSUPPORTED_COMMODITY"


def test_bechsmart_validates_cost_and_quantity_inputs():
    payload = _request_payload()
    payload.update({"quantity_quintals": 0, "spoilage_rate": 1.5})

    response = client.post("/api/bechsmart/recommend", json=payload)

    assert response.status_code == 422


def test_bechsmart_does_not_recommend_past_forecast_days():
    response = client.post("/api/bechsmart/recommend", json=_request_payload())

    assert response.status_code == 200
    wait_options = [option for option in response.json()["comparison_options"] if option["action"] == "WAIT"]
    assert all(option["day"] >= 1 for option in wait_options if option["eligible"])
    assert all(option["eligible"] is False for option in wait_options if option["day"] <= 0)
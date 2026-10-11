"""Integration tests for the model-scoped Jokhim risk endpoint."""

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_risk_data_is_scoped_and_contains_forecast_context():
    response = client.get(
        "/api/jokhim/risk-data",
        params={"commodity": "Onion", "market": "Lasalgaon(Vinchur)"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["commodity"] == "Onion"
    assert body["market"] == "Lasalgaon(Vinchur)"
    assert body["supported_model_pair"] is True
    assert body["historical_coverage"]["observation_count"] > 0
    assert body["price_indicators"]["last_7_trading_days"]["observation_count"] <= 7
    assert body["price_indicators"]["last_30_trading_days"]["observation_count"] <= 30
    assert body["arrival_indicators"]["unit"] == "Metric Tonnes"
    assert len(body["ml_forecast"]["forecasts"]) == 7
    assert body["ml_forecast"]["forecast_origin"] == body["historical_coverage"]["date_end"]


def test_risk_data_rejects_historically_available_but_unsupported_pair():
    response = client.get(
        "/api/jokhim/risk-data",
        params={"commodity": "Onion", "market": "APMC Lasalgaon"},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "UNSUPPORTED_CROP_MANDI"


def test_risk_data_does_not_mix_crops_for_same_market():
    onion = client.get(
        "/api/jokhim/risk-data",
        params={"commodity": "Onion", "market": "Lasalgaon(Vinchur)"},
    ).json()
    cauliflower = client.get(
        "/api/jokhim/risk-data",
        params={"commodity": "Cauliflower", "market": "APMC Nasik"},
    ).json()

    assert onion["commodity"] != cauliflower["commodity"]
    assert onion["historical_coverage"]["latest_observed_price"] != cauliflower["historical_coverage"]["latest_observed_price"]


def test_analyze_returns_four_data_derived_risk_cards_and_forecast_movement():
    response = client.post(
        "/api/jokhim/analyze",
        json={"commodity": "Onion", "market": "Lasalgaon(Vinchur)"},
    )

    assert response.status_code == 200
    body = response.json()
    analysis = body["risk_analysis"]
    assert [card["name"] for card in analysis["risk_cards"]] == [
        "Price Drop Risk",
        "Arrival Spike Risk",
        "Weather Risk",
        "Price Volatility Risk",
    ]
    assert analysis["sufficient_data"] is True
    assert 0 <= analysis["overall_risk_index"] <= 100
    assert len(analysis["forecasted_price_movement"]) == 7


def test_analyze_rejects_supported_history_with_unsupported_model_mandi():
    response = client.post(
        "/api/jokhim/analyze",
        json={"commodity": "Onion", "market": "APMC Lasalgaon"},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "UNSUPPORTED_CROP_MANDI"


def test_bechsmart_reuses_the_same_risk_analysis():
    jokhim = client.post(
        "/api/jokhim/analyze",
        json={"commodity": "Onion", "market": "Lasalgaon(Vinchur)"},
    ).json()["risk_analysis"]
    bechsmart = client.post(
        "/api/bechsmart/recommend",
        json={
            "commodity": "Onion",
            "market": "Lasalgaon(Vinchur)",
            "quantity_quintals": 10,
            "transport_cost": 0,
            "storage_cost_per_day": 0,
            "spoilage_rate": 0,
        },
    ).json()["risk_analysis"]

    assert bechsmart["risk_cards"] == jokhim["risk_cards"]
    assert bechsmart["overall_risk_index"] == jokhim["overall_risk_index"]
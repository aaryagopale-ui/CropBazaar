"""Tests for Kisan Vaani assistant service and router."""

import pytest
from fastapi.testclient import TestClient
from main import app
from services import assistant_service

client = TestClient(app)


def test_extract_relevant_market_data_basic():
    """Verify market data extraction retrieves real records from dataset."""
    context = assistant_service.extract_relevant_market_data(
        "What is the latest recorded onion price at APMC Lasalgaon?"
    )
    assert context["has_records"] is True
    assert "Onion" in context["detected_crops"]
    assert "APMC Lasalgaon" in context["detected_mandis"]
    assert "APMC Lasalgaon" in context["records_text"]
    assert context["latest_observation_date"] is not None


def test_extract_relevant_market_data_uses_farmer_profile():
    """Verify KisanTwin farmer profile is automatically used when query lacks specifics."""
    farmer_profile = {
        "name": "Aarya",
        "village": "Khed",
        "district": "Nashik",
        "state": "Maharashtra",
        "crop": "Tomato",
        "lotSize": "25",
        "transportAccess": "own_tractor",
        "cashUrgency": "Need Cash Today",
    }
    context = assistant_service.extract_relevant_market_data(
        "Where should I sell my crop today?",
        farmer_profile=farmer_profile,
    )
    assert context["target_crop"] == "Tomato"
    assert "Tomato" in context["detected_crops"]
    assert context["comparison_text"] != ""


def test_financial_breakdown_calculation():
    """Verify profit calculations use real price and exact lot size without fabrication."""
    context = assistant_service.extract_relevant_market_data(
        "How much profit can I make by selling 30 quintals of onion?",
        farmer_profile={"crop": "Onion", "lotSize": 30, "transportAccess": "own_tractor"},
    )
    assert context["profit_text"] != ""
    assert "FINANCIAL ESTIMATION BREAKDOWN FOR 30.0 QUINTALS" in context["profit_text"]
    assert "Gross Sale Value:" in context["profit_text"]
    assert "Estimated Net Farming Profit" in context["profit_text"]


def test_forecast_context_retrieval():
    """Verify ML forward forecast context is extracted for supported crops."""
    context = assistant_service.extract_relevant_market_data(
        "What is the expected onion price over the next seven days?"
    )
    assert context["forecast_text"] != ""
    assert "ML FORWARD FORECAST FOR ONION" in context["forecast_text"]
    assert "Predicted Modal Price" in context["forecast_text"]


def test_build_system_prompt_multilingual():
    """Verify prompt generates proper directives for English, Hindi, and Marathi."""
    context = assistant_service.extract_relevant_market_data("Onion price")
    farmer_profile = {"name": "Aarya", "crop": "Onion", "lotSize": 30}

    prompt_en = assistant_service.build_system_prompt("en", context, farmer_profile)
    assert "English (Indian Agricultural Context)" in prompt_en
    assert "Aarya" in prompt_en

    prompt_hi = assistant_service.build_system_prompt("hi", context, farmer_profile)
    assert "Hindi (हिंदी)" in prompt_hi
    assert "Aarya" in prompt_hi

    prompt_mr = assistant_service.build_system_prompt("mr", context, farmer_profile)
    assert "Marathi (मराठी)" in prompt_mr
    assert "Aarya" in prompt_mr


def test_assistant_chat_endpoint_validates_input():
    """Verify empty message is rejected with status 400 or 422."""
    response = client.post("/api/assistant/chat", json={"message": "", "language": "en"})
    assert response.status_code in (400, 422)


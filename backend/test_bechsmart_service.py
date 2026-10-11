"""Unit tests for BechSmart's financial calculations."""

import pytest

from services.bechsmart_service import (
    calculate_net_revenue,
    choose_recommendation,
    saleable_quantity,
)


def test_spoilage_is_compounded_by_holding_day():
    assert saleable_quantity(100, 0.1, 2) == pytest.approx(81)


def test_net_revenue_subtracts_all_configured_costs():
    result = calculate_net_revenue(
        1000,
        10,
        transport_cost=500,
        market_charge_per_quintal=20,
        handling_cost_per_quintal=10,
        storage_cost_per_day=25,
        spoilage_rate=0.1,
        days=2,
    )
    assert result["saleable_quantity_quintals"] == pytest.approx(8.1)
    assert result["gross_revenue"] == pytest.approx(8100)
    assert result["market_cost"] == pytest.approx(162)
    assert result["handling_cost"] == pytest.approx(81)
    assert result["storage_cost"] == pytest.approx(50)
    assert result["net_revenue"] == pytest.approx(7307)


def test_selector_uses_risk_adjusted_revenue_and_tolerance():
    options = [
        {"eligible": True, "risk_level": "HIGH", "risk_adjusted_net_revenue": 1200},
        {"eligible": True, "risk_level": "LOW", "risk_adjusted_net_revenue": 1000},
    ]
    assert choose_recommendation(options, risk_tolerance="low")["risk_level"] == "LOW"
    assert choose_recommendation(options, risk_tolerance="high")["risk_level"] == "HIGH"


def test_selector_returns_no_recommendation_when_nothing_is_feasible():
    assert choose_recommendation([
        {"eligible": False, "risk_level": "LOW", "risk_adjusted_net_revenue": 1000},
    ]) is None
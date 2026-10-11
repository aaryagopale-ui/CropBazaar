"""Pure financial calculations for BechSmart recommendations."""

from datetime import date
from typing import Any, Dict, Iterable, Optional


def saleable_quantity(quantity_quintals: float, spoilage_rate: float, days: int = 0) -> float:
    """Return saleable quantity after daily compounded spoilage."""
    if quantity_quintals <= 0:
        raise ValueError("quantity_quintals must be positive")
    if not 0 <= spoilage_rate <= 1:
        raise ValueError("spoilage_rate must be between 0 and 1")
    if days < 0:
        raise ValueError("days must be non-negative")
    return quantity_quintals * ((1 - spoilage_rate) ** days)


def calculate_net_revenue(
    price_per_quintal: float,
    quantity_quintals: float,
    *,
    transport_cost: float = 0,
    market_charge_per_quintal: float = 0,
    handling_cost_per_quintal: float = 0,
    storage_cost_per_day: float = 0,
    spoilage_rate: float = 0,
    days: int = 0,
) -> Dict[str, float]:
    """Calculate gross and net rupee values without inventing missing costs."""
    saleable = saleable_quantity(quantity_quintals, spoilage_rate, days)
    gross = price_per_quintal * saleable
    variable_costs = (market_charge_per_quintal + handling_cost_per_quintal) * saleable
    storage_costs = storage_cost_per_day * days
    net = gross - transport_cost - variable_costs - storage_costs
    return {
        "saleable_quantity_quintals": round(saleable, 4),
        "gross_revenue": round(gross, 2),
        "transport_cost": round(transport_cost, 2),
        "market_cost": round(market_charge_per_quintal * saleable, 2),
        "handling_cost": round(handling_cost_per_quintal * saleable, 2),
        "storage_cost": round(storage_costs, 2),
        "net_revenue": round(net, 2),
    }


def forecast_error_per_quintal(forecast_item: Dict[str, Any]) -> float:
    """Use held-out MAE when present, otherwise validation MAE, as uncertainty."""
    validation = forecast_item.get("validation") or {}
    value = validation.get("selected_holdout_mae")
    if value is None:
        value = validation.get("selected_validation_mae")
    return max(float(value or 0), 0.0)


def risk_level(
    price_per_quintal: float,
    error_per_quintal: float,
    spoilage_rate: float,
    days: int,
) -> str:
    """Classify risk from measured model error plus holding exposure."""
    error_ratio = error_per_quintal / max(abs(price_per_quintal), 1.0)
    exposure = error_ratio + spoilage_rate * days
    if exposure >= 0.5:
        return "HIGH"
    if exposure >= 0.2:
        return "MEDIUM"
    return "LOW"


def build_wait_option(
    forecast_item: Dict[str, Any],
    quantity_quintals: float,
    *,
    transport_cost: float,
    market_charge_per_quintal: float,
    handling_cost_per_quintal: float,
    storage_cost_per_day: float,
    spoilage_rate: float,
    reference_date: date,
) -> Dict[str, Any]:
    target = date.fromisoformat(forecast_item["target_date"])
    days = (target - reference_date).days
    price = float(forecast_item["prediction"])
    costs = calculate_net_revenue(
        price,
        quantity_quintals,
        transport_cost=transport_cost,
        market_charge_per_quintal=market_charge_per_quintal,
        handling_cost_per_quintal=handling_cost_per_quintal,
        storage_cost_per_day=storage_cost_per_day,
        spoilage_rate=spoilage_rate,
        days=max(days, 0),
    )
    error = forecast_error_per_quintal(forecast_item)
    risk_cost = error * costs["saleable_quantity_quintals"]
    warnings = list(forecast_item.get("warnings") or [])
    if forecast_item.get("status") == "baseline_estimate":
        warnings.append({"code": "BASELINE_PREDICTION", "message": "This horizon uses an approved baseline, not a validated model."})
    target_reporting_is_rare = any(
        warning.get("code") == "TARGET_WEEKDAY_RARELY_REPORTED" for warning in warnings
    )
    return {
        "action": "WAIT",
        "day": days,
        "target_date": forecast_item["target_date"],
        "mandi": None,
        "price": price,
        "price_status": forecast_item.get("status"),
        "method": forecast_item.get("method"),
        "eligible": days >= 1 and not target_reporting_is_rare,
        "risk_adjusted_net_revenue": round(costs["net_revenue"] - risk_cost, 2),
        "estimated_net_revenue": costs["net_revenue"],
        "model_error_mae": round(error, 2),
        "risk_cost": round(risk_cost, 2),
        "risk_level": risk_level(price, error, spoilage_rate, max(days, 0)),
        "cost_breakdown": costs,
        "warnings": warnings,
    }


def choose_recommendation(
    options: Iterable[Dict[str, Any]],
    *,
    risk_tolerance: str = "medium",
) -> Optional[Dict[str, Any]]:
    """Choose the best feasible risk-adjusted option for the farmer's tolerance."""
    allowed = {"low": {"LOW"}, "medium": {"LOW", "MEDIUM"}, "high": {"LOW", "MEDIUM", "HIGH"}}
    allowed_levels = allowed.get(risk_tolerance.lower(), allowed["medium"])
    eligible = [
        option for option in options
        if option.get("eligible") and option.get("risk_level") in allowed_levels
    ]
    return max(eligible, key=lambda option: option["risk_adjusted_net_revenue"]) if eligible else None
"""BechSmart's shared forecast context endpoint.

This endpoint deliberately stops at model-backed advisory inputs. Recommendation
logic remains a separate phase and must not invent values for unsupported pairs.
"""

import os
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from data_loader import get_df
from services.bechsmart_service import (
    build_wait_option,
    calculate_net_revenue,
    choose_recommendation,
)
from services.jokhim_service import build_risk_analysis, build_risk_data

ML_FORECASTING_DIR = Path(__file__).resolve().parent.parent / "ml" / "forecasting"
if str(ML_FORECASTING_DIR) not in sys.path:
    sys.path.insert(0, str(ML_FORECASTING_DIR))

from src import config
from src.errors import ForecastError
from src.forecasting.predict import forecast


STATUS_BY_CODE = {
    "UNSUPPORTED_COMMODITY": 404,
    "UNSUPPORTED_MARKET": 404,
    "INVALID_HORIZON": 400,
    "INVALID_DATE": 400,
    "STALE_DATA": 503,
    "INSUFFICIENT_HISTORY": 503,
    "DATA_UNAVAILABLE": 503,
    "POLICY_UNAVAILABLE": 503,
    "MODEL_FAILURE": 500,
}

router = APIRouter(prefix="/api/bechsmart", tags=["BechSmart"])


class BechSmartRequest(BaseModel):
    commodity: str = Field(min_length=1)
    market: str = Field(min_length=1)
    quantity_quintals: float = Field(gt=0)
    transport_cost: float = Field(ge=0)
    storage_cost_per_day: float = Field(ge=0)
    spoilage_rate: float = Field(ge=0, le=1)
    market_charge_per_quintal: Optional[float] = Field(default=None, ge=0)
    handling_cost_per_quintal: Optional[float] = Field(default=None, ge=0)
    max_holding_days: int = Field(default=7, ge=0, le=7)
    risk_tolerance: str = Field(default="medium", pattern="^(low|medium|high)$")
    alternative_transport_costs: Dict[str, float] = Field(default_factory=dict)
    alternative_market_charges_per_quintal: Dict[str, float] = Field(default_factory=dict)
    alternative_handling_costs_per_quintal: Dict[str, float] = Field(default_factory=dict)
    preferences: Optional[Dict[str, Any]] = None


def _historical_coverage(commodity: str, market: str, reference_date: str) -> dict:
    df = get_df()
    filtered = df[
        (df["commodity"].str.lower() == commodity.lower())
        & (df["market"].str.lower() == market.lower())
    ].sort_values("date")
    if filtered.empty:
        return {
            "record_count": 0,
            "earliest_observed_date": None,
            "latest_observed_date": None,
            "latest_observed_price": None,
            "days_since_last_observation": None,
        }

    latest_date = filtered["date"].iloc[-1]
    reference = pd.Timestamp(reference_date)
    return {
        "record_count": int(len(filtered)),
        "earliest_observed_date": str(filtered["date"].iloc[0]),
        "latest_observed_date": str(latest_date),
        "latest_observed_price": float(filtered["modal_price"].iloc[-1]),
        "days_since_last_observation": int((reference - pd.Timestamp(latest_date)).days),
    }


@router.post("/recommend")
def recommend(request: BechSmartRequest):
    """Return a financially comparable, model-backed advisory decision."""
    try:
        forecast_result = forecast(
            request.commodity,
            request.market,
            horizons="1-7",
            reference_date=os.getenv("CROPBAZAAR_FORECAST_REFERENCE_DATE") or None,
        )
    except ForecastError as exc:
        raise HTTPException(
            status_code=STATUS_BY_CODE.get(exc.code, 500),
            detail=exc.to_dict(),
        ) from exc

    coverage = _historical_coverage(
        forecast_result["commodity"],
        forecast_result["market"],
        forecast_result["reference_date"],
    )
    risk_context = build_risk_data(request.commodity, request.market, forecast_result)
    risk_analysis = build_risk_analysis(risk_context)
    support = {
        "commodity": forecast_result["commodity"],
        "market": forecast_result["market"],
        "supported": True,
        "horizons": list(config.HORIZONS),
    }
    freshness = {
        "reference_date": forecast_result["reference_date"],
        "forecast_origin": forecast_result["forecast_origin"],
        "last_observed_date": forecast_result["last_observed_date"],
        "data_age_days": forecast_result["data_age_days"],
        "warnings": forecast_result["warnings"],
    }

    reference_date = date.fromisoformat(forecast_result["reference_date"])
    market_charge = request.market_charge_per_quintal or 0.0
    handling_cost = request.handling_cost_per_quintal or 0.0
    warnings = list(forecast_result["warnings"])
    if request.market_charge_per_quintal is None:
        warnings.append({"code": "MARKET_CHARGE_ASSUMED_ZERO", "message": "Market charge was not supplied; calculation assumes zero."})
    if request.handling_cost_per_quintal is None:
        warnings.append({"code": "HANDLING_COST_ASSUMED_ZERO", "message": "Handling cost was not supplied; calculation assumes zero."})
    if coverage["days_since_last_observation"] is None or coverage["days_since_last_observation"] > 0:
        warnings.append({"code": "HISTORICAL_SELL_NOW", "message": "The dataset has no verified live price; Sell Today is historical scenario only."})

    historical_sell_costs = calculate_net_revenue(
        forecast_result["last_observed_price"],
        request.quantity_quintals,
        transport_cost=request.transport_cost,
        market_charge_per_quintal=market_charge,
        handling_cost_per_quintal=handling_cost,
        storage_cost_per_day=request.storage_cost_per_day,
        spoilage_rate=request.spoilage_rate,
    )
    sell_today = {
        "action": "SELL_TODAY",
        "day": 0,
        "target_date": forecast_result["last_observed_date"],
        "mandi": forecast_result["market"],
        "price": forecast_result["last_observed_price"],
        "price_status": "historical_scenario",
        "eligible": False,
        "estimated_net_revenue": historical_sell_costs["net_revenue"],
        "risk_adjusted_net_revenue": None,
        "risk_level": "UNKNOWN",
        "cost_breakdown": historical_sell_costs,
        "warnings": [{"code": "NOT_LIVE_PRICE", "message": "Observed modal price is historical, not a verified current market quote."}],
    }

    wait_options = [
        build_wait_option(
            item,
            request.quantity_quintals,
            transport_cost=request.transport_cost,
            market_charge_per_quintal=market_charge,
            handling_cost_per_quintal=handling_cost,
            storage_cost_per_day=request.storage_cost_per_day,
            spoilage_rate=request.spoilage_rate,
            reference_date=reference_date,
        )
        for item in forecast_result["forecasts"]
        if (date.fromisoformat(item["target_date"]) - reference_date).days <= request.max_holding_days
    ]
    for option in wait_options:
        option["mandi"] = forecast_result["market"]

    switch_options = []
    supported_markets = list(config.SUPPORTED_SERIES.get(forecast_result["commodity"], ()))
    alternatives = [market_name for market_name in supported_markets if market_name != forecast_result["market"]]
    if not alternatives:
        warnings.append({"code": "NO_SUPPORTED_ALTERNATIVE_MANDI", "message": "No alternative mandi for this commodity has an evaluated model."})
    for alternative in alternatives:
        transport = request.alternative_transport_costs.get(alternative)
        if transport is None:
            switch_options.append({"action": "SWITCH_MANDI", "mandi": alternative, "eligible": False, "incomplete": True, "warnings": [{"code": "TRANSPORT_COST_REQUIRED", "message": "Alternative transport cost is required; no distance or cost was invented."}]})
            continue
        try:
            alternative_forecast = forecast(
                forecast_result["commodity"],
                alternative,
                horizons="1-7",
                reference_date=forecast_result["reference_date"],
            )
        except ForecastError:
            switch_options.append({"action": "SWITCH_MANDI", "mandi": alternative, "eligible": False, "incomplete": True})
            continue
        for item in alternative_forecast["forecasts"]:
            option = build_wait_option(
                item,
                request.quantity_quintals,
                transport_cost=transport,
                market_charge_per_quintal=request.alternative_market_charges_per_quintal.get(alternative, market_charge),
                handling_cost_per_quintal=request.alternative_handling_costs_per_quintal.get(alternative, handling_cost),
                storage_cost_per_day=request.storage_cost_per_day,
                spoilage_rate=request.spoilage_rate,
                reference_date=reference_date,
            )
            option["action"] = "SWITCH_MANDI"
            option["mandi"] = alternative
            switch_options.append(option)

    candidates = wait_options + [option for option in switch_options if option.get("eligible")]
    selected = choose_recommendation(candidates, risk_tolerance=request.risk_tolerance)
    if selected is None:
        recommendation = {
            "recommended_action": "INSUFFICIENT_DATA",
            "recommended_day": None,
            "recommended_mandi": None,
            "estimated_net_revenue": None,
            "estimated_incremental_gain": None,
            "risk_level": "UNKNOWN",
            "explanation_reasons": ["No future, feasible, risk-tolerance-compatible option had sufficient model-backed inputs."],
        }
    else:
        recommendation = {
            "recommended_action": selected["action"],
            "recommended_day": selected["day"],
            "recommended_mandi": selected["mandi"],
            "estimated_net_revenue": selected["estimated_net_revenue"],
            "estimated_incremental_gain": None,
            "risk_level": selected["risk_level"],
            "explanation_reasons": [
                "Selected by risk-adjusted net revenue after spoilage, storage, transport, market, handling, and model-error costs.",
                f"Forecast method: {selected.get('method')}; estimated model error: ₹{selected.get('model_error_mae', 0):.2f}/quintal.",
            ],
        }

    comparison_options = [sell_today] + wait_options + switch_options

    return {
        "schema_version": "1.0",
        "recommendation_status": "complete" if recommendation["recommended_action"] != "INSUFFICIENT_DATA" else "insufficient_data",
        "inputs": request.model_dump(),
        "support": support,
        "historical_coverage": coverage,
        "freshness": freshness,
        "latest_observed": {
            "price": forecast_result["last_observed_price"],
            "date": forecast_result["last_observed_date"],
            "price_unit": forecast_result["price_unit"],
        },
        "forecast": forecast_result["forecasts"],
        "comparison_options": comparison_options,
        **recommendation,
        "model_metrics": [
            {
                "horizon_days": item["horizon_days"],
                "status": item["status"],
                "method": item["method"],
                "validation": item["validation"],
            }
            for item in forecast_result["forecasts"]
        ],
        "risk_analysis": risk_analysis,
        "recommendation": recommendation,
        "warnings": warnings,
        "data_as_of": forecast_result["reference_date"],
        "assumptions": {
            "transport_cost": "farmer-supplied total route cost",
            "market_charge_per_quintal": request.market_charge_per_quintal if request.market_charge_per_quintal is not None else 0,
            "handling_cost_per_quintal": request.handling_cost_per_quintal if request.handling_cost_per_quintal is not None else 0,
            "storage_cost_per_day": "farmer-supplied total daily cost",
            "spoilage_rate": "farmer-supplied daily compounded rate",
        },
        "disclaimer": "Sell Today is not live unless a verified current price source is connected. Forecast values are statistical estimates and baseline horizons are labelled.",
    }
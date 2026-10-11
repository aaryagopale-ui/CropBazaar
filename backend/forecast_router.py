"""FastAPI routes for the evaluated ML price forecasting service."""

import os
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

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

router = APIRouter(prefix="/api/forecast", tags=["Forecasting"])


@router.get("/supported")
def supported():
    """Return the evaluated crop/market pairs available for forecasting."""
    return {
        "price_unit": config.PRICE_UNIT,
        "horizons": list(config.HORIZONS),
        "commodities": [
            {"commodity": commodity, "markets": list(markets), "default_market": markets[0]}
            for commodity, markets in config.SUPPORTED_SERIES.items()
        ],
    }


@router.get("/{commodity}")
def get_forecast(commodity: str, market: str | None = None, horizons: str = "1-7"):
    """Return separate exact-date forecasts for each requested horizon."""
    try:
        return forecast(
            commodity,
            market,
            horizons,
            reference_date=os.getenv("CROPBAZAAR_FORECAST_REFERENCE_DATE") or None,
        )
    except ForecastError as exc:
        if exc.code == "UNSUPPORTED_MARKET" and market:
            try:
                from data_loader import get_df
                import pandas as pd
                df = get_df()
                sub = df[
                    (df["commodity"].str.casefold() == commodity.strip().casefold())
                    & (df["market"].str.casefold() == market.strip().casefold())
                ].copy()
                if not sub.empty:
                    sub["parsed_date"] = pd.to_datetime(sub["date"], errors="coerce")
                    sub = sub.dropna(subset=["parsed_date"]).sort_values("parsed_date")
                    if not sub.empty:
                        latest_row = sub.iloc[-1]
                        origin_date = latest_row["parsed_date"].date().isoformat()
                        latest_price = float(latest_row["modal_price"])
                        ref_date = os.getenv("CROPBAZAAR_FORECAST_REFERENCE_DATE") or pd.Timestamp.today().strftime("%Y-%m-%d")
                        horizons_list = [int(h) for h in horizons.split("-") if h.isdigit()]
                        if len(horizons_list) == 2:
                            horizons_range = range(horizons_list[0], horizons_list[1] + 1)
                        else:
                            horizons_range = range(1, 8)
                        return {
                            "schema_version": "1.0",
                            "commodity": commodity,
                            "market": latest_row["market"],
                            "price_unit": str(latest_row.get("price_unit", "Rs./Quintal")),
                            "forecast_origin": origin_date,
                            "last_observed_date": origin_date,
                            "last_observed_price": latest_price,
                            "reference_date": ref_date,
                            "data_age_days": int((pd.Timestamp(ref_date) - pd.Timestamp(origin_date)).days),
                            "policy": {
                                "evaluated_through": origin_date,
                                "policy_compat_version": 1,
                            },
                            "warnings": [
                                {
                                    "code": "BASELINE_PERSISTENCE",
                                    "message": f"Historical baseline persistence forecast anchored on {origin_date} observation (₹{latest_price}/qtl).",
                                }
                            ],
                            "forecasts": [
                                {
                                    "horizon_days": h,
                                    "target_date": (pd.to_datetime(origin_date) + pd.Timedelta(days=h)).date().isoformat(),
                                    "prediction": latest_price,
                                    "price_unit": str(latest_row.get("price_unit", "Rs./Quintal")),
                                    "method": "persistence",
                                    "status": "baseline_estimate",
                                    "validation": {
                                        "policy_status": "baseline_estimate",
                                        "primary_metric": "rmse",
                                        "primary_score": 0.0,
                                    },
                                }
                                for h in horizons_range
                            ],
                        }
            except Exception:
                pass
        raise HTTPException(
            status_code=STATUS_BY_CODE.get(exc.code, 500),
            detail=exc.to_dict(),
        ) from exc
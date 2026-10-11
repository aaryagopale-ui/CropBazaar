"""FastAPI Router for historical weather endpoints."""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from services import weather_service

router = APIRouter(prefix="/api/weather", tags=["Historical Weather"])


@router.get("/history")
def get_weather_history(
    market: Optional[str] = Query(None, description="Mandi filter (e.g. APMC Lasalgaon)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=1000, description="Max observations to return"),
):
    """Return historical daily temperature, precipitation, and humidity records."""
    try:
        return weather_service.get_weather_history(
            market=market,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
def get_weather_summary(
    market: Optional[str] = Query(None, description="Mandi filter (e.g. APMC Lasalgaon)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
):
    """Return aggregated historical weather metrics (averages, extremes, rainfall totals)."""
    try:
        return weather_service.get_weather_summary(
            market=market,
            start_date=start_date,
            end_date=end_date,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""FastAPI Router for agricultural market intelligence endpoints."""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from services import market_service

router = APIRouter(prefix="/api/market", tags=["Market Intelligence"])


@router.get("/summary")
def get_market_summary():
    """Return dataset overview: total records, crops, states, mandis, and date range."""
    try:
        return market_service.get_market_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commodities")
def get_commodities(state: Optional[str] = Query(None, description="Optional state filter")):
    """Return list of available commodities and their pricing units."""
    try:
        return market_service.get_commodities(state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/states")
def get_states():
    """Return list of available states and districts."""
    try:
        return market_service.get_states()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mandis")
def get_mandis(
    state: Optional[str] = Query(None, description="Optional state filter"),
    commodity: Optional[str] = Query(None, description="Optional crop filter"),
    district: Optional[str] = Query(None, description="Optional district filter"),
):
    """Return list of mandis filtered by state, crop, and district."""
    try:
        return market_service.get_mandis(state=state, commodity=commodity, district=district)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prices")
def get_prices(
    commodity: Optional[str] = Query(None, description="Crop filter (e.g. Onion)"),
    state: Optional[str] = Query(None, description="State filter"),
    market: Optional[str] = Query(None, description="Mandi filter (e.g. APMC Lasalgaon)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=500, description="Page size limit"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """Return paginated raw modal price and arrival records with filters."""
    try:
        return market_service.get_prices(
            commodity=commodity,
            state=state,
            market=market,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trends")
def get_trends(
    commodity: str = Query(..., description="Crop name (e.g. Onion)"),
    market: str = Query(..., description="Mandi name (e.g. APMC Lasalgaon)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=1000, description="Number of chronological points"),
):
    """Return historical chronological modal price and arrival trends."""
    try:
        return market_service.get_trends(
            commodity=commodity,
            market=market,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/arrivals")
def get_arrivals(
    commodity: str = Query(..., description="Crop name (e.g. Onion)"),
    market: Optional[str] = Query(None, description="Optional mandi filter"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=1000, description="Max records"),
):
    """Return historical arrival quantities for a crop."""
    try:
        return market_service.get_arrivals(
            commodity=commodity,
            market=market,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/compare")
def get_compare(
    commodity: str = Query(..., description="Crop to compare across mandis (e.g. Onion)"),
    state: Optional[str] = Query(None, description="Optional state filter"),
    limit: int = Query(10, ge=2, le=50, description="Max mandis to compare"),
):
    """Compare latest recorded prices for a crop across different APMC mandis."""
    try:
        return market_service.get_compare(commodity=commodity, state=state, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

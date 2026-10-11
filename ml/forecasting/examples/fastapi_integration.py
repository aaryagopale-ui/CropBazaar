"""EXAMPLE ONLY: FastAPI router around the forecasting module. NOT wired into `backend/`.

The backend teammate can copy `router` into `backend/app/` and include it in `app.main`:

    from .forecast_router import router
    app.include_router(router)

Before copying, point `ML_FORECASTING_DIR` at `<repo>/ml/forecasting`, e.g. from `backend/app/forecast_router.py`:

    ML_FORECASTING_DIR = Path(__file__).resolve().parents[2] / "ml" / "forecasting"

and install the ML dependencies into the backend's environment (`pip install -r ml/requirements.txt`).

Run this example on its own (from `ml/forecasting/`, with fastapi + uvicorn installed):

    python -m uvicorn examples.fastapi_integration:app --reload --port 8001
    curl "http://127.0.0.1:8001/api/forecast/Onion?horizons=1-7"

Environment variable `CROPBAZAAR_FORECAST_REFERENCE_DATE` (YYYY-MM-DD) sets the "today" used for data-freshness
checks. Leave it unset in production. For a frozen demo on old data set it, and show `last_observed_date` in the UI.
"""

import os
import sys
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ML_FORECASTING_DIR = Path(__file__).resolve().parents[1]      # <repo>/ml/forecasting
if str(ML_FORECASTING_DIR) not in sys.path:
    sys.path.insert(0, str(ML_FORECASTING_DIR))

from src import config                                        # noqa: E402
from src.errors import ForecastError                          # noqa: E402
from src.forecasting.predict import forecast                  # noqa: E402

# ForecastError.code -> HTTP status. The body is always {"detail": {"code": ..., "message": ...}}.
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

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("/supported")
def supported():
    """What can be requested (for dropdowns). Declared before the `/{commodity}` route on purpose."""
    return {
        "price_unit": config.PRICE_UNIT,
        "horizons": list(config.HORIZONS),
        "commodities": [
            {"commodity": c, "markets": list(markets), "default_market": markets[0]}
            for c, markets in config.SUPPORTED_SERIES.items()
        ],
    }


@router.get("/{commodity}")
def get_forecast(commodity: str, market: str | None = None, horizons: str = "1-7"):
    """Separate exact-date forecasts per horizon. `horizons` accepts '7', '1-7' or '1,3,7'."""
    try:
        return forecast(
            commodity, market, horizons,
            reference_date=os.getenv("CROPBAZAAR_FORECAST_REFERENCE_DATE") or None,
        )
    except ForecastError as exc:
        raise HTTPException(status_code=STATUS_BY_CODE.get(exc.code, 500), detail=exc.to_dict()) from exc


app = FastAPI(title="CropBazaar forecast (example)")
app.include_router(router)
# The existing backend has no CORS configuration yet; a browser app on the Vite dev server needs one
# (or use a Vite dev proxy instead; see docs/BACKEND_FRONTEND_HANDOFF.md).
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["GET"], allow_headers=["*"])

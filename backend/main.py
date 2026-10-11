import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Load environment variables from .env if present
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir.parent / ".env")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from data_loader import load_dataset, get_df
from bechsmart_router import router as bechsmart_router
from forecast_router import router as forecast_router
from jokhim_router import router as jokhim_router
from routers import market, weather, assistant


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the dataset cache on startup
    try:
        df = load_dataset()
        print(f"[CropBazaar] Successfully loaded dataset with {len(df):,} records.")
    except Exception as exc:
        print(f"[CropBazaar] Warning: could not pre-load dataset on startup: {exc}")
    yield


app = FastAPI(
    title="CropBazaar API",
    description="Real APMC Mandi Market Intelligence & Weather Analytics API",
    version="0.2.0",
    lifespan=lifespan,
)


from fastapi.encoders import jsonable_encoder


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    try:
        raw_body = (await request.body()).decode("utf-8", errors="ignore")
    except Exception:
        raw_body = "<unavailable>"
    print(f"[CropBazaar 422 Validation Error] Path: {request.url.path} | Errors: {exc.errors()} | Body: {raw_body}")
    
    # Sanitize errors so raw bytes in 'input' don't crash json serialization with HTTP 500
    sanitized_errors = []
    for err in exc.errors():
        clean_err = dict(err)
        if "input" in clean_err and isinstance(clean_err["input"], (bytes, bytearray)):
            clean_err["input"] = clean_err["input"].decode("utf-8", errors="replace")
        sanitized_errors.append(clean_err)

    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(sanitized_errors)},
    )


# Configure CORS for local React dev server and production domains (e.g. Vercel)
custom_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
allowed_origins = list(set(default_origins + custom_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modular feature routers
app.include_router(market.router)
app.include_router(weather.router)
app.include_router(assistant.router)
app.include_router(forecast_router)
app.include_router(jokhim_router)
app.include_router(bechsmart_router)


@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint to verify backend service status and dataset readiness."""
    try:
        df = get_df()
        return {
            "status": "healthy",
            "service": "CropBazaar API",
            "version": "0.2.0",
            "dataset_loaded": True,
            "total_records": int(len(df)),
            "latest_available_date": str(df["date"].max()),
            "gemini_api_configured": bool(os.getenv("GEMINI_API_KEY")),
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "service": "CropBazaar API",
            "version": "0.2.0",
            "dataset_loaded": False,
            "error": str(exc),
        }

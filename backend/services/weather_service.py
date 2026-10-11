"""Weather history and analytics service operating on historical observations."""

from typing import Dict, Any, Optional
import pandas as pd
from data_loader import get_df, clean_record_for_json


def get_weather_history(
    market: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """Return historical weather records (temperature, precipitation, humidity)."""
    df = get_df()

    if market:
        df = df[df["market"].str.lower() == market.strip().lower()]
    if start_date:
        df = df[df["date"] >= start_date.strip()]
    if end_date:
        df = df[df["date"] <= end_date.strip()]

    if df.empty:
        return {
            "market": market or "All Markets",
            "found": False,
            "total_records": 0,
            "data": [],
        }

    # Distinct weather records by date and market
    cols = [
        "date",
        "market",
        "district",
        "state",
        "temperature_mean_c",
        "temperature_max_c",
        "temperature_min_c",
        "precipitation_mm",
        "precipitation_hours",
        "relative_humidity_mean_pct",
    ]
    weather_df = df[cols].drop_duplicates(subset=["date", "market"]).sort_values(by="date")

    if len(weather_df) > limit:
        weather_df = weather_df.tail(limit)

    records = [clean_record_for_json(r) for r in weather_df.to_dict(orient="records")]

    return {
        "market": market or "All Markets",
        "found": True,
        "total_records": len(records),
        "data": records,
    }


def get_weather_summary(
    market: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Calculate aggregated historical weather metrics over a timeframe."""
    df = get_df()

    if market:
        df = df[df["market"].str.lower() == market.strip().lower()]
    if start_date:
        df = df[df["date"] >= start_date.strip()]
    if end_date:
        df = df[df["date"] <= end_date.strip()]

    if df.empty:
        return {
            "market": market or "All Markets",
            "found": False,
            "message": "No weather observations found for the specified filters.",
        }

    # Deduplicate weather observations across markets for accurate rainfall totals
    w_df = df.drop_duplicates(subset=["date", "market"])

    mean_temp = float(w_df["temperature_mean_c"].mean())
    max_temp = float(w_df["temperature_max_c"].max())
    min_temp = float(w_df["temperature_min_c"].min())

    # We use precipitation_mm only (do not double-count with rain_mm)
    total_precip = float(w_df["precipitation_mm"].sum())
    rainy_days = int((w_df["precipitation_mm"] > 1.0).sum())
    max_single_day_rain = float(w_df["precipitation_mm"].max())

    avg_humidity = float(w_df["relative_humidity_mean_pct"].mean())
    min_humidity = int(w_df["relative_humidity_mean_pct"].min())
    max_humidity = int(w_df["relative_humidity_mean_pct"].max())

    return {
        "market": market or "All Markets",
        "found": True,
        "date_range": {
            "start": str(w_df["date"].min()),
            "end": str(w_df["date"].max()),
        },
        "observation_count": int(len(w_df)),
        "temperature": {
            "mean_c": round(mean_temp, 1),
            "max_c": round(max_temp, 1),
            "min_c": round(min_temp, 1),
        },
        "rainfall": {
            "total_precipitation_mm": round(total_precip, 1),
            "rainy_days_count": rainy_days,
            "max_single_day_rain_mm": round(max_single_day_rain, 1),
            "note": "Precipitation and rain measurements represent single-source observations without double counting.",
        },
        "humidity": {
            "mean_pct": round(avg_humidity, 1),
            "min_pct": min_humidity,
            "max_pct": max_humidity,
        },
    }

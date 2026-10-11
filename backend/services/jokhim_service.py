"""Historical risk indicators for one model-supported crop/mandi pair."""

from typing import Any, Dict

import numpy as np
import pandas as pd

from data_loader import get_df


def _round(value, digits=2):
    return None if pd.isna(value) else round(float(value), digits)


def _daily_pair_data(commodity: str, market: str):
    df = get_df()
    selected = df[
        (df["commodity"].str.casefold() == commodity.strip().casefold())
        & (df["market"].str.casefold() == market.strip().casefold())
    ].copy()
    warnings = []
    if selected.empty:
        return selected, warnings

    selected["parsed_date"] = pd.to_datetime(selected["date"], errors="coerce")
    invalid_dates = int(selected["parsed_date"].isna().sum())
    if invalid_dates:
        warnings.append({"code": "INVALID_DATES_IGNORED", "count": invalid_dates})
    selected = selected.dropna(subset=["parsed_date"])
    selected = selected.drop_duplicates()

    duplicate_dates = int(selected["parsed_date"].duplicated(keep=False).sum())
    if duplicate_dates:
        warnings.append({
            "code": "DUPLICATE_DATES_AGGREGATED",
            "count": duplicate_dates,
            "message": "Multiple records on one crop/mandi date were aggregated by daily mean price and arrival total.",
        })

    numeric_columns = ["modal_price", "arrival_quantity", "temperature_mean_c", "temperature_max_c", "temperature_min_c", "precipitation_mm", "relative_humidity_mean_pct"]
    for column in numeric_columns:
        selected[column] = pd.to_numeric(selected[column], errors="coerce")
    missing_numeric = int(selected[["modal_price", "arrival_quantity"]].isna().any(axis=1).sum())
    if missing_numeric:
        warnings.append({"code": "MISSING_PRICE_OR_ARRIVAL_IGNORED", "count": missing_numeric})

    daily = selected.groupby("parsed_date", as_index=False).agg(
        modal_price=("modal_price", "mean"),
        arrival_quantity=("arrival_quantity", "sum"),
        arrival_unit=("arrival_unit", "first"),
        price_unit=("price_unit", "first"),
        temperature_mean_c=("temperature_mean_c", "mean"),
        temperature_max_c=("temperature_max_c", "max"),
        temperature_min_c=("temperature_min_c", "min"),
        precipitation_mm=("precipitation_mm", "mean"),
        relative_humidity_mean_pct=("relative_humidity_mean_pct", "mean"),
    ).sort_values("parsed_date")
    return daily.dropna(subset=["modal_price", "arrival_quantity"]), warnings


def _price_indicators(daily: pd.DataFrame) -> Dict[str, Any]:
    result = {}
    for window in (7, 30):
        recent = daily.tail(window).copy()
        prices = recent["modal_price"]
        changes = prices.diff().dropna()
        pct_changes = prices.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
        result[f"last_{window}_trading_days"] = {
            "observation_count": int(len(recent)),
            "date_start": recent["parsed_date"].iloc[0].date().isoformat() if len(recent) else None,
            "date_end": recent["parsed_date"].iloc[-1].date().isoformat() if len(recent) else None,
            "mean_price": _round(prices.mean()),
            "min_price": _round(prices.min()),
            "max_price": _round(prices.max()),
            "standard_deviation": _round(prices.std(ddof=0)),
            "coefficient_of_variation_pct": _round((prices.std(ddof=0) / prices.mean() * 100) if prices.mean() else np.nan),
            "price_drop_count": int((changes < 0).sum()),
            "largest_price_drop": _round(abs(changes.min()) if len(changes) else np.nan),
            "largest_price_drop_pct": _round(abs(pct_changes.min()) * 100 if len(pct_changes) else np.nan),
        }
    return result


def _arrival_indicators(daily: pd.DataFrame) -> Dict[str, Any]:
    recent = daily.tail(30)
    arrivals = recent["arrival_quantity"]
    mean = arrivals.mean()
    std = arrivals.std(ddof=0)
    threshold = mean + (2 * std)
    return {
        "window_trading_days": int(len(recent)),
        "unit": str(recent["arrival_unit"].iloc[-1]) if len(recent) else None,
        "mean_quantity": _round(mean),
        "min_quantity": _round(arrivals.min()),
        "max_quantity": _round(arrivals.max()),
        "standard_deviation": _round(std),
        "coefficient_of_variation_pct": _round((std / mean * 100) if mean else np.nan),
        "spike_threshold": _round(threshold),
        "spike_count": int((arrivals > threshold).sum()) if len(arrivals) else 0,
    }


def _weather_indicators(commodity: str, market: str) -> Dict[str, Any]:
    daily, warnings = _daily_pair_data(commodity, market)
    recent = daily.tail(30)
    if recent.empty:
        return {"warnings": warnings, "observation_count": 0}
    temperature = recent["temperature_mean_c"]
    rainfall = recent["precipitation_mm"]
    humidity = recent["relative_humidity_mean_pct"]
    return {
        "observation_count": int(len(recent)),
        "date_start": recent["parsed_date"].iloc[0].date().isoformat(),
        "date_end": recent["parsed_date"].iloc[-1].date().isoformat(),
        "temperature_mean_c": _round(temperature.mean()),
        "temperature_min_c": _round(recent["temperature_min_c"].min()),
        "temperature_max_c": _round(recent["temperature_max_c"].max()),
        "temperature_standard_deviation_c": _round(temperature.std(ddof=0)),
        "rainfall_total_mm": _round(rainfall.sum()),
        "rainy_days_count": int((rainfall > 1).sum()),
        "maximum_single_day_rainfall_mm": _round(rainfall.max()),
        "humidity_mean_pct": _round(humidity.mean()),
        "humidity_min_pct": _round(humidity.min()),
        "humidity_max_pct": _round(humidity.max()),
        "warnings": warnings,
    }


def build_risk_data(commodity: str, market: str, forecast_result: dict) -> dict:
    daily, warnings = _daily_pair_data(commodity, market)
    if daily.empty:
        return {
            "commodity": commodity,
            "market": market,
            "found": False,
            "data_quality_warnings": warnings + [{"code": "NO_HISTORICAL_DATA"}],
        }

    latest_date = daily["parsed_date"].iloc[-1].date().isoformat()
    latest_price = _round(daily["modal_price"].iloc[-1])
    unit_warning = []
    if daily["price_unit"].nunique() > 1 or daily["arrival_unit"].nunique() > 1:
        unit_warning.append({"code": "INCONSISTENT_UNITS", "message": "Multiple units were found and the latest unit is reported."})

    return {
        "commodity": forecast_result["commodity"],
        "market": forecast_result["market"],
        "found": True,
        "historical_coverage": {
            "observation_count": int(len(daily)),
            "date_start": daily["parsed_date"].iloc[0].date().isoformat(),
            "date_end": latest_date,
            "latest_observed_price": latest_price,
            "price_unit": str(daily["price_unit"].iloc[-1]),
            "arrival_unit": str(daily["arrival_unit"].iloc[-1]),
        },
        "price_indicators": _price_indicators(daily),
        "arrival_indicators": _arrival_indicators(daily),
        "weather_indicators": _weather_indicators(commodity, market),
        "freshness": {
            "data_as_of": forecast_result["reference_date"],
            "latest_observed_date": latest_date,
            "days_since_latest_observation": int((pd.Timestamp(forecast_result["reference_date"]) - daily["parsed_date"].iloc[-1]).days),
            "is_stale": int((pd.Timestamp(forecast_result["reference_date"]) - daily["parsed_date"].iloc[-1]).days) > 0,
            "warning": "Historical observations are not live market prices." if latest_date != forecast_result["reference_date"] else None,
        },
        "ml_forecast": {
            "forecast_origin": forecast_result["forecast_origin"],
            "reference_date": forecast_result["reference_date"],
            "forecasts": forecast_result["forecasts"],
            "model_metrics": [
                {"horizon_days": item["horizon_days"], "status": item["status"], "method": item["method"], "validation": item["validation"]}
                for item in forecast_result["forecasts"]
            ],
        },
        "data_quality_warnings": warnings + unit_warning + forecast_result.get("warnings", []),
    }


def _risk_level(score):
    if score is None:
        return "INSUFFICIENT_DATA"
    if score < 34:
        return "LOW"
    if score < 67:
        return "MODERATE"
    return "HIGH"


def _bounded_score(value):
    return round(max(0.0, min(100.0, float(value))))


def _risk_card(name, score, explanation, evidence, sufficient=True):
    return {
        "name": name,
        "score": score if sufficient else None,
        "level": _risk_level(score if sufficient else None),
        "explanation": explanation if sufficient else "Insufficient valid historical observations for this indicator.",
        "evidence": evidence,
        "data_sufficient": sufficient,
    }


def build_risk_analysis(risk_data: dict) -> dict:
    """Derive transparent risk indicators from one scoped risk-data response."""
    price = risk_data.get("price_indicators", {})
    price7 = price.get("last_7_trading_days", {})
    price30 = price.get("last_30_trading_days", {})
    arrivals = risk_data.get("arrival_indicators", {})
    weather = risk_data.get("weather_indicators", {})
    warnings = list(risk_data.get("data_quality_warnings", []))

    price_sufficient = price30.get("observation_count", 0) >= 7
    drop_rate = price30.get("price_drop_count", 0) / max(price30.get("observation_count", 0) - 1, 1)
    drop_severity = min((price30.get("largest_price_drop_pct") or 0) / 20, 1)
    price_drop_score = _bounded_score((drop_rate / 0.5 * 60) + (drop_severity * 40)) if price_sufficient else None

    arrival_sufficient = arrivals.get("window_trading_days", 0) >= 7 and arrivals.get("mean_quantity") is not None
    spike_rate = arrivals.get("spike_count", 0) / max(arrivals.get("window_trading_days", 0), 1)
    arrival_cv = min((arrivals.get("coefficient_of_variation_pct") or 0) / 100, 1)
    arrival_score = _bounded_score((spike_rate / 0.25 * 60) + (arrival_cv * 40)) if arrival_sufficient else None

    weather_sufficient = weather.get("observation_count", 0) >= 7
    temperature_range = (weather.get("temperature_max_c") or 0) - (weather.get("temperature_min_c") or 0)
    humidity_range = (weather.get("humidity_max_pct") or 0) - (weather.get("humidity_min_pct") or 0)
    rainy_rate = weather.get("rainy_days_count", 0) / max(weather.get("observation_count", 0), 1)
    weather_score = _bounded_score((min(temperature_range / 20, 1) * 35) + (min(rainy_rate / 0.5, 1) * 35) + (min(humidity_range / 60, 1) * 30)) if weather_sufficient else None

    volatility_sufficient = price30.get("observation_count", 0) >= 7 and price7.get("observation_count", 0) >= 3
    cv30 = min((price30.get("coefficient_of_variation_pct") or 0) / 50, 1)
    cv7 = min((price7.get("coefficient_of_variation_pct") or 0) / 50, 1)
    volatility_score = _bounded_score((cv30 * 60) + (cv7 * 40)) if volatility_sufficient else None

    cards = [
        _risk_card(
            "Price Drop Risk",
            price_drop_score,
            f"{price30.get('price_drop_count', 0)} downward moves in the last 30 available trading days; largest drop was {price30.get('largest_price_drop_pct') or 0:.2f}%.",
            {"window": "30 trading days", "drop_count": price30.get("price_drop_count", 0), "largest_drop_pct": price30.get("largest_price_drop_pct")},
            price_sufficient,
        ),
        _risk_card(
            "Arrival Spike Risk",
            arrival_score,
            f"{arrivals.get('spike_count', 0)} arrival spikes exceeded the two-standard-deviation threshold in the 30-day window.",
            {"window": "30 trading days", "spike_count": arrivals.get("spike_count", 0), "coefficient_of_variation_pct": arrivals.get("coefficient_of_variation_pct"), "unit": arrivals.get("unit")},
            arrival_sufficient,
        ),
        _risk_card(
            "Weather Risk",
            weather_score,
            f"Observed temperature range was {weather.get('temperature_min_c')}°C–{weather.get('temperature_max_c')}°C with {weather.get('rainy_days_count', 0)} rainy days.",
            {"window": "30 available observations", "temperature_range_c": temperature_range, "rainfall_total_mm": weather.get("rainfall_total_mm"), "humidity_range_pct": humidity_range},
            weather_sufficient,
        ),
        _risk_card(
            "Price Volatility Risk",
            volatility_score,
            f"Price coefficient of variation was {price30.get('coefficient_of_variation_pct') or 0:.2f}% over 30 days and {price7.get('coefficient_of_variation_pct') or 0:.2f}% over 7 days.",
            {"last_7_trading_days": price7.get("coefficient_of_variation_pct"), "last_30_trading_days": price30.get("coefficient_of_variation_pct"), "price_unit": risk_data.get("historical_coverage", {}).get("price_unit")},
            volatility_sufficient,
        ),
    ]
    valid_scores = [card["score"] for card in cards if card["score"] is not None]
    overall = round(sum(valid_scores) / len(valid_scores)) if len(valid_scores) == len(cards) else None

    model_metrics = risk_data.get("ml_forecast", {}).get("model_metrics", [])
    forecast_movement = []
    latest_price = risk_data.get("historical_coverage", {}).get("latest_observed_price")
    for item in risk_data.get("ml_forecast", {}).get("forecasts", []):
        prediction = item.get("prediction")
        forecast_movement.append({
            "horizon_days": item.get("horizon_days"),
            "target_date": item.get("target_date"),
            "predicted_price": prediction,
            "change_from_latest_observed_pct": round(((prediction - latest_price) / latest_price) * 100, 2) if latest_price else None,
            "status": item.get("status"),
            "method": item.get("method"),
        })
        if item.get("status") == "baseline_estimate":
            warnings.append({"code": "BASELINE_FORECAST", "message": f"Horizon {item.get('horizon_days')} uses an approved baseline estimate."})
    if risk_data.get("freshness", {}).get("is_stale"):
        warnings.append({"code": "STALE_HISTORICAL_DATA", "message": "Historical observations are stale and are not live market conditions."})

    return {
        "risk_cards": cards,
        "overall_risk_index": overall,
        "overall_risk_level": _risk_level(overall),
        "sufficient_data": overall is not None,
        "forecasted_price_movement": forecast_movement,
        "model_metrics": model_metrics,
        "warnings": warnings,
    }
"""Market intelligence service functions operating on the cached DataFrame."""

from typing import Dict, Any, List, Optional
import pandas as pd
from data_loader import get_df, clean_record_for_json


def get_market_summary() -> Dict[str, Any]:
    """Return high-level summary statistics of the dataset."""
    df = get_df()

    commodities = sorted(df["commodity"].unique().tolist())
    states = sorted(df["state"].unique().tolist())
    mandis = sorted(df["market"].unique().tolist())
    districts = sorted(df["district"].unique().tolist())

    return {
        "status": "success",
        "total_records": int(len(df)),
        "unique_crops_count": len(commodities),
        "unique_states_count": len(states),
        "unique_mandis_count": len(mandis),
        "unique_districts_count": len(districts),
        "earliest_date": str(df["date"].min()),
        "latest_date": str(df["date"].max()),
        "states": states,
        "districts": districts,
        "commodities": commodities,
        "mandis": mandis,
    }


def get_commodities(state: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return available crops/commodities, optionally filtered by state."""
    df = get_df()
    if state:
        df = df[df["state"].str.lower() == state.strip().lower()]

    results = []
    for commodity, group in df.groupby("commodity"):
        price_units = group["price_unit"].unique().tolist()
        arrival_units = group["arrival_unit"].unique().tolist()
        results.append({
            "commodity": commodity,
            "commodity_group": group["commodity_group"].iloc[0],
            "price_unit": price_units[0] if len(price_units) == 1 else ", ".join(price_units),
            "arrival_unit": arrival_units[0] if len(arrival_units) == 1 else ", ".join(arrival_units),
            "record_count": int(len(group)),
            "latest_price": float(group["modal_price"].iloc[-1]),
            "latest_date": str(group["date"].max()),
        })

    return sorted(results, key=lambda x: x["record_count"], reverse=True)


def get_states() -> List[Dict[str, Any]]:
    """Return available states and their respective districts."""
    df = get_df()
    results = []
    for state, group in df.groupby("state"):
        districts = sorted(group["district"].unique().tolist())
        results.append({
            "state": state,
            "districts": districts,
            "total_records": int(len(group)),
            "total_mandis": int(group["market"].nunique()),
        })
    return results


def get_mandis(
    state: Optional[str] = None,
    commodity: Optional[str] = None,
    district: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return list of mandis filtered by state, commodity, and/or district."""
    df = get_df()

    if state:
        df = df[df["state"].str.lower() == state.strip().lower()]
    if district:
        df = df[df["district"].str.lower() == district.strip().lower()]
    if commodity:
        df = df[df["commodity"].str.lower() == commodity.strip().lower()]

    results = []
    for market, group in df.groupby("market"):
        results.append({
            "market": market,
            "district": group["district"].iloc[0],
            "state": group["state"].iloc[0],
            "total_records": int(len(group)),
            "commodities_count": int(group["commodity"].nunique()),
            "latest_date": str(group["date"].max()),
        })

    return sorted(results, key=lambda x: x["market"])


def get_prices(
    commodity: Optional[str] = None,
    state: Optional[str] = None,
    market: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """Return paginated price records with multi-field filtering."""
    df = get_df()

    if commodity:
        df = df[df["commodity"].str.lower() == commodity.strip().lower()]
    if state:
        df = df[df["state"].str.lower() == state.strip().lower()]
    if market:
        df = df[df["market"].str.lower() == market.strip().lower()]
    if start_date:
        df = df[df["date"] >= start_date.strip()]
    if end_date:
        df = df[df["date"] <= end_date.strip()]

    total_count = len(df)
    paginated_df = df.iloc[offset : offset + limit]

    cols_to_return = [
        "state",
        "district",
        "market",
        "commodity_group",
        "commodity",
        "date",
        "arrival_quantity",
        "arrival_unit",
        "modal_price",
        "price_unit",
    ]

    records = [clean_record_for_json(r) for r in paginated_df[cols_to_return].to_dict(orient="records")]

    return {
        "total_records": total_count,
        "limit": limit,
        "offset": offset,
        "returned_records": len(records),
        "records": records,
    }


def get_trends(
    commodity: str,
    market: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """Return chronological modal price and arrival trend for a commodity and mandi."""
    df = get_df()

    filtered = df[
        (df["commodity"].str.lower() == commodity.strip().lower())
        & (df["market"].str.lower() == market.strip().lower())
    ]

    if start_date:
        filtered = filtered[filtered["date"] >= start_date.strip()]
    if end_date:
        filtered = filtered[filtered["date"] <= end_date.strip()]

    if filtered.empty:
        return {
            "commodity": commodity,
            "market": market,
            "found": False,
            "message": f"No historical records found for '{commodity}' at '{market}'",
            "price_unit": None,
            "arrival_unit": None,
            "data": [],
        }

    # Chronological sort
    filtered = filtered.sort_values(by="date")

    # If limit is requested, take the most recent `limit` records
    if len(filtered) > limit:
        filtered = filtered.tail(limit)

    cols = ["date", "modal_price", "arrival_quantity"]
    records = [clean_record_for_json(r) for r in filtered[cols].to_dict(orient="records")]

    return {
        "commodity": filtered["commodity"].iloc[0],
        "market": filtered["market"].iloc[0],
        "found": True,
        "price_unit": filtered["price_unit"].iloc[0],
        "arrival_unit": filtered["arrival_unit"].iloc[0],
        "total_points": len(records),
        "data": records,
    }


def get_arrivals(
    commodity: str,
    market: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """Return historical arrival quantities for a commodity."""
    df = get_df()

    filtered = df[df["commodity"].str.lower() == commodity.strip().lower()]
    if market:
        filtered = filtered[filtered["market"].str.lower() == market.strip().lower()]
    if start_date:
        filtered = filtered[filtered["date"] >= start_date.strip()]
    if end_date:
        filtered = filtered[filtered["date"] <= end_date.strip()]

    if filtered.empty:
        return {
            "commodity": commodity,
            "market": market,
            "found": False,
            "data": [],
        }

    filtered = filtered.sort_values(by="date")
    if len(filtered) > limit:
        filtered = filtered.tail(limit)

    cols = ["date", "market", "arrival_quantity", "arrival_unit"]
    records = [clean_record_for_json(r) for r in filtered[cols].to_dict(orient="records")]

    return {
        "commodity": commodity,
        "market": market or "All Mandis",
        "found": True,
        "arrival_unit": filtered["arrival_unit"].iloc[0],
        "total_points": len(records),
        "data": records,
    }


def get_compare(
    commodity: str,
    state: Optional[str] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """
    Compare latest observed prices for a crop across all mandis where it trades.
    Includes exact observation dates and warns if dates differ.
    """
    df = get_df()

    filtered = df[df["commodity"].str.lower() == commodity.strip().lower()]
    if state:
        filtered = filtered[filtered["state"].str.lower() == state.strip().lower()]

    if filtered.empty:
        return {
            "commodity": commodity,
            "found": False,
            "message": f"No mandi observations found for '{commodity}'",
            "all_dates_identical": True,
            "data": [],
        }

    # For each market, extract the single latest date record
    idx_latest = filtered.groupby("market")["date"].idxmax()
    latest_per_market = filtered.loc[idx_latest].sort_values(by="modal_price", ascending=False)

    if len(latest_per_market) > limit:
        latest_per_market = latest_per_market.head(limit)

    cols = [
        "market",
        "district",
        "state",
        "date",
        "modal_price",
        "price_unit",
        "arrival_quantity",
        "arrival_unit",
    ]
    records = [clean_record_for_json(r) for r in latest_per_market[cols].to_dict(orient="records")]

    unique_dates = {r["date"] for r in records}

    return {
        "commodity": filtered["commodity"].iloc[0],
        "price_unit": filtered["price_unit"].iloc[0],
        "arrival_unit": filtered["arrival_unit"].iloc[0],
        "found": True,
        "total_compared_mandis": len(records),
        "all_dates_identical": len(unique_dates) <= 1,
        "observation_dates": sorted(list(unique_dates)),
        "data": records,
    }

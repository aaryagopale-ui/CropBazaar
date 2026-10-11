
import pandas as pd


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """Clean AGMARKNET mandi data without modifying the raw source."""

    df = df.copy()
    df.columns = df.columns.str.strip()

    # Remove fully empty rows.
    df = df.dropna(how="all")

    # Remove report-footer rows, if present.
    if "State/UT" in df.columns:
        state_values = df["State/UT"].astype(str).str.strip()
        footer = (
            state_values.eq("Note:")
            | state_values.str.contains(
                "Weighted Average Price", case=False, na=False
            )
        )
        df = df.loc[~footer].copy()

    # Standardize column names.
    rename_map = {}
    for col in df.columns:
        if col.startswith("Arrival Quantity"):
            rename_map[col] = "arrival_quantity"
        elif col.startswith("Modal Price"):
            rename_map[col] = "modal_price"

    rename_map.update({
        "State/UT": "state",
        "District": "district",
        "Market": "market",
        "Commodity Group": "commodity_group",
        "Commodity": "commodity",
        "Date": "date",
        "Arrival Unit": "arrival_unit",
        "Price Unit": "price_unit",
    })

    df = df.rename(columns=rename_map)

    # Convert dates and numerical fields.
    df["date"] = pd.to_datetime(
        df["date"], format="%d-%m-%Y", errors="coerce"
    )
    df["arrival_quantity"] = pd.to_numeric(
        df["arrival_quantity"], errors="coerce"
    )
    df["modal_price"] = pd.to_numeric(
        df["modal_price"], errors="coerce"
    )

    # Keep valid observations with a usable price target.
    df = df.dropna(subset=["date", "modal_price"])
    df = df[df["modal_price"] > 0]

    # Normalize text fields.
    for col in [
        "state", "district", "market",
        "commodity_group", "commodity",
        "arrival_unit", "price_unit",
    ]:
        df[col] = df[col].astype("string").str.strip()

    # Sort chronologically within each market and commodity.
    df = df.sort_values(
        ["commodity", "market", "date"]
    ).reset_index(drop=True)

    return df

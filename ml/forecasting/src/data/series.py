"""Build and load the compact, versioned price series used by the pipeline.

`data/raw/mandi_data.csv` (all AGMARKNET markets/commodities, ~4 MB) is not versioned.
`prepare_series_store` distils it to the supported commodity/market series so that a
clean clone can run evaluation and serving without the raw download.
"""

from pathlib import Path

import pandas as pd

from src import config
from src.data.clean_data import clean_data

SERIES_COLUMNS = [
    "commodity", "market", "date", "modal_price", "price_unit",
    "arrival_quantity", "arrival_unit",
]
WEATHER_RENAME = {
    "time": "date",
    "temperature_2m_mean (°C)": "temperature_mean_c",
    "temperature_2m_max (°C)": "temperature_max_c",
    "temperature_2m_min (°C)": "temperature_min_c",
    "precipitation_sum (mm)": "precipitation_mm",
    "rain_sum (mm)": "rain_mm",
    "precipitation_hours (h)": "precipitation_hours",
    "relative_humidity_2m_mean (%)": "relative_humidity_mean_pct",
}


class DataError(ValueError):
    """The price/weather data is missing or malformed."""


def read_raw_mandi(path: Path) -> pd.DataFrame:
    """Read an AGMARKNET export, skipping the report-title line if present."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Raw mandi file not found: {path}")
    with open(path, encoding="utf-8-sig") as handle:
        first = handle.readline()
    skip = 0 if first.lstrip().startswith("State/UT") else 1
    return pd.read_csv(path, skiprows=skip)


def prepare_series_store(
    raw_mandi: Path = config.RAW_MANDI_PATH,
    raw_weather: Path = config.RAW_WEATHER_PATH,
    series_out: Path = config.SERIES_PATH,
    weather_out: Path = config.WEATHER_PATH,
) -> dict:
    """Extract the supported series from the raw export. Returns a data-quality summary."""
    cleaned = clean_data(read_raw_mandi(raw_mandi))
    summary = {}
    frames = []
    for commodity, markets in config.SUPPORTED_SERIES.items():
        for market in markets:
            part = cleaned[
                (cleaned["commodity"] == commodity) & (cleaned["market"] == market)
            ]
            if part.empty:
                raise DataError(f"No records for {commodity} at {market} in {raw_mandi}")
            units = set(part["price_unit"].dropna().unique())
            if units != {config.PRICE_UNIT}:
                raise DataError(
                    f"{commodity}/{market}: expected price unit {config.PRICE_UNIT}, got {units}"
                )
            duplicates = int(part["date"].duplicated().sum())
            part = part.sort_values("date").drop_duplicates("date", keep="last")
            frames.append(part[SERIES_COLUMNS])
            summary[(commodity, market)] = {
                "rows": len(part),
                "first_date": part["date"].min().date().isoformat(),
                "last_date": part["date"].max().date().isoformat(),
                "duplicate_dates_dropped": duplicates,
            }
    series = pd.concat(frames, ignore_index=True)
    Path(series_out).parent.mkdir(parents=True, exist_ok=True)
    series.assign(date=series["date"].dt.strftime("%Y-%m-%d")).to_csv(series_out, index=False)

    weather = pd.read_csv(raw_weather, skiprows=3).rename(columns=WEATHER_RENAME)
    missing = set(WEATHER_RENAME.values()) - set(weather.columns)
    if missing:
        raise DataError(f"Weather file missing columns: {sorted(missing)}")
    weather["date"] = pd.to_datetime(weather["date"])
    weather.sort_values("date").assign(
        date=lambda d: d["date"].dt.strftime("%Y-%m-%d")
    ).to_csv(weather_out, index=False)
    return summary


def load_series(commodity: str, market: str, path: Path = None) -> pd.DataFrame:
    """Return one series as columns [date, modal_price, arrival_quantity], unique sorted dates."""
    path = Path(path or config.SERIES_PATH)
    if not path.exists():
        raise DataError(
            f"Series store not found: {path}. Run `python run_pipeline.py prepare` "
            "(needs data/raw/mandi_data.csv) or restore the versioned file."
        )
    store = pd.read_csv(path, parse_dates=["date"])
    series = store[(store["commodity"] == commodity) & (store["market"] == market)]
    if series.empty:
        raise DataError(f"No data for {commodity} at {market} in {path}")
    series = series.sort_values("date")
    if series["date"].duplicated().any():
        raise DataError(f"Duplicate dates in series {commodity}/{market}")
    if not (series["modal_price"] > 0).all():
        raise DataError(f"Non-positive prices in series {commodity}/{market}")
    if set(series["price_unit"].unique()) != {config.PRICE_UNIT}:
        raise DataError(f"Mixed or unexpected price units in {commodity}/{market}")
    return series[["date", "modal_price", "arrival_quantity"]].reset_index(drop=True)


def load_weather(path: Path = None):
    """Daily weather indexed by date, or None if the file is absent (weather is optional)."""
    path = Path(path or config.WEATHER_PATH)
    if not path.exists():
        return None
    weather = pd.read_csv(path, parse_dates=["date"]).set_index("date").sort_index()
    return weather.resample("D").mean()

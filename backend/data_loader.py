"""Data loader and in-memory cache for merged_mandi_weather.csv."""

import os
from pathlib import Path
from typing import Dict, Any, Optional
import pandas as pd
import numpy as np

# In-memory cached DataFrame
_DF: Optional[pd.DataFrame] = None
_DATASET_PATH: Optional[str] = None


def find_dataset_path() -> str:
    """Locate merged_mandi_weather.csv from possible relative or absolute paths."""
    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent

    candidates = []

    # 1. Environment variable if explicitly supplied
    env_path = os.getenv("DATASET_PATH")
    if env_path:
        candidates.append(Path(env_path))

    # 2. Filesystem candidates relative to backend and repo root
    candidates.extend([
        # Repository root, resolved independently of the process working directory
        project_root / "merged_mandi_weather.csv",
        project_root / "data" / "merged_mandi_weather.csv",
        backend_dir / "merged_mandi_weather.csv",
        backend_dir / "data" / "merged_mandi_weather.csv",
        # Relative to current working directory
        Path("merged_mandi_weather.csv"),
        Path("../merged_mandi_weather.csv"),
        Path("data/merged_mandi_weather.csv"),
        Path("../data/merged_mandi_weather.csv"),
        Path("backend/data/merged_mandi_weather.csv"),
        Path("../backend/data/merged_mandi_weather.csv"),
        # Absolute paths for Syrus7_MindForge and CropBazaarr
        Path("/Users/aaryagopale/Desktop/Syrus7_MindForge/data/merged_mandi_weather.csv"),
        Path("/Users/aaryagopale/Desktop/CropBazaarr/backend/data/merged_mandi_weather.csv"),
    ])

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate.resolve())

    raise FileNotFoundError(
        "Could not locate merged_mandi_weather.csv. Checked candidates: "
        + ", ".join(str(c) for c in candidates)
    )


def load_dataset() -> pd.DataFrame:
    """Load, validate, and cache the mandi-weather dataset."""
    global _DF, _DATASET_PATH

    if _DF is not None:
        return _DF

    _DATASET_PATH = find_dataset_path()

    df = pd.read_csv(_DATASET_PATH)

    # Validate essential columns
    required_cols = [
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
        "temperature_mean_c",
        "temperature_max_c",
        "temperature_min_c",
        "precipitation_mm",
        "rain_mm",
        "precipitation_hours",
        "relative_humidity_mean_pct",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")

    # Standardize string fields
    str_cols = ["state", "district", "market", "commodity_group", "commodity", "arrival_unit", "price_unit"]
    for col in str_cols:
        df[col] = df[col].astype(str).str.strip()

    # Ensure date format YYYY-MM-DD
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")

    # Ensure numeric types
    num_float_cols = [
        "arrival_quantity",
        "modal_price",
        "temperature_mean_c",
        "temperature_max_c",
        "temperature_min_c",
        "precipitation_mm",
        "rain_mm",
        "precipitation_hours",
    ]
    for col in num_float_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["relative_humidity_mean_pct"] = pd.to_numeric(df["relative_humidity_mean_pct"], errors="coerce").fillna(0).astype(int)

    # Sort chronologically by default
    df = df.sort_values(by=["date", "market", "commodity"]).reset_index(drop=True)

    _DF = df
    return _DF


def get_df() -> pd.DataFrame:
    """Return the cached DataFrame, loading it if not already initialized."""
    if _DF is None:
        return load_dataset()
    return _DF


def clean_record_for_json(record: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure all dictionary values are JSON serializable (no NaN or Inf)."""
    cleaned = {}
    for k, v in record.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            cleaned[k] = None
        elif isinstance(v, (np.floating, float)):
            cleaned[k] = round(float(v), 2)
        elif isinstance(v, (np.integer, int)):
            cleaned[k] = int(v)
        else:
            cleaned[k] = v
    return cleaned

"""Central configuration for the CropBazaar forecasting pipeline.

Everything that defines *what* is forecast and *how it is judged* lives here so that
training, evaluation and serving cannot drift apart.
"""

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# --- Paths ---------------------------------------------------------------------------
RAW_MANDI_PATH = ROOT / "data/raw/mandi_data.csv"
RAW_WEATHER_PATH = ROOT / "data/raw/nashik_historical_weather.csv"
SERIES_PATH = ROOT / "data/series/price_series.csv"
WEATHER_PATH = ROOT / "data/series/nashik_weather_daily.csv"
REPORTS_DIR = ROOT / "reports"
POLICY_PATH = ROOT / "artifacts/forecast_policy.json"

# --- Forecast contract ---------------------------------------------------------------
PRICE_UNIT = "Rs./Quintal"
HORIZONS = tuple(range(1, 8))  # calendar days ahead of the forecast origin
SCHEMA_VERSION = "1.0"

# Supported (commodity -> markets). The first market is the default.
# Only these pairs have been evaluated, so only these are served.
SUPPORTED_SERIES = {
    "Onion": ("Lasalgaon(Vinchur)",),
    "Tomato": ("APMC Pimpalgaon Baswant",),
    "Brinjal": ("APMC Nasik",),
    "Cabbage": ("APMC Nasik",),
    "Cauliflower": ("APMC Nasik",),
}

# --- Feature / history requirements --------------------------------------------------
ASOF_LAG_DAYS = (1, 2, 3, 7, 14)  # "last price observed on or before origin - k days"
MEAN_WINDOWS_DAYS = (7, 28)  # calendar windows ending at (and including) the origin
MIN_HISTORY_DAYS = max(ASOF_LAG_DAYS)  # calendar days of history needed before the origin
MIN_TRAIN_ROWS = 100
RET_CLIP = 1.0  # winsorise log-ratio features to [-1, 1] (source has isolated bad prints)
TARGET_CLIP = 1.0  # clip the *training* target only; evaluation always uses raw prices
WEATHER_WINDOW_DAYS = 7

# --- Evaluation protocol -------------------------------------------------------------
# Expanding-window validation folds: (test origin start inclusive, end exclusive).
VALIDATION_FOLDS = (
    ("2025-01-01", "2025-04-01"),
    ("2025-04-01", "2025-07-01"),
    ("2025-07-01", "2025-10-01"),
    ("2025-10-01", "2026-01-01"),
    ("2026-01-01", "2026-04-01"),
)
# Untouched final holdout: never used for model selection, only for confirmation.
HOLDOUT_START = "2026-04-01"
MIN_FOLD_TEST_ROWS = 10
BOOTSTRAP_BLOCK = 14
BOOTSTRAP_DRAWS = 2000
RANDOM_SEED = 42


@dataclass(frozen=True)
class ApprovalCriteria:
    """Predefined rules a model must pass to be served as `validated_model`.

    Fixed before looking at results. A model is compared with the *best baseline on the
    validation folds* (the strongest simple competitor), never with a weaker one.
    """

    min_improvement_pct: float = 2.0  # pooled validation MAE vs best baseline
    min_folds_won_fraction: float = 0.6  # fraction of validation folds with lower MAE
    min_valid_folds: int = 3
    require_ci_excludes_zero: bool = True  # 95% block-bootstrap CI of MAE difference < 0
    min_holdout_rows: int = 20
    require_holdout_mae_better: bool = True
    require_rmse_not_worse: bool = True  # on both validation and holdout


CRITERIA = ApprovalCriteria()

# Bumped whenever feature definitions / candidate configs change so that an old policy
# file can never be silently applied to new code.
POLICY_COMPAT_VERSION = 1

# --- Serving -------------------------------------------------------------------------
STALE_WARNING_DAYS = 3
STALE_ERROR_DAYS = 14
ANOMALY_RATIO = 2.0  # last price vs median of recent prices
RARE_WEEKDAY_REPORT_RATE = 0.2
POLICY_STALE_DAYS = 120

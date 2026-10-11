"""Candidate forecasters, all behind one interface so they are scored identically.

Every ML candidate predicts the log-ratio `log(target / last_price)` and is converted back to
a price, so a model can only *adjust* persistence, never invent a price level. Hyper-parameters
are fixed here, a priori; they are not tuned on validation or holdout data.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from src import config
from src.features.forecast_features import FEATURE_SETS


class Forecaster:
    """Common interface: fit(frame) -> self, predict(frame) -> prices (Rs./quintal)."""

    name = ""
    kind = ""  # "baseline" | "model"
    feature_set = None

    def fit(self, frame: pd.DataFrame):
        return self

    def predict(self, frame: pd.DataFrame) -> np.ndarray:
        raise NotImplementedError

    def missing_features(self, frame: pd.DataFrame) -> list:
        return []


class Persistence(Forecaster):
    name, kind = "persistence", "baseline"

    def predict(self, frame):
        return frame["last_price"].to_numpy(dtype=float)


class RollingMean7(Forecaster):
    """Mean of prices observed in the 7 calendar days ending at the origin (inclusive)."""

    name, kind = "rolling_mean_7d", "baseline"

    def predict(self, frame):
        return frame["mean_7d_price"].to_numpy(dtype=float)


class LogRatioModel(Forecaster):
    kind = "model"

    def __init__(self, name: str, estimator_factory, feature_set: str, scale: bool):
        self.name = name
        self.feature_set = feature_set
        self.columns = list(FEATURE_SETS[feature_set])
        steps = [SimpleImputer(strategy="median", keep_empty_features=True)]
        if scale:
            steps.append(StandardScaler())
        steps.append(estimator_factory())
        self.pipeline = make_pipeline(*steps)
        self._fitted = False

    def fit(self, frame):
        y = frame["target_log_ratio"].clip(-config.TARGET_CLIP, config.TARGET_CLIP)
        if y.isna().any():
            raise ValueError("training frame contains rows without an observed target")
        self.pipeline.fit(frame[self.columns], y)
        self._fitted = True
        return self

    def predict(self, frame):
        if not self._fitted:
            raise RuntimeError(f"{self.name} has not been fitted")
        log_ratio = self.pipeline.predict(frame[self.columns])
        prices = frame["last_price"].to_numpy(dtype=float) * np.exp(log_ratio)
        if not np.isfinite(prices).all():
            raise ValueError(f"{self.name} produced non-finite predictions")
        return prices

    def missing_features(self, frame):
        row = frame[self.columns].iloc[-1]
        return [c for c in self.columns if pd.isna(row[c])]


def _ridge():
    return RidgeCV(
        alphas=np.logspace(-1, 3, 9),
        cv=TimeSeriesSplit(n_splits=3),
        scoring="neg_mean_absolute_error",
    )


def _random_forest():
    return RandomForestRegressor(
        n_estimators=300, min_samples_leaf=5, max_features=0.5,
        random_state=config.RANDOM_SEED, n_jobs=1,
    )


def _xgboost():
    return XGBRegressor(
        n_estimators=200, max_depth=3, learning_rate=0.03, min_child_weight=5,
        subsample=0.8, colsample_bytree=0.8, objective="reg:squarederror",
        random_state=config.RANDOM_SEED, n_jobs=1,
    )


_MODEL_FAMILIES = {
    "ridge": (_ridge, True),
    "rf": (_random_forest, False),
    "xgb": (_xgboost, False),
}
BASELINE_NAMES = ("persistence", "rolling_mean_7d")
MODEL_NAMES = tuple(
    f"{family}_{fs}" for family in _MODEL_FAMILIES for fs in FEATURE_SETS
)
ALL_METHOD_NAMES = BASELINE_NAMES + MODEL_NAMES


def build_forecaster(name: str) -> Forecaster:
    """Create a fresh, unfitted forecaster by name."""
    if name == "persistence":
        return Persistence()
    if name == "rolling_mean_7d":
        return RollingMean7()
    family, _, feature_set = name.partition("_")
    if family not in _MODEL_FAMILIES or feature_set not in FEATURE_SETS:
        raise KeyError(f"Unknown method '{name}'. Known: {ALL_METHOD_NAMES}")
    factory, scale = _MODEL_FAMILIES[family]
    return LogRatioModel(name, factory, feature_set, scale)

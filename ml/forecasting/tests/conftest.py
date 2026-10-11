import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src import config


def make_series(start="2024-01-01", days=400, seed=0, drop_frac=0.1, skip_sunday=True,
                base=1000.0) -> pd.DataFrame:
    """Synthetic irregularly-reported mandi series: columns [date, modal_price, arrival_quantity]."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(start, periods=days, freq="D")
    keep = np.ones(days, dtype=bool)
    if skip_sunday:
        keep &= dates.dayofweek != 6
    keep &= rng.random(days) > drop_frac
    dates = dates[keep]
    price = base * np.exp(np.cumsum(rng.normal(0, 0.03, len(dates))))
    return pd.DataFrame({
        "date": dates,
        "modal_price": np.round(price, 0),
        "arrival_quantity": np.round(rng.uniform(5, 100, len(dates)), 1),
    })


def make_weather(start="2023-12-01", days=900, seed=1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start, periods=days, freq="D")
    return pd.DataFrame({
        "temperature_mean_c": rng.normal(26, 3, days),
        "precipitation_mm": rng.gamma(1, 3, days),
        "relative_humidity_mean_pct": rng.uniform(30, 90, days),
    }, index=idx)


@pytest.fixture
def series():
    return make_series()


@pytest.fixture
def weather():
    return make_weather()


@pytest.fixture
def policy_copy(tmp_path):
    """A writable copy of the committed policy for tests that edit it."""
    target = tmp_path / "policy.json"
    shutil.copy(config.POLICY_PATH, target)
    return target


def edit_policy(path: Path, commodity: str, market: str, horizon: int, **changes):
    policy = json.loads(path.read_text())
    key = f"{commodity}|{market}|{horizon}"
    policy["cells"][key].update(changes)
    path.write_text(json.dumps(policy))

import pandas as pd
import pytest

from src import config
from src.data.series import DataError, load_series, load_weather, prepare_series_store, read_raw_mandi

RAW_HEADER = ("State/UT,District,Market,Commodity Group,Commodity,Date,Arrival Quantity 01-01-2024 to 06-10-2026,"
              "Arrival Unit,Modal Price 01-01-2024 to 06-10-2026,Price Unit")


def write_raw(path, rows, title=True):
    lines = ([",,,,,All Type of Report (All Grades),,,,"] if title else []) + [RAW_HEADER] + rows
    path.write_text("\n".join(lines) + "\n")


def test_committed_series_store_is_complete_and_clean():
    for commodity, markets in config.SUPPORTED_SERIES.items():
        for market in markets:
            s = load_series(commodity, market)
            assert len(s) > 600 and s["date"].is_monotonic_increasing and s["date"].is_unique
            assert (s["modal_price"] > 0).all()
    assert load_weather() is not None


def test_read_raw_skips_title_line_and_prepare_filters_series(tmp_path):
    rows = ["Maharashtra,Nashik,Lasalgaon(Vinchur) ,Vegetables,Onion,01-01-2024,10.0,Metric Tonnes,2000.00,Rs./Quintal",
            "Maharashtra,Nashik,Lasalgaon(Vinchur),Vegetables,Onion,02-01-2024,12.0,Metric Tonnes,2100.00,Rs./Quintal",
            "Maharashtra,Nashik,Elsewhere,Vegetables,Onion,02-01-2024,12.0,Metric Tonnes,1.00,Rs./Quintal"]
    for title in (True, False):
        raw = tmp_path / f"raw{title}.csv"
        write_raw(raw, rows, title=title)
        assert "State/UT" in read_raw_mandi(raw).columns


def test_prepare_rejects_missing_series_and_wrong_units(tmp_path):
    raw = tmp_path / "raw.csv"
    write_raw(raw, ["Maharashtra,Nashik,Lasalgaon(Vinchur),Vegetables,Onion,01-01-2024,10.0,Metric Tonnes,2000.00,Rs./Quintal"])
    with pytest.raises(DataError, match="No records"):
        prepare_series_store(raw, config.RAW_WEATHER_PATH, tmp_path / "s.csv", tmp_path / "w.csv")


def test_load_series_errors(tmp_path):
    with pytest.raises(DataError, match="not found"):
        load_series("Onion", "Lasalgaon(Vinchur)", tmp_path / "nope.csv")
    with pytest.raises(DataError, match="No data"):
        load_series("Onion", "Nowhere")

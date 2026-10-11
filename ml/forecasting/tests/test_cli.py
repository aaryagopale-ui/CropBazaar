import json

from run_pipeline import main


def test_no_args_prints_help_and_succeeds(capsys):
    assert main([]) == 0
    assert "prepare" in capsys.readouterr().out


def test_unknown_subcommand_fails_with_exit_2(capsys):
    assert main(["nonsense"]) == 2


def test_forecast_subcommand_returns_json_and_error_exit_code(capsys):
    assert main(["forecast", "--commodity", "Onion", "--horizons", "1-7", "--reference-date", "2026-10-09"]) == 0
    assert len(json.loads(capsys.readouterr().out)["forecasts"]) == 7
    assert main(["forecast", "--commodity", "Onion", "--horizons", "8"]) == 2
    assert json.loads(capsys.readouterr().out)["error"]["code"] == "INVALID_HORIZON"

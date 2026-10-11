"""Single entry point for the CropBazaar forecasting pipeline.

    python run_pipeline.py prepare                      # raw AGMARKNET export -> data/series/
    python run_pipeline.py evaluate                     # backtest all models, write reports + policy
    python run_pipeline.py forecast --commodity Onion   # JSON forecast for horizons 1-7

Each subcommand is a thin wrapper over a module that can also be run directly
(`python -m src.evaluation.run_evaluation`, `python -m src.forecasting.predict`).
"""

import sys


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    command, rest = argv[0], argv[1:]
    if command == "prepare":
        from src.data.series import DataError, prepare_series_store
        try:
            summary = prepare_series_store()
        except (FileNotFoundError, DataError) as exc:
            print(f"prepare failed: {exc}", file=sys.stderr)
            print("Place the AGMARKNET export at data/raw/mandi_data.csv and the weather file at "
                  "data/raw/nashik_historical_weather.csv.", file=sys.stderr)
            return 2
        for (commodity, market), info in summary.items():
            print(f"{commodity:12s} {market:26s} {info}")
        return 0
    if command == "evaluate":
        from src.evaluation.run_evaluation import main as evaluate
        evaluate(rest)
        return 0
    if command == "forecast":
        from src.forecasting.predict import main as predict
        return predict(rest)
    print(f"Unknown command '{command}'.\n{__doc__}")
    return 2


if __name__ == "__main__":
    sys.exit(main())

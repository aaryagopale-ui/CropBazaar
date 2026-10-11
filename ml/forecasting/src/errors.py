"""Explicit error types. Each carries a stable machine-readable `code` for the backend."""


class ForecastError(Exception):
    code = "FORECAST_ERROR"

    def to_dict(self) -> dict:
        return {"code": self.code, "message": str(self)}


class UnsupportedCommodityError(ForecastError):
    code = "UNSUPPORTED_COMMODITY"


class UnsupportedMarketError(ForecastError):
    code = "UNSUPPORTED_MARKET"


class InvalidHorizonError(ForecastError):
    code = "INVALID_HORIZON"


class InvalidDateError(ForecastError):
    code = "INVALID_DATE"


class InsufficientHistoryError(ForecastError):
    code = "INSUFFICIENT_HISTORY"


class StaleDataError(ForecastError):
    code = "STALE_DATA"


class DataUnavailableError(ForecastError):
    code = "DATA_UNAVAILABLE"


class PolicyError(ForecastError):
    code = "POLICY_UNAVAILABLE"


class ModelFailureError(ForecastError):
    code = "MODEL_FAILURE"

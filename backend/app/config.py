import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')

@dataclass(frozen=True)
class Settings:
    database_url: str
    cors_origins: tuple[str, ...]
    cors_origin_regex: str | None
    market_data_mode: str
    history_path: Path
    history_source: str
    groq_api_key: str
    groq_model: str
    data_gov_api_key: str
    data_gov_resource_id: str
    provider_timeout: float = 15

@lru_cache
def get_settings() -> Settings:
    mode = os.getenv('MARKET_DATA_MODE', 'demo')
    if mode not in ('demo', 'historical_csv'):
        raise ValueError('MARKET_DATA_MODE must be demo or historical_csv; live forecast mode is not implemented.')
    path = ROOT / 'data/demo_history.csv' if mode == 'demo' else Path(os.environ['HISTORY_CSV_PATH']).expanduser()
    return Settings(
        database_url=os.getenv('DATABASE_URL', f'sqlite:///{ROOT / "cropbazaar.db"}'),
        cors_origins=tuple(x.strip() for x in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',') if x.strip()),
        cors_origin_regex=os.getenv('CORS_ORIGIN_REGEX') or None,
        market_data_mode=mode, history_path=path,
        history_source='Synthetic demo history' if mode == 'demo' else os.getenv('HISTORY_SOURCE', 'Operator-supplied historical CSV; freshness not verified'),
        groq_api_key=os.getenv('GROQ_API_KEY', ''), groq_model=os.getenv('GROQ_MODEL', 'llama-3.3-70b-versatile'),
        data_gov_api_key=os.getenv('DATA_GOV_API_KEY', ''), data_gov_resource_id=os.getenv('DATA_GOV_RESOURCE_ID', ''),
    )

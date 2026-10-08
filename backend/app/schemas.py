from datetime import date, datetime
from typing import Annotated, Generic, Literal, TypeVar
from pydantic import BaseModel, ConfigDict, Field, field_validator

CropName = Literal['Onion', 'Tomato', 'Wheat']
Language = Literal['English', 'Hindi', 'Marathi', 'Gujarati', 'Kannada', 'Punjabi']
NonNegative = Annotated[float, Field(ge=0, le=100000, allow_inf_nan=False)]
Quantity = Annotated[float, Field(gt=0, le=10000, allow_inf_nan=False)]
class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)
class Meta(BaseModel):
    request_id: str
    price_unit: Literal['INR/quintal'] = 'INR/quintal'
    quantity_unit: Literal['quintal'] = 'quintal'
class Provenance(BaseModel):
    source: str
    is_demo: bool
    is_live: bool = False
    history_as_of: date | None = None
    stale: bool = True
    warning: str
T = TypeVar('T')
class Envelope(BaseModel, Generic[T]):
    data: T
    meta: Meta
class ErrorInfo(BaseModel):
    code: str
    message: str
    details: list[dict] = Field(default_factory=list)
class ErrorEnvelope(BaseModel):
    error: ErrorInfo
    meta: Meta
class HealthData(BaseModel):
    status: str
    service: str = 'CropBazaar'
    database: str
    market_mode: str
    live_configured: bool
class CropItem(BaseModel):
    name: str
    unit: str = 'INR/quintal'
class StateItem(BaseModel):
    name: str
class MandiItem(BaseModel):
    id: str
    name: str
    state: str
    district: str
    lat: float
    lon: float
    location_note: str = 'City area, not a verified mandi gate'
class MandiInput(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    distance: float = Field(ge=0, le=3000, allow_inf_nan=False, description='Farmer-entered kilometres')

def default_mandis():
    return [MandiInput(name='Pune', distance=25), MandiInput(name='Nashik', distance=185), MandiInput(name='Mumbai', distance=150)]
class Costs(StrictModel):
    quantity: Quantity = 20
    transport_rate: float = Field(default=3, ge=0, le=100, description='INR/quintal/km')
    loading_charges: NonNegative = 0
    market_charges: float = Field(default=0, ge=0, le=100, description='Percentage of sale revenue')
    spoilage_percent: float = Field(default=1, ge=0, le=50, description='Daily quantity loss percentage')
    storage_rate: float = Field(default=8, ge=0, le=1000, description='INR/quintal/day')
class HarvestInput(Costs):
    name: str = Field(default='My farm', min_length=1, max_length=80)
    crop: CropName = 'Onion'
    state: str = Field(default='Maharashtra', min_length=1, max_length=80)
    district: str = Field(default='Pune', min_length=1, max_length=80)
    horizon: int = Field(default=7, ge=1, le=7)
    mandis: list[MandiInput] = Field(default_factory=default_mandis, min_length=3, max_length=8)
    urgency: Literal['Flexible', 'Within 3 days', 'Sell today'] = 'Flexible'
    language: Language = 'English'
    @field_validator('mandis')
    @classmethod
    def unique_mandis(cls, value):
        if len({m.name.casefold() for m in value}) != len(value):
            raise ValueError('Mandi names must be unique')
        return value
class ForecastRequest(StrictModel):
    crop: CropName = 'Onion'
    mandis: list[str] = Field(default_factory=lambda: ['Pune','Nashik','Mumbai'], min_length=1, max_length=8)
    horizon: int = Field(default=7, ge=1, le=7)
    @field_validator('mandis')
    @classmethod
    def validate_mandis(cls, value):
        if any(not v.strip() or len(v.strip())>80 for v in value) or len({v.strip().casefold() for v in value})!=len(value):
            raise ValueError('Provide unique non-empty mandi names, at most 80 characters each')
        return [v.strip() for v in value]
class ProfitRequest(Costs):
    price: NonNegative = Field(description='Farmer-entered INR/quintal; not a live price lookup')
    distance: float = Field(ge=0, le=3000)
    day: int = Field(default=0, ge=0, le=7)
class ProfitData(BaseModel):
    quantity: float
    initial_quantity: float
    lost_quantity: float
    gross: float
    transport: float
    loading: float
    market: float
    storage: float
    net: float
    day: int
    price: float
    price_source: str = 'Caller-supplied price; freshness is not verified'
class ForecastPoint(BaseModel):
    day: int
    date: date
    price: float
    low: float
    high: float
class ForecastMandi(BaseModel):
    mandi: str
    unavailable: bool = False
    reason: str | None = None
    price: float | None = None
    forecast: list[ForecastPoint] = Field(default_factory=list)
    mae: float | None = None
    history_as_of: date | None = None
class ForecastData(BaseModel):
    crop: str
    horizon: int
    mandis: list[ForecastMandi]
    model: str
    provenance: Provenance
class SaleOption(ProfitData):
    pass
class ComparisonMandi(ForecastMandi):
    distance: float
    index: int
    today: ProfitData | None = None
    best: SaleOption | None = None
    options: list[SaleOption] = Field(default_factory=list)
    net: float | None = None
    transport: float | None = None
class ComparisonData(BaseModel):
    crop: str
    quantity: float
    horizon: int
    mandis: list[ComparisonMandi]
    model: str
    provenance: Provenance
class RecommendationData(BaseModel):
    recommendation: ComparisonMandi | None
    action: Literal['Sell now','Wait','Switch market'] | None
    reasons: list[str]
    alternatives: list[dict]
    provenance: Provenance
class RiskIndicator(BaseModel):
    key: str
    level: str
    value: float
    unit: str
    reason: str
class RiskData(BaseModel):
    indicators: list[RiskIndicator]
    retained_quantity: float
    weather_included: bool = False
    warnings: list[str]
    provenance: Provenance
class ScenarioRequest(StrictModel):
    baseline: HarvestInput
    changes: HarvestInput | None = None
class AnalysisData(BaseModel):
    comparison: ComparisonData
    forecast: ForecastData
    risk: RiskData
    recommendation: RecommendationData
    profit: ProfitData | None
class ScenarioData(BaseModel):
    baseline: AnalysisData
    scenario: AnalysisData | None = None
    net_change: float | None = None
class FarmerData(HarvestInput):
    id: str
    created_at: datetime
    updated_at: datetime
class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    language: Language = 'English'
    context: HarvestInput | None = None
class ChatData(BaseModel):
    mode: Literal['offline','groq']
    answer: str
class HistoryRecord(BaseModel):
    date: date
    crop: str
    mandi: str
    price: float
class HistoryData(BaseModel):
    records: list[HistoryRecord]
    total: int
    offset: int
    limit: int
    provenance: Provenance
class WeatherData(BaseModel):
    source: str = 'Open-Meteo'
    is_live: bool = True
    daily: dict
    risk: str
    max_rain_probability: float
class LiveData(BaseModel):
    source: str = 'data.gov.in / AGMARKNET'
    is_demo: bool = False
    is_live: bool = False
    records: list[dict]
    note: str = 'Provider arrival dates determine freshness; this is an unverified provider snapshot, not model training data.'

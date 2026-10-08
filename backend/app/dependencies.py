from functools import lru_cache
import httpx
from fastapi import Depends, Request
from sqlalchemy.orm import Session
from .config import Settings, get_settings
from .db import get_db
from .schemas import Envelope, Meta
from .services.market import MarketService
from .services.decisions import DecisionService
from .services.farmers import FarmerService
from .services.providers import ProviderService

@lru_cache
def cached_market(settings: Settings):
    return MarketService(settings)
def get_market(settings: Settings=Depends(get_settings)):
    return cached_market(settings)
def get_decisions(market: MarketService=Depends(get_market)):
    return DecisionService(market)
def get_farmers(session: Session=Depends(get_db)):
    return FarmerService(session)
def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client
def get_providers(settings: Settings=Depends(get_settings),client: httpx.AsyncClient=Depends(get_http_client)):
    return ProviderService(settings,client)
def respond(request: Request,data):
    return Envelope(data=data,meta=Meta(request_id=request.state.request_id))

from datetime import date
from fastapi import APIRouter, Depends, Query, Request
from ..dependencies import get_market, respond
from ..schemas import Envelope, CropItem, StateItem, MandiItem, HistoryData, ForecastRequest, ForecastData, CropName
from ..services.catalog import CROPS, STATES, MANDIS
from ..services.market import MarketService

router=APIRouter(prefix='/api',tags=['Market intelligence'])
@router.get('/crops',response_model=Envelope[list[CropItem]])
def crops(request: Request):
    return respond(request,[CropItem(name=name) for name in CROPS])
@router.get('/states',response_model=Envelope[list[StateItem]])
def states(request: Request):
    return respond(request,[StateItem(name=name) for name in STATES])
@router.get('/mandis',response_model=Envelope[list[MandiItem]])
def mandis(request: Request,state: str | None=Query(None,max_length=80),district: str | None=Query(None,max_length=80)):
    records=[m for m in MANDIS if (not state or m['state'].casefold()==state.casefold()) and (not district or m['district'].casefold()==district.casefold())]
    return respond(request,[MandiItem(**m) for m in records])
@router.get('/prices/history',response_model=Envelope[HistoryData])
def history(request: Request,crop: CropName | None=None,mandi: str | None=Query(None,min_length=1,max_length=80),start_date: date | None=None,end_date: date | None=None,offset: int=Query(0,ge=0),limit: int=Query(1000,ge=1,le=5000),market: MarketService=Depends(get_market)):
    return respond(request,market.history(crop,mandi,start_date,end_date,offset,limit))
@router.post('/forecast',response_model=Envelope[ForecastData])
def forecast(body: ForecastRequest,request: Request,market: MarketService=Depends(get_market)):
    return respond(request,market.forecast(body.crop,body.mandis,body.horizon))

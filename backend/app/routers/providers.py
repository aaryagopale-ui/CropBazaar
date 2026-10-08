from fastapi import APIRouter, Depends, Query, Request
from ..dependencies import get_providers, respond
from ..schemas import Envelope, ChatRequest, ChatData, WeatherData, LiveData
from ..services.providers import ProviderService

router=APIRouter(prefix='/api',tags=['Assistant and external providers'])
@router.post('/chat',response_model=Envelope[ChatData])
async def chat(body: ChatRequest,request: Request,service: ProviderService=Depends(get_providers)):
    return respond(request,await service.chat(body))
@router.get('/weather',response_model=Envelope[WeatherData])
async def weather(request: Request,lat: float=Query(18.5204,ge=-90,le=90,allow_inf_nan=False),lon: float=Query(73.8567,ge=-180,le=180,allow_inf_nan=False),service: ProviderService=Depends(get_providers)):
    return respond(request,await service.weather(lat,lon))
@router.get('/market/live',response_model=Envelope[LiveData])
async def live(request: Request,service: ProviderService=Depends(get_providers)):
    return respond(request,await service.live())

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from ..config import Settings, get_settings
from ..db import get_db
from ..dependencies import respond
from ..schemas import Envelope, HealthData
router=APIRouter(prefix='/api',tags=['System'])
@router.get('/health',response_model=Envelope[HealthData])
def health(request: Request,db: Session=Depends(get_db),settings: Settings=Depends(get_settings)):
    db.execute(text('SELECT 1'))
    return respond(request,HealthData(status='ok',database='ok',market_mode=settings.market_data_mode,live_configured=bool(settings.data_gov_api_key and settings.data_gov_resource_id)))

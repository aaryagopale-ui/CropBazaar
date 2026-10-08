"""CropBazaar composition root: routes, lifespan, CORS and error middleware."""
import logging
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .db import Base, engine
from .errors import install_handlers
from .routers import market, decisions, farmers, providers, system
from .schemas import Envelope, ComparisonData, ChatData, ErrorEnvelope

logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(name)s %(message)s')
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logger=logging.getLogger('cropbazaar')

def create_app(config=None,database_engine=None):
    settings=config or get_settings()
    db_engine=database_engine or engine
    @asynccontextmanager
    async def lifespan(app):
        Base.metadata.create_all(db_engine)
        async with httpx.AsyncClient(timeout=settings.provider_timeout) as client:
            app.state.http_client=client
            yield
    app=FastAPI(title='CropBazaar API',version='2.0.0',lifespan=lifespan,description='Prices: INR per quintal. Quantities: quintals. Market data is synthetic or explicitly configured historical data; never automatically labeled live.')
    if config is not None:
        app.dependency_overrides[get_settings]=lambda: settings
    install_handlers(app)
    @app.middleware('http')
    async def request_context(request,call_next):
        request.state.request_id=str(uuid4());start=perf_counter()
        try:
            response=await call_next(request)
        except Exception as exc:
            response=await app.exception_handlers[Exception](request,exc)
        response.headers['X-Request-ID']=request.state.request_id
        route=getattr(request.scope.get('route'),'path','unmatched')
        logger.info('%s %s status=%s duration_ms=%.1f request_id=%s',request.method,route,response.status_code,(perf_counter()-start)*1000,request.state.request_id)
        return response
    app.add_middleware(CORSMiddleware,allow_origins=list(settings.cors_origins),allow_origin_regex=settings.cors_origin_regex,allow_credentials=False,allow_methods=['GET','POST','PUT','OPTIONS'],allow_headers=['Content-Type','Authorization'],expose_headers=['X-Request-ID'])
    errors={status:{'model':ErrorEnvelope} for status in [404,422,500,502,503]}
    for router in [system.router,market.router,decisions.router,farmers.router,providers.router]:
        app.include_router(router,responses=errors)
    app.add_api_route('/api/compare',decisions.compare,methods=['POST'],deprecated=True,response_model=Envelope[ComparisonData],tags=['Legacy aliases'])
    app.add_api_route('/api/assistant',providers.chat,methods=['POST'],deprecated=True,response_model=Envelope[ChatData],tags=['Legacy aliases'])
    return app

app=create_app()

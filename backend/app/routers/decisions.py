from fastapi import APIRouter, Depends, Request
from ..dependencies import get_decisions, respond
from ..schemas import Envelope, HarvestInput, ProfitRequest, ProfitData, ComparisonData, RiskData, RecommendationData, ScenarioRequest, ScenarioData
from ..services.decisions import DecisionService, profit

router=APIRouter(prefix='/api',tags=['Decisions and returns'])
@router.post('/compare-mandis',response_model=Envelope[ComparisonData])
def compare(body: HarvestInput,request: Request,service: DecisionService=Depends(get_decisions)):
    return respond(request,service.compare(body)[0])
@router.post('/profit',response_model=Envelope[ProfitData])
def calculate_profit(body: ProfitRequest,request: Request):
    return respond(request,profit(body))
@router.post('/risk',response_model=Envelope[RiskData])
def risk(body: HarvestInput,request: Request,service: DecisionService=Depends(get_decisions)):
    comparison,_=service.compare(body)
    return respond(request,service.risk(body,comparison))
@router.post('/recommend',response_model=Envelope[RecommendationData])
def recommend(body: HarvestInput,request: Request,service: DecisionService=Depends(get_decisions)):
    return respond(request,service.recommend(service.compare(body)[0]))
@router.post('/scenario',response_model=Envelope[ScenarioData])
def scenario(body: ScenarioRequest,request: Request,service: DecisionService=Depends(get_decisions)):
    return respond(request,service.scenario(body.baseline,body.changes))

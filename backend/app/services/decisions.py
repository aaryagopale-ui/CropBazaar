from decimal import Decimal, ROUND_HALF_UP
from ..schemas import (HarvestInput, ProfitRequest, ProfitData, SaleOption, ComparisonMandi, ComparisonData, RecommendationData, RiskData, RiskIndicator, AnalysisData, ScenarioData)
from .market import MarketService

def d(value):
    return Decimal(str(value))
def amount(value):
    return float(value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
def profit(req: ProfitRequest) -> ProfitData:
    initial=d(req.quantity); remaining=initial*(1-d(req.spoilage_percent)/100)**req.day
    gross=amount(d(req.price)*remaining)
    transport=amount(d(req.distance)*d(req.transport_rate)*initial)
    loading=amount(d(req.loading_charges)*initial)
    market=amount(d(gross)*d(req.market_charges)/100)
    storage=amount(d(req.storage_rate)*initial*req.day)
    net=amount(d(gross)-d(transport)-d(loading)-d(market)-d(storage))
    return ProfitData(quantity=float(remaining.quantize(Decimal('.000001'))),initial_quantity=req.quantity,lost_quantity=float((initial-remaining).quantize(Decimal('.000001'))),gross=gross,transport=transport,loading=loading,market=market,storage=storage,net=net,day=req.day,price=req.price)

class DecisionService:
    def __init__(self, market: MarketService):
        self.market=market
    def compare(self, req: HarvestInput):
        forecast=self.market.forecast(req.crop,[m.name for m in req.mandis],req.horizon)
        rows=[]
        max_day=0 if req.urgency=='Sell today' else min(3,req.horizon) if req.urgency=='Within 3 days' else req.horizon
        for i,(quote,mandi) in enumerate(zip(forecast.mandis,req.mandis)):
            values=quote.model_dump()
            if quote.unavailable:
                rows.append(ComparisonMandi(**values,distance=mandi.distance,index=i));continue
            costs={k:getattr(req,k) for k in ['quantity','transport_rate','loading_charges','market_charges','storage_rate','spoilage_percent']}
            options=[SaleOption(**profit(ProfitRequest(price=price,distance=mandi.distance,day=day,**costs)).model_dump()) for day,price in [(0,quote.price),*[(p.day,p.price) for p in quote.forecast if p.day<=max_day]]]
            for option in options: option.price_source=self.market.settings.history_source
            best=max(options,key=lambda p:p.net)
            rows.append(ComparisonMandi(**values,distance=mandi.distance,index=i,today=options[0],best=best,options=options,net=options[0].net,transport=options[0].transport))
        return ComparisonData(crop=req.crop,quantity=req.quantity,horizon=req.horizon,mandis=rows,model=forecast.model,provenance=forecast.provenance),forecast
    def recommend(self, comparison: ComparisonData):
        available=[r for r in comparison.mandis if not r.unavailable]
        if not available:
            return RecommendationData(recommendation=None,action=None,reasons=['No quotes available for the selected mandis. No recommendation can be made.'],alternatives=[],provenance=comparison.provenance)
        best=max(available,key=lambda r:r.best.net)
        action='Wait' if best.best.day else 'Sell now' if best.index==0 else 'Switch market'
        return RecommendationData(recommendation=best,action=action,reasons=[f'{best.mandi} has the highest estimated net return of INR {best.best.net:.2f}.',f'The selected day is {best.best.day}; urgency, spoilage, freight, loading, market fees and storage are included.','Compare actual buyer prices, grades and charges before trading.'],alternatives=[{'mandi':r.mandi,'day':r.best.day,'net':r.best.net,'difference':round(best.best.net-r.best.net,2)} for r in available],provenance=comparison.provenance)
    def risk(self, req: HarvestInput, comparison: ComparisonData):
        available=[r for r in comparison.mandis if not r.unavailable]
        freight=max((100*r.today.transport/r.today.gross for r in available if r.today.gross),default=0)
        storage=req.quantity*req.storage_rate*req.horizon
        return RiskData(indicators=[
            RiskIndicator(key='spoilage',level='Elevated' if req.spoilage_percent>=3 else 'Watch' if req.spoilage_percent>0 else 'Low assumption',value=req.spoilage_percent,unit='%/day',reason='Daily spoilage ≥3% is elevated; this is a farmer assumption, not a measurement.'),
            RiskIndicator(key='transport',level='Elevated' if freight>20 else 'Watch',value=round(freight,2),unit='% of gross',reason='Highest quoted freight share; >20% of gross is elevated.'),
            RiskIndicator(key='storage',level='Elevated' if req.storage_rate>20 else 'Watch',value=round(storage,2),unit='INR',reason='Total storage expense across the selected horizon. Rate >INR20/quintal/day is elevated.')],
            retained_quantity=round(req.quantity*(1-req.spoilage_percent/100)**req.horizon,6),warnings=['Risk levels are transparent rules, not trained risk probabilities.','Weather is available separately through /api/weather and does not adjust market forecasts.',comparison.provenance.warning],provenance=comparison.provenance)
    def analyze(self,req: HarvestInput):
        comparison,forecast=self.compare(req); recommendation=self.recommend(comparison)
        return AnalysisData(comparison=comparison,forecast=forecast,risk=self.risk(req,comparison),recommendation=recommendation,profit=recommendation.recommendation.best if recommendation.recommendation else None)
    def scenario(self,baseline: HarvestInput,changes: HarvestInput | None):
        original=self.analyze(baseline); changed=self.analyze(changes) if changes else None
        delta=round(changed.profit.net-original.profit.net,2) if changed and changed.profit and original.profit else None
        return ScenarioData(baseline=original,scenario=changed,net_change=delta)

from dataclasses import replace
from datetime import date
from uuid import uuid4
import httpx
import pytest
from backend.app.config import get_settings
from backend.app.schemas import HarvestInput
from backend.app.dependencies import get_market
from backend.app.services.market import MarketService

@pytest.fixture
def harvest():
    return HarvestInput(quantity=10,transport_rate=2,loading_charges=5,market_charges=1,storage_rate=8,spoilage_percent=1,horizon=3).model_dump(mode='json')

def data(response,status=200):
    assert response.status_code==status,response.text
    payload=response.json()
    assert payload['meta']['price_unit']=='INR/quintal'
    assert payload['meta']['quantity_unit']=='quintal'
    assert payload['meta']['request_id']==response.headers['x-request-id']
    return payload['data']

def test_health_and_catalogs(client):
    assert data(client.get('/api/health'))['database']=='ok'
    assert len(data(client.get('/api/crops')))==3
    assert len(data(client.get('/api/states')))>=28
    assert len(data(client.get('/api/mandis?state=Maharashtra')))==3
    assert data(client.get('/api/mandis?state=Punjab'))==[]

def test_history_filters_pagination_and_empty_state(client):
    history=data(client.get('/api/prices/history?crop=Onion&mandi=Pune&limit=2&offset=1'))
    assert history['total']==120
    assert len(history['records'])==2
    assert history['records'][0]['date']=='2026-06-02'
    assert history['provenance']['is_demo'] is True
    assert history['provenance']['is_live'] is False
    assert data(client.get('/api/prices/history?mandi=Unknown'))['records']==[]
    assert client.get('/api/prices/history?start_date=2026-10-01&end_date=2026-01-01').status_code==422
    assert client.get('/api/prices/history?limit=5001').status_code==422

def test_forecast_dates_bounds_unknown_mandi(client):
    result=data(client.post('/api/forecast',json={'crop':'Onion','horizon':7,'mandis':['Pune','Nashik','Mumbai','Unknown']}))
    assert len(result['mandis'])==4
    for row in result['mandis'][:3]:
        assert len(row['forecast'])==7
        assert date.fromisoformat(row['forecast'][0]['date'])>date.fromisoformat(row['history_as_of'])
        assert row['forecast'][0]['date']=='2026-09-29'
        assert row['mae']>=0
        for point in row['forecast']:
            assert 0<=point['low']<=point['price']<=point['high']
    assert result['mandis'][3]['unavailable'] is True
    assert result['provenance']['is_live'] is False

def test_profit_known_costs_and_compound_spoilage(client):
    result=data(client.post('/api/profit',json={'price':1000,'quantity':10,'distance':25,'transport_rate':2,'loading_charges':5,'market_charges':1,'storage_rate':8,'spoilage_percent':10,'day':2}))
    assert result['quantity']==8.1
    assert result['lost_quantity']==1.9
    assert result['gross']==8100
    assert result['transport']==500
    assert result['loading']==50
    assert result['market']==81
    assert result['storage']==160
    assert result['net']==7309
    assert result['price_source'].startswith('Caller-supplied')
    assert data(client.post('/api/profit',json={'price':0,'quantity':10,'distance':25}))['net']<0

def test_comparison_respects_urgency_and_costs(client,harvest):
    harvest['urgency']='Sell today'
    result=data(client.post('/api/compare-mandis',json=harvest))
    for row in result['mandis']:
        assert len(row['forecast'])==3
        assert len(row['options'])==1
        assert row['best']['day']==0
        today=row['today']
        assert today['transport']==row['distance']*2*10
        assert today['loading']==50
        assert today['net']==pytest.approx(today['gross']-today['transport']-today['loading']-today['market']-today['storage'])

def test_recommendation_risk_scenario_and_no_quotes(client,harvest):
    recommendation=data(client.post('/api/recommend',json=harvest))
    assert recommendation['recommendation']['best']['net']==max(a['net'] for a in recommendation['alternatives'])
    risks=data(client.post('/api/risk',json=harvest))
    assert len(risks['indicators'])==3
    assert risks['retained_quantity']==pytest.approx(10*.99**3,abs=1e-6)
    assert not risks['weather_included']
    changed={**harvest,'loading_charges':15}
    scenario=data(client.post('/api/scenario',json={'baseline':harvest,'changes':changed}))
    assert scenario['net_change']==-100
    assert scenario['baseline']['profit']['net']==scenario['baseline']['recommendation']['recommendation']['best']['net']
    unknown={**harvest,'mandis':[{'name':n,'distance':1} for n in ['A','B','C']]}
    no_quotes=data(client.post('/api/recommend',json=unknown))
    assert no_quotes['recommendation'] is None
    assert no_quotes['action'] is None

@pytest.mark.parametrize('invalid',[{'quantity':0},{'horizon':8},{'spoilage_percent':51},{'market_charges':101},{'quantity':'NaN'},{'crop':'Unknown'},{'mandis':[{'name':'Pune','distance':-1}]},{'mandis':[{'name':'Pune','distance':1}]*3},{'extra_secret':'do-not-echo'}])
def test_invalid_requests_are_consistent_and_do_not_echo_inputs(client,harvest,invalid):
    response=client.post('/api/compare-mandis',json={**harvest,**invalid})
    assert response.status_code==422
    assert response.json()['error']['code']=='VALIDATION_ERROR'
    assert response.json()['error']['details']
    assert 'do-not-echo' not in response.text

def test_farmer_crud_and_missing_profile(client,harvest):
    created=data(client.post('/api/farmers',json=harvest),201)
    fetched=data(client.get(f'/api/farmers/{created["id"]}'))
    assert fetched['quantity']==10
    updated=data(client.put(f'/api/farmers/{created["id"]}',json={**harvest,'quantity':25}))
    assert updated['quantity']==25
    assert updated['created_at']==created['created_at']
    assert data(client.get(f'/api/farmers/{created["id"]}'))['quantity']==25
    missing=client.get(f'/api/farmers/{uuid4()}')
    assert missing.status_code==404
    assert missing.json()['error']['code']=='FARMER_NOT_FOUND'
    assert client.get('/api/farmers/not-a-uuid').status_code==422

def test_no_keys_returns_explicit_offline_or_unavailable(client):
    assert data(client.post('/api/chat',json={'message':'Should I sell?'}))['mode']=='offline'
    assert client.get('/api/market/live').status_code==503
    assert client.get('/api/weather?lat=100').status_code==422
    assert client.get('/does-not-exist').json()['error']['code']=='HTTP_ERROR'

def test_provider_weather_success_and_failure(client,provider_mock):
    provider_mock(lambda request:httpx.Response(200,json={'daily':{'time':['2026-10-08'],'precipitation_probability_max':[70],'temperature_2m_max':[30]}}))
    assert data(client.get('/api/weather'))['max_rain_probability']==70
    provider_mock(lambda request:httpx.Response(200,json={'daily':{}}))
    response=client.get('/api/weather')
    assert response.status_code==502
    assert response.json()['error']['code']=='WEATHER_UNAVAILABLE'

def test_chat_provider_failure_is_not_fabricated(client,settings,provider_mock):
    client.app.dependency_overrides[get_settings]=lambda:replace(settings,groq_api_key='test-secret')
    provider_mock(lambda request:httpx.Response(503,json={}))
    response=client.post('/api/chat',json={'message':'Price today?'})
    assert response.status_code==502
    assert response.json()['error']['code']=='ASSISTANT_UNAVAILABLE'
    assert 'test-secret' not in response.text
    provider_mock(lambda request:httpx.Response(200,json={'choices':[{'message':{'content':'Check actual prices and freight.'}}]}))
    assert data(client.post('/api/chat',json={'message':'Help'}))['mode']=='groq'

def test_live_snapshot_never_claims_verified_freshness(client,settings,provider_mock):
    client.app.dependency_overrides[get_settings]=lambda:replace(settings,data_gov_api_key='test-key',data_gov_resource_id='resource-id')
    provider_mock(lambda request:httpx.Response(200,json={'records':[{'arrival_date':'01/01/2020','modal_price':'1000'}]}))
    snapshot=data(client.get('/api/market/live'))
    assert snapshot['is_demo'] is False and snapshot['is_live'] is False
    assert snapshot['records'][0]['arrival_date']=='01/01/2020'

def test_missing_history_never_invents_live_prices(client,settings,tmp_path):
    client.app.dependency_overrides[get_market]=lambda:MarketService(replace(settings,history_path=tmp_path/'missing.csv'))
    response=client.get('/api/prices/history')
    assert response.status_code==503
    assert response.json()['error']['code']=='HISTORY_UNAVAILABLE'

def test_cors_local_allowlist_and_put(client):
    response=client.options('/api/farmers',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'Content-Type'})
    assert response.status_code==200
    assert response.headers['access-control-allow-origin']=='http://localhost:5173'
    denied=client.options('/api/farmers',headers={'Origin':'https://unrelated.vercel.app','Access-Control-Request-Method':'POST'})
    assert denied.status_code==400
    assert 'access-control-allow-origin' not in denied.headers

def test_wait_sell_switch_and_urgency_branches(client,settings,harvest):
    from backend.app.schemas import ForecastData, ForecastMandi, ForecastPoint, Provenance
    class ScriptedMarket:
        def __init__(self): self.settings=settings
        def forecast(self,crop,names,horizon):
            prices={'Pune':1000,'Nashik':1100,'Mumbai':1200}
            return ForecastData(crop=crop,horizon=horizon,model='Deterministic synthetic test fixture',provenance=Provenance(source='Synthetic test fixture',is_demo=True,warning='Not market data'),mandis=[ForecastMandi(mandi=name,price=prices[name],forecast=[ForecastPoint(day=i,date=date(2026,10,i),price=prices[name]+100*i,low=prices[name],high=prices[name]+200*i) for i in range(1,horizon+1)]) for name in names])
    client.app.dependency_overrides[get_market]=lambda:ScriptedMarket()
    zero_costs={**harvest,'quantity':1,'transport_rate':0,'loading_charges':0,'market_charges':0,'storage_rate':0,'spoilage_percent':0,'horizon':7}
    waiting=data(client.post('/api/recommend',json=zero_costs))
    assert waiting['action']=='Wait' and waiting['recommendation']['best']['day']==7
    urgent=data(client.post('/api/recommend',json={**zero_costs,'urgency':'Within 3 days'}))
    assert urgent['recommendation']['best']['day']==3
    switching=data(client.post('/api/recommend',json={**zero_costs,'urgency':'Sell today'}))
    assert switching['action']=='Switch market'
    reordered={**zero_costs,'urgency':'Sell today','mandis':[{'name':name,'distance':0} for name in ['Mumbai','Pune','Nashik']]}
    assert data(client.post('/api/recommend',json=reordered))['action']=='Sell now'

def test_corrupt_and_short_history_are_not_fabricated(client,settings,tmp_path):
    path=tmp_path/'prices.csv'
    path.write_text('date,crop,mandi,price\n2026-01-01,Onion,Pune,NaN\n')
    client.app.dependency_overrides[get_market]=lambda:MarketService(replace(settings,history_path=path))
    assert client.post('/api/forecast',json={}).status_code==503
    path.write_text('date,crop,mandi,price\n2026-01-01,Onion,Pune,1000\n')
    short=data(client.post('/api/forecast',json={'mandis':['Pune']}))
    assert short['mandis'][0]['unavailable']
    assert short['mandis'][0]['forecast']==[]

def test_imported_history_does_not_claim_live_or_demo(client,settings):
    imported=replace(settings,market_data_mode='historical_csv',history_source='Operator-imported test history')
    client.app.dependency_overrides[get_market]=lambda:MarketService(imported)
    result=data(client.get('/api/prices/history?crop=Onion&limit=1'))
    assert result['provenance']['is_demo'] is False
    assert result['provenance']['is_live'] is False
    assert result['provenance']['stale'] is True

def test_internal_errors_have_safe_envelope_request_id_and_cors(client):
    def broken_dependency(): raise RuntimeError('sensitive-value-must-not-leak')
    client.app.dependency_overrides[get_market]=broken_dependency
    response=client.get('/api/prices/history',headers={'Origin':'http://localhost:5173'})
    assert response.status_code==500
    assert response.json()['error']['code']=='INTERNAL_ERROR'
    assert response.headers['x-request-id']==response.json()['meta']['request_id']
    assert response.headers['access-control-allow-origin']=='http://localhost:5173'
    assert 'sensitive-value-must-not-leak' not in response.text

import httpx
from ..config import Settings
from ..errors import ApiError
from ..schemas import ChatRequest, ChatData, WeatherData, LiveData

class ProviderService:
    def __init__(self,settings: Settings,client: httpx.AsyncClient):
        self.settings,self.client=settings,client
    async def weather(self,lat,lon):
        try:
            response=await self.client.get('https://api.open-meteo.com/v1/forecast',params={'latitude':lat,'longitude':lon,'daily':'precipitation_probability_max,temperature_2m_max','timezone':'Asia/Kolkata','forecast_days':7})
            response.raise_for_status(); daily=response.json()['daily']
            dates=daily['time']; probabilities=daily['precipitation_probability_max']
            if not dates or len(dates)!=len(probabilities) or any(p is not None and (not isinstance(p,(int,float)) or not 0<=p<=100) for p in probabilities):
                raise ValueError('Malformed forecast')
            valid=[p for p in probabilities if p is not None]
            if not valid: raise ValueError('No usable rain probabilities')
            rain=max(valid)
            return WeatherData(daily=daily,max_rain_probability=rain,risk='Rain may disrupt loading and transport.' if rain>=60 else 'No elevated rain risk in this forecast.')
        except (httpx.HTTPError,ValueError,KeyError,TypeError):
            raise ApiError(502,'WEATHER_UNAVAILABLE','Weather unavailable; no weather risk assessment can be made.')
    async def live(self):
        if not self.settings.data_gov_api_key or not self.settings.data_gov_resource_id:
            raise ApiError(503,'LIVE_NOT_CONFIGURED','Live market snapshots are not configured. Set DATA_GOV_API_KEY and DATA_GOV_RESOURCE_ID.')
        # Resource identifiers are paths, never caller-supplied URLs.
        resource=self.settings.data_gov_resource_id
        if not all(c.isalnum() or c=='-' for c in resource):
            raise ApiError(503,'INVALID_PROVIDER_CONFIGURATION','The market resource identifier is invalid.')
        try:
            response=await self.client.get(f'https://api.data.gov.in/resource/{resource}',params={'api-key':self.settings.data_gov_api_key,'format':'json','limit':100})
            response.raise_for_status(); records=response.json()['records']
            if not isinstance(records,list) or any(not isinstance(r,dict) for r in records): raise ValueError('Invalid records')
            return LiveData(records=records)
        except (httpx.HTTPError,ValueError,KeyError,TypeError):
            raise ApiError(502,'MARKET_PROVIDER_UNAVAILABLE','Market provider unavailable. No fallback live records were invented.')
    async def chat(self,req: ChatRequest):
        if not self.settings.groq_api_key:
            return ChatData(mode='offline',answer='Compare net returns after transport, loading, market fees, storage and spoilage. This prototype uses synthetic or explicitly imported historical data; verify actual mandi prices before selling. Configure GROQ_API_KEY for conversational assistance.')
        system=f'You are CropBazaar, a concise Indian farming assistant. Respond in {req.language}. Never invent current prices or claim live market access. Prices in this workspace are synthetic or historical. Explain costs, alternatives and uncertainty; do not guarantee returns.'
        context='\nFarmer-provided context: '+req.context.model_dump_json() if req.context else ''
        try:
            response=await self.client.post('https://api.groq.com/openai/v1/chat/completions',headers={'Authorization':f'Bearer {self.settings.groq_api_key}'},json={'model':self.settings.groq_model,'messages':[{'role':'system','content':system},{'role':'user','content':req.message+context}],'max_tokens':700})
            response.raise_for_status(); answer=response.json()['choices'][0]['message']['content']
            if not isinstance(answer,str) or not answer.strip(): raise ValueError('Empty response')
            return ChatData(mode='groq',answer=answer)
        except (httpx.HTTPError,ValueError,KeyError,TypeError,IndexError):
            raise ApiError(502,'ASSISTANT_UNAVAILABLE','Assistant unavailable. Try again later.')

import axios from 'axios';
export const api = axios.create({baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api', timeout: 20000});
export function errorMessage(error) {
  const apiError=error.response?.data?.error;
  if(apiError) return apiError.message+(apiError.details?.length?' '+apiError.details.map(e=>`${e.field}: ${e.message}`).join('; '):'');
  if(error.code==='ECONNABORTED')return 'The API request timed out. Please try again.';
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e.msg).join('; ');
  return error.message === 'Network Error' ? 'The API is unreachable. Check that the backend is running.' : 'The request could not be completed. Please try again.';
}
let historyCache;
async function demoHistory() {
  if (!historyCache) historyCache = axios.get('/demo_history.csv').then(({data}) => {
    if (typeof data !== 'string' || !data.startsWith('date,crop,mandi,price')) throw new Error('Demo dataset unavailable');
    return data.trim().split(/\r?\n/).slice(1).map(line => {
      const [date,crop,mandi,price] = line.split(','); return {date,crop,mandi,price:Number(price)};
    });
  }).catch(e => {historyCache = null; throw e;});
  return historyCache;
}
async function demoComparison(profile) {
  const records = await demoHistory();
  return {
    source: 'Bundled synthetic demo history', model: 'Browser demo: recent seven-day trend projection. No ML inference or live prices.', mode:'fallback',
    mandis: ['Pune','Nashik','Mumbai'].map(mandi => {
      const prices = records.filter(r => r.crop === profile.crop && r.mandi === mandi).map(r => r.price);
      if (!prices.length) throw new Error('No demo history for this crop.');
      const price = prices.at(-1), trend = (price - prices.at(-8)) / 7;
      return {mandi,price,mae:null,forecast:Array.from({length:profile.horizon},(_,i) => ({day:i+1,price:Math.round(Math.max(1,price+trend*(i+1))),low:Math.max(1,price+trend*(i+1)-80*Math.sqrt(i+1)),high:price+trend*(i+1)+80*Math.sqrt(i+1)}))};
    }),
  };
}
const profileFields = ['name','crop','quantity','state','district','transport_rate','loading_charges','market_charges','spoilage_percent','storage_rate','urgency','language','horizon','mandis'];
export const profilePayload = profile => Object.fromEntries(profileFields.map(key=>[key,profile[key]]));
async function request(path,options={}) {
  const response=await api.request({url:path,...options});
  if (!response.data || !('data' in response.data) || !response.data.meta) throw new Error('Unexpected API response contract.');
  return response.data.data;
}
const post=(path,data,signal)=>request(path,{method:'POST',data,signal});
const canFallback=error=>!axios.isCancel(error)&&(!error.response||error.response.status>=500);
export const marketService = {
  async compare(profile, signal) {
    try {
      const scenario=await post('/scenario',{baseline:profilePayload(profile)},signal);
      const analysis=scenario.baseline;
      return {...analysis.comparison,source:analysis.comparison.provenance.source,mode:'backend',analysis,fallbackReason:null};
    } catch (error) {
      if (signal?.aborted || !canFallback(error)) throw error;
      return {...await demoComparison(profile),fallbackReason:errorMessage(error),provenance:{is_demo:true,is_live:false,source:'Bundled synthetic demo history'}};
    }
  },
  async history(crop) {
    try {
      const data=await request('/prices/history',{params:{crop,limit:5000}});
      return {...data,source:data.provenance.source,demo:data.provenance.is_demo,mode:'backend'};
    } catch(error) {
      if(!canFallback(error))throw error;
      return {records:(await demoHistory()).filter(r=>r.crop===crop),source:'Bundled synthetic history · API unavailable',demo:true,mode:'fallback',fallbackReason:errorMessage(error)};
    }
  },
  async weather(district) {
    const locations={Pune:[18.5204,73.8567],Nashik:[19.9975,73.7898],Mumbai:[19.076,72.8777]};
    const coords=locations[district.trim()];
    if(!coords)throw new Error('Weather coordinates are not configured for this location. No weather assessment is available.');
    return request('/weather',{params:{lat:coords[0],lon:coords[1]}});
  },
  assistant(message, profile) {return post('/chat',{message,language:profile?.language||'English',...(profile?{context:profilePayload(profile)}:{})});},
  live(){return request('/market/live');},
  crops(){return request('/crops');},
  states(){return request('/states');},
  mandis(params){return request('/mandis',{params});},
  forecast(data,signal){return post('/forecast',data,signal);},
  compareMandis(profile,signal){return post('/compare-mandis',profilePayload(profile),signal);},
  profit(data,signal){return post('/profit',data,signal);},
  risk(profile,signal){return post('/risk',profilePayload(profile),signal);},
  recommend(profile,signal){return post('/recommend',profilePayload(profile),signal);},
  scenario(baseline,changes,signal){return post('/scenario',{baseline:profilePayload(baseline),...(changes?{changes:profilePayload(changes)}:{})},signal);},
  farmer(id){return request(`/farmers/${encodeURIComponent(id)}`);},
  saveFarmer(profile,id){return request(id?`/farmers/${encodeURIComponent(id)}`:'/farmers',{method:id?'PUT':'POST',data:profilePayload(profile)});},
};

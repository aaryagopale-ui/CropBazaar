import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {marketService,errorMessage,profilePayload} from '../api';
import {initialProfile,compareReturns,chooseRecommendation} from '../lib/finance';
const FarmContext=createContext(null);
function savedProfile(){try{const parsed=JSON.parse(localStorage.getItem('cropbazaar-profile'));if(parsed&&['Onion','Tomato','Wheat'].includes(parsed.crop)&&Number.isFinite(parsed.quantity)&&parsed.quantity>0&&Array.isArray(parsed.mandis)&&parsed.mandis.length>=3&&parsed.mandis.every(m=>typeof m.name==='string'&&Number.isFinite(m.distance)&&m.distance>=0))return {...initialProfile,...parsed};}catch{}return initialProfile;}
function savedFarmerId(){try{return localStorage.getItem('cropbazaar-farmer-id')||null;}catch{return null;}}
export function FarmProvider({children}){
 const [profile,setProfile]=useState(savedProfile),[farmerId,setFarmerId]=useState(savedFarmerId),[profileLoading,setProfileLoading]=useState(Boolean(farmerId)),[profileError,setProfileError]=useState('');
 const [market,setMarket]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [weather,setWeather]=useState(null),[weatherError,setWeatherError]=useState(''),[weatherLoading,setWeatherLoading]=useState(true),[storageError,setStorageError]=useState('');
 const [catalogs,setCatalogs]=useState({crops:['Onion','Tomato','Wheat'],states:['Maharashtra','Gujarat','Madhya Pradesh','Karnataka','Uttar Pradesh','Punjab','Haryana','Rajasthan','Other'],mandis:['Pune','Nashik','Mumbai']}),[catalogError,setCatalogError]=useState('');
 const profileRef=useRef(profile);profileRef.current=profile;
 useEffect(()=>{let active=true;const original=profileRef.current;if(farmerId)marketService.farmer(farmerId).then(farmer=>{if(active&&profileRef.current===original)setProfile(profilePayload(farmer));}).catch(e=>{if(active)setProfileError(errorMessage(e)+' Using the last profile saved in this browser.');}).finally(()=>{if(active)setProfileLoading(false);});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;Promise.all([marketService.crops(),marketService.states(),marketService.mandis()]).then(([crops,states,mandis])=>{if(active)setCatalogs({crops:crops.map(c=>c.name),states:states.map(s=>s.name),mandis:mandis.map(m=>m.name)});}).catch(()=>{if(active)setCatalogError('API catalogs unavailable; showing the bundled demo crop and location options.');});return()=>{active=false;};},[revision]);
 useEffect(()=>{try{localStorage.setItem('cropbazaar-profile',JSON.stringify(profile));setStorageError('');}catch{setStorageError('Browser storage is unavailable. Your profile will last for this session only.');}},[profile]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setMarket(null);marketService.compare(profile,controller.signal).then(data=>{if(!controller.signal.aborted)setMarket(data);}).catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[profile,revision]);
 useEffect(()=>{let active=true;setWeather(null);setWeatherError('');setWeatherLoading(true);marketService.weather(profile.district).then(d=>{if(active)setWeather(d);}).catch(e=>{if(active)setWeatherError(e.response?errorMessage(e):e.message);}).finally(()=>{if(active)setWeatherLoading(false);});return()=>{active=false;};},[profile.district,revision]);
 const rows=useMemo(()=>market?.mode==='backend'?market.mandis:compareReturns(market,profile),[market,profile]);
 const recommendation=useMemo(()=>market?.analysis?market.analysis.recommendation.recommendation?{...market.analysis.recommendation.recommendation,action:market.analysis.recommendation.action}:null:chooseRecommendation(rows),[market,rows]);
 async function saveProfile(next){const farmer=await marketService.saveFarmer(next,farmerId);setFarmerId(farmer.id);setProfile(profilePayload(farmer));setProfileError('');try{localStorage.setItem('cropbazaar-farmer-id',farmer.id);}catch{setStorageError('Profile saved to the API, but the browser cannot remember its ID.');}return farmer;}
 return <FarmContext.Provider value={{profile,setProfile,market,rows,recommendation,risk:market?.analysis?.risk,loading,error,weather,weatherLoading,weatherError,storageError,catalogs,catalogError,profileLoading,profileError,farmerId,saveProfile,refresh:()=>setRevision(r=>r+1)}}>{children}</FarmContext.Provider>;
}
export const useFarm=()=>useContext(FarmContext);

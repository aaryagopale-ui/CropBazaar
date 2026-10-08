import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate,Link} from 'react-router-dom';
import {FarmProvider} from './context/FarmContext';
import Layout from './components/Layout';
import Assistant from './components/Assistant';
import {EmptyState,Skeleton} from './components/UI';
import './style.css';
const Landing=lazy(()=>import('./pages/Landing'));
const Dashboard=lazy(()=>import('./pages/Dashboard'));
const marketPage=name=>lazy(()=>import('./pages/MarketPages').then(module=>({default:module[name]})));
const farmerPage=name=>lazy(()=>import('./pages/FarmerPages').then(module=>({default:module[name]})));
const History=marketPage('History'),Forecast=marketPage('Forecast'),Mandis=marketPage('Mandis'),Recommendation=marketPage('Recommendation'),Risks=marketPage('Risks');
const Profit=farmerPage('Profit'),Profile=farmerPage('Profile'),Explanation=farmerPage('Explanation');
function App(){return <BrowserRouter><FarmProvider><Suspense fallback={<div className="route-loading"><Skeleton/></div>}><Routes><Route path="/" element={<Landing/>}/><Route element={<Layout/>}><Route path="/dashboard" element={<Dashboard/>}/><Route path="/history" element={<History/>}/><Route path="/forecast" element={<Forecast/>}/><Route path="/mandis" element={<Mandis/>}/><Route path="/recommendation" element={<Recommendation/>}/><Route path="/profit" element={<Profit/>}/><Route path="/risks" element={<Risks/>}/><Route path="/profile" element={<Profile/>}/><Route path="/explanation" element={<Explanation/>}/><Route path="/markets" element={<Navigate to="/mandis" replace/>}/><Route path="/assistant" element={<Navigate to="/explanation" replace/>}/><Route path="*" element={<EmptyState title="This page hasn’t sprouted yet." description="Let’s get you back to your farmer workspace." action={<Link className="btn btn-primary" to="/dashboard">Back to dashboard</Link>}/>}/></Route></Routes></Suspense><Assistant/></FarmProvider></BrowserRouter>;}
createRoot(document.getElementById('root')).render(<App/>);

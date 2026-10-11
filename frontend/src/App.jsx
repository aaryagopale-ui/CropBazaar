import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MandiSense from './pages/MandiSense';
import BhavishyaForecast from './pages/BhavishyaForecast';
import MandiKhoj from './pages/MandiKhoj';
import BechSmart from './pages/BechSmart';
import MunafaMeter from './pages/MunafaMeter';
import JokhimEngine from './pages/JokhimEngine';
import KisanTwin from './pages/KisanTwin';
import KyunNahiAI from './pages/KyunNahiAI';
import KisanVaani from './pages/KisanVaani';

import { AuthProvider } from './context/AuthContext';
import { FarmerProfileProvider } from './context/FarmerProfileContext';
import { MarketProvider } from './context/MarketContext';

export default function App() {
  const [currentLanguage, setCurrentLanguage] = useState('en');

  return (
    <BrowserRouter>
      <AuthProvider>
        <FarmerProfileProvider>
          <MarketProvider>
            <Layout currentLanguage={currentLanguage} onLanguageChange={setCurrentLanguage}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mandisense" element={<MandiSense />} />
          <Route path="/bhavishya" element={<BhavishyaForecast />} />
          <Route path="/mandi-khoj" element={<MandiKhoj />} />
          <Route path="/bechsmart" element={<BechSmart />} />
          <Route path="/munafa-meter" element={<MunafaMeter />} />
          <Route path="/jokhim" element={<JokhimEngine />} />
          <Route path="/kisantwin" element={<KisanTwin />} />
          <Route path="/kyun-nahi" element={<KyunNahiAI />} />
          <Route
            path="/kisan-vaani"
            element={
              <KisanVaani
                currentLanguage={currentLanguage}
                onLanguageChange={setCurrentLanguage}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
          </MarketProvider>
        </FarmerProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

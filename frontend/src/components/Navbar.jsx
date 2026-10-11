import React from 'react';
import { Sprout, Menu, X, Bell, Globe2, ChevronDown, Building2 } from 'lucide-react';
import Badge from './Badge';
import GoogleAuthButton from './GoogleAuthButton';
import { useMarket } from '../context/MarketContext';

export default function Navbar({ onToggleMobileMenu, isMobileMenuOpen, currentLanguage, onLanguageChange }) {
  const { selectedMandi } = useMarket();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Mobile hamburger & Brand */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              aria-label={isMobileMenuOpen ? "Close main navigation" : "Open main navigation"}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-green-800 text-white flex items-center justify-center shadow-xs">
                <Sprout className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight text-slate-900 flex items-center gap-1.5">
                  CropBazaar
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">
                    AI
                  </span>
                </span>
                <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
                  Your Crop, Right Mandi, Right Time
                </p>
              </div>
            </div>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Prototype Badge */}
            <div className="hidden md:flex items-center">
              <Badge variant="emerald" size="sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Hackathon Prototype
              </Badge>
            </div>

            {/* Language Selector */}
            <div className="relative inline-flex items-center text-xs">
              <Globe2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={currentLanguage || 'en'}
                onChange={(e) => onLanguageChange && onLanguageChange(e.target.value)}
                className="pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer"
                aria-label="Select language"
              >
                <option value="en">English (EN)</option>
                <option value="hi">हिंदी (HI)</option>
                <option value="mr">मराठी (MR)</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>

            {/* Notification bell (illustrative) */}
            <button
              type="button"
              title="Mandi price alerts"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl relative transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              aria-label="View notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-600 rounded-full"></span>
            </button>

            {/* Live Mandi Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{selectedMandi}: Active</span>
            </div>

            {/* Google Authentication & Profile Pill */}
            <div className="pl-1 sm:pl-2 border-l border-slate-200">
              <GoogleAuthButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}


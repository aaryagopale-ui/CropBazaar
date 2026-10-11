import React from 'react';
import { Sprout, ShieldCheck, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <Sprout className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-900 tracking-tight text-base">
                CropBazaar
              </span>
              <span className="text-xs text-slate-500 font-medium">— Your Crop, Right Mandi, Right Time</span>
            </div>
            <p className="text-xs text-slate-500 max-w-xl">
              An AI-powered agricultural mandi intelligence platform designed to eliminate information asymmetry and maximize farmers' net income across Indian APMC markets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Farmer-First Design
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-medium">
              Hackathon Prototype 2026
            </span>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} CropBazaar. Built for Indian Agricultural Mandi Intelligence.</p>
          <p className="flex items-center gap-1 text-[11px] text-slate-400">
            Designed with <Heart className="w-3 h-3 text-rose-500 fill-rose-500 inline" /> for Indian Krishi Mandis.
          </p>
        </div>
      </div>
    </footer>
  );
}


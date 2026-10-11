import React from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, Sparkles, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useAuth } from '../context/AuthContext';
import { CROPS } from '../data/mockData';

export default function KisanTwinSummaryBanner({ featureName = '', className = '' }) {
  const { profile, profileComplete } = useFarmerProfile();
  const { user } = useAuth();

  // Resolve human-readable crop name
  const cropObj = CROPS.find(
    (c) =>
      c.id.toLowerCase() === (profile.crop || '').toLowerCase() ||
      c.name.toLowerCase().includes((profile.crop || '').toLowerCase())
  );
  const displayCrop = cropObj ? cropObj.name : profile.crop;

  // Format cash urgency
  const formatUrgency = (urgency) => {
    if (urgency === 'immediate') return 'Need Cash Today';
    if (urgency === 'moderate') return 'Can Wait 3–7 Days';
    if (urgency === 'flexible') return 'Can Hold 15+ Days';
    return urgency || 'Not specified';
  };

  // If farmer has completed their profile
  if (profileComplete) {
    const farmerName = profile.name?.trim() || user?.displayName || 'Farmer';
    const location = profile.village
      ? `${profile.village}, ${profile.district || 'Nashik'}`
      : profile.district || 'Nashik';

    return (
      <div
        className={`bg-gradient-to-r from-emerald-50 via-green-50/80 to-emerald-50/60 border border-emerald-200/90 rounded-2xl p-4 shadow-xs text-slate-800 ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-emerald-200/60 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-xs text-emerald-950 uppercase tracking-wider">
              Your KisanTwin Profile
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              Active & Synced
            </span>
          </div>

          <Link
            to="/kisantwin"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors self-start sm:self-auto"
          >
            <span>Edit Profile</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
              Farmer
            </span>
            <span className="font-bold text-slate-900 truncate block">{farmerName}</span>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
              Location
            </span>
            <span className="font-bold text-slate-900 truncate block">{location}</span>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
              Crop
            </span>
            <span className="font-bold text-emerald-800 truncate block">{displayCrop}</span>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
              Quantity
            </span>
            <span className="font-bold text-slate-900 block">{profile.lotSize} Quintals</span>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
              Cash Urgency
            </span>
            <span className="font-bold text-slate-900 block truncate">
              {formatUrgency(profile.cashUrgency)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // If profile is incomplete or unauthenticated
  return (
    <div
      className={`bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 shadow-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-amber-950">
            Complete your KisanTwin profile to personalize {featureName || 'this feature'}
          </p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            Configure your crop, lot size, and constraints once to unlock tailored recommendations across all tools.
          </p>
        </div>
      </div>

      <Link
        to="/kisantwin"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto shadow-xs"
      >
        <span>Set up KisanTwin</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}


import React, { useState } from 'react';
import {
  UserCheck,
  MapPin,
  Warehouse,
  Truck,
  Clock,
  Sparkles,
  Save,
  CheckCircle,
  Shield,
  Loader2,
  AlertCircle,
  Database,
  RotateCcw,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import Badge from '../components/Badge';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { CROPS } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { useFarmerProfile } from '../context/FarmerProfileContext';

// Explicit demo profile for preview purposes only
const DEMO_PREVIEW_VALUES = {
  name: 'Demo Farmer',
  village: 'Pimpalgaon',
  district: 'Nashik',
  state: 'Maharashtra',
  crop: 'Onion',
  lotSize: 50,
  storageAccess: 'farm_shed',
  transportAccess: 'hired_trolley',
  cashUrgency: 'moderate',
};

export default function KisanTwin() {
  const { user } = useAuth();
  const {
    profile,
    draftProfile,
    setDraftProfile,
    updateProfile,
    resetProfile,
    discardDraft,
    hasUnsavedChanges,
    loading: profileLoading,
    saving,
  } = useFarmerProfile();

  const [savedNotification, setSavedNotification] = useState(false);
  const [resetNotification, setResetNotification] = useState(false);
  const [demoNotice, setDemoNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleInputChange = (field, value) => {
    setErrorMsg('');
    setDemoNotice(false);
    setDraftProfile((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setDemoNotice(false);

    if (!user) {
      setErrorMsg('Please sign in with Google to permanently save your profile to Cloud Firestore.');
      return;
    }

    // Validate required fields
    if (!draftProfile.crop || String(draftProfile.crop).trim() === '') {
      setErrorMsg('Please select your harvest crop.');
      return;
    }
    if (!draftProfile.lotSize || Number(draftProfile.lotSize) <= 0) {
      setErrorMsg('Please enter a valid lot size in quintals.');
      return;
    }
    if (!draftProfile.district || String(draftProfile.district).trim() === '') {
      setErrorMsg('Please enter your district (e.g. Nashik).');
      return;
    }
    if (!draftProfile.storageAccess) {
      setErrorMsg('Please select your storage facility access.');
      return;
    }
    if (!draftProfile.transportAccess) {
      setErrorMsg('Please select your logistics & transport means.');
      return;
    }
    if (!draftProfile.cashUrgency) {
      setErrorMsg('Please select your cash realization urgency.');
      return;
    }

    try {
      await updateProfile(draftProfile);
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 4000);
    } catch (err) {
      console.error('[KisanTwin Save Error]:', err);
      setErrorMsg(err.message || 'Failed to save KisanTwin profile to Firestore.');
    }
  };

  const handleConfirmReset = async () => {
    setErrorMsg('');
    try {
      await resetProfile();
      setShowResetConfirm(false);
      setResetNotification(true);
      setTimeout(() => setResetNotification(false), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to reset profile.');
    }
  };

  const handleLoadDemoPreview = () => {
    setDraftProfile(DEMO_PREVIEW_VALUES);
    setDemoNotice(true);
    setErrorMsg('');
  };

  const handleDiscardChanges = () => {
    discardDraft();
    setDemoNotice(false);
    setErrorMsg('');
  };

  // Determine if the profile has all required fields configured
  const isComplete = Boolean(
    draftProfile.crop &&
    String(draftProfile.crop).trim() !== '' &&
    draftProfile.lotSize &&
    Number(draftProfile.lotSize) > 0 &&
    draftProfile.district &&
    String(draftProfile.district).trim() !== '' &&
    draftProfile.storageAccess &&
    draftProfile.transportAccess &&
    draftProfile.cashUrgency
  );

  // Resolve crop name for active state card
  const currentCropObj = CROPS.find(
    (c) =>
      c.id.toLowerCase() === (draftProfile.crop || '').toLowerCase() ||
      c.name.toLowerCase().includes((draftProfile.crop || '').toLowerCase())
  );
  const displayCropName = currentCropObj ? currentCropObj.name : draftProfile.crop || 'Not selected';

  // If loading auth & profile state from Firestore, show a clean restoring spinner
  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <div className="text-sm font-semibold text-slate-700">
          Loading your private KisanTwin profile from Cloud Firestore...
        </div>
        <div className="text-xs text-slate-400">
          Fetching synchronized crop parameters for your account.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">KisanTwin Profile</h1>
            <Badge variant="emerald" size="xs">
              Farmer Digital Twin
            </Badge>
            {user ? (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  hasUnsavedChanges
                    ? 'text-amber-800 bg-amber-50 border-amber-300'
                    : isComplete
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-slate-600 bg-slate-50 border-slate-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    hasUnsavedChanges
                      ? 'bg-amber-500 animate-pulse'
                      : isComplete
                      ? 'bg-emerald-500'
                      : 'bg-slate-400'
                  }`}
                ></span>
                {hasUnsavedChanges
                  ? 'Unsaved Draft'
                  : isComplete
                  ? 'Firestore Synced'
                  : 'Profile Incomplete'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Guest Mode
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            KisanTwin is the single source of truth for your crop, storage, and logistical constraints across CropBazaar.
          </p>
        </div>

        {/* Action feedback notifications */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          {savedNotification && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-semibold animate-fade-in shadow-xs">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>KisanTwin profile permanently saved & synchronized!</span>
            </div>
          )}

          {resetNotification && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold animate-fade-in shadow-xs">
              <RotateCcw className="w-4 h-4 text-slate-600 shrink-0" />
              <span>Farmer profile reset to blank values.</span>
            </div>
          )}

          {demoNotice && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-medium animate-fade-in">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Demo preview values loaded in draft. Click Save to persist.</span>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Changes Warning Banner */}
      {hasUnsavedChanges && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-bold text-xs text-amber-950">
                You have unsaved changes in your KisanTwin profile
              </h4>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Your draft edits are held while browsing, but other tools (BechSmart, Forecast, etc.) will use your last officially saved profile until you click Save.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-semibold transition-colors"
            >
              Discard Changes
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors shadow-xs flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save to Firestore</span>
            </button>
          </div>
        </div>
      )}

      {/* Auth Banner & Persistence Status */}
      {user ? (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 to-green-50/90 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Farmer'}
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-emerald-500/30 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {(user.displayName || user.email || 'F').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">{user.displayName || 'Google Farmer'}</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold">
                  UID: {user.uid.slice(0, 8)}...
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Authenticated account: <strong>{user.email}</strong>. Saved profile is permanently stored in Cloud Firestore under <code className="text-[11px] font-mono text-emerald-800 bg-emerald-100/60 px-1 py-0.5 rounded">farmers/{user.uid}</code>.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <GoogleAuthButton />
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-bold text-xs text-amber-950">
                Sign in to save your KisanTwin permanently
              </h4>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Sign in with your Google account to save your farm parameters to Cloud Firestore and unlock personalized recommendations across all CropBazaar features.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <GoogleAuthButton />
          </div>
        </div>
      )}

      {/* Error alert if any */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Reset My Farmer Profile</h3>
                <p className="text-xs text-slate-500">Clear saved data for your Google account</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to reset your saved KisanTwin profile? This will clear all crop, lot size, location, and constraint fields from your private Firestore document (<code className="font-mono text-emerald-800">farmers/{user?.uid?.slice(0, 8)}...</code>). It will not affect any other user.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 shadow-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <span>Yes, Reset Profile</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile Configuration Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Configure Farmer Constraints</h2>
              <p className="text-xs text-slate-500">These parameters customize your advisory on every feature page</p>
            </div>

            {/* Separate Demo Mode button */}
            <button
              type="button"
              onClick={handleLoadDemoPreview}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 hover:underline"
              title="Loads sample values into the form for testing without saving"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fill Demo Preview</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Farmer Name <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={draftProfile.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Village & District <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Enter village"
                    value={draftProfile.village}
                    onChange={(e) => handleInputChange('village', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="Enter district"
                    value={draftProfile.district}
                    onChange={(e) => handleInputChange('district', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Current Harvest Crop <span className="text-rose-500">*</span>
                </label>
                <select
                  value={draftProfile.crop}
                  onChange={(e) => handleInputChange('crop', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                >
                  <option value="">-- Select crop --</option>
                  <optgroup label="Evaluated ML Forecasting Crops">
                    <option value="Onion">Onion (प्याज)</option>
                    <option value="Tomato">Tomato (टमाटर)</option>
                    <option value="Brinjal">Brinjal (बैंगन)</option>
                    <option value="Cabbage">Cabbage (पत्तागोभी)</option>
                    <option value="Cauliflower">Cauliflower (फूलगोभी)</option>
                  </optgroup>
                  <optgroup label="Other Crops">
                    <option value="wheat">Wheat (गेहूं)</option>
                    <option value="soybean">Soybean (सोयाबीन)</option>
                    <option value="cotton">Cotton (कपास)</option>
                    <option value="potato">Potato (आलू)</option>
                    <option value="gram">Gram / Chana (चना)</option>
                    <option value="maize">Maize (मक्का)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Lot Size (Quintals) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Enter quantity"
                  value={draftProfile.lotSize}
                  onChange={(e) => handleInputChange('lotSize', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Storage Facility Access <span className="text-rose-500">*</span>
                </label>
                <select
                  value={draftProfile.storageAccess}
                  onChange={(e) => handleInputChange('storageAccess', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                >
                  <option value="">-- Select storage facility --</option>
                  <option value="pucca_warehouse">Pucca Warehouse / Grameen Bhandar (Dry, Safe)</option>
                  <option value="farm_shed">Covered Farm Shed (Can hold 10–15 days)</option>
                  <option value="none">Open Courtyard / No Storage (Must sell fast)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Logistics & Transport Means <span className="text-rose-500">*</span>
                </label>
                <select
                  value={draftProfile.transportAccess}
                  onChange={(e) => handleInputChange('transportAccess', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                >
                  <option value="">-- Select transport means --</option>
                  <option value="own_tractor">Own Tractor-Trolley (Lowest per-km fuel cost)</option>
                  <option value="hired_trolley">Hired Commercial Vehicle / Mini-Truck</option>
                  <option value="middleman_pickup">Depends on Village Aggregator Pickup</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Cash Realization Urgency <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'immediate', label: 'Need Cash Today', desc: 'Prioritize instant liquidity' },
                  { id: 'moderate', label: 'Can Wait 3–7 Days', desc: 'Can hold for slight price gains' },
                  { id: 'flexible', label: 'Can Hold 15+ Days', desc: 'Wait for peak seasonal rally' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleInputChange('cashUrgency', item.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      draftProfile.cashUrgency === item.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-6 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-xs ${
                    saving
                      ? 'bg-slate-300 text-slate-500 cursor-wait'
                      : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  }`}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving to Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Update KisanTwin Profile</span>
                    </>
                  )}
                </button>

                {hasUnsavedChanges && (
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-medium transition-colors"
                  >
                    Discard Changes
                  </button>
                )}

                {user && (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-700 text-xs font-medium transition-colors flex items-center gap-1.5"
                    title="Safely reset your saved profile fields in Firestore to blank"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Profile</span>
                  </button>
                )}
              </div>

              {user && (
                <span className="text-[11px] text-slate-400 font-medium">
                  Firestore doc: farmers/{user.uid.slice(0, 6)}...
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Digital Twin Summary Card */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-3xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-emerald-900/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm tracking-tight">KisanTwin Active State</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  hasUnsavedChanges
                    ? 'bg-amber-400/20 text-amber-300'
                    : user && isComplete
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : 'bg-slate-400/20 text-slate-300'
                }`}
              >
                {hasUnsavedChanges
                  ? 'DRAFT PREVIEW'
                  : user && isComplete
                  ? 'SYNCHRONIZED'
                  : user
                  ? 'PROFILE INCOMPLETE'
                  : 'GUEST PREVIEW'}
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-emerald-300/70 block text-[11px]">Farmer</span>
                <span className="font-bold text-base text-white">
                  {draftProfile.name.trim() || (user ? 'Not provided' : 'Guest')}
                </span>
                <span className="text-slate-400 block text-[11px]">
                  {draftProfile.village || draftProfile.district
                    ? `${draftProfile.village ? draftProfile.village + ', ' : ''}${draftProfile.district || ''}${
                        draftProfile.state ? ', ' + draftProfile.state : ''
                      }`
                    : 'Location not provided'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <span className="text-emerald-300/70 text-[11px]">Commodity</span>
                  <div className={`font-bold ${draftProfile.crop ? 'text-slate-100' : 'text-slate-400 italic'}`}>
                    {displayCropName}
                  </div>
                </div>
                <div>
                  <span className="text-emerald-300/70 text-[11px]">Lot Size</span>
                  <div className={`font-bold ${draftProfile.lotSize ? 'text-slate-100' : 'text-slate-400 italic'}`}>
                    {draftProfile.lotSize ? `${draftProfile.lotSize} Quintals` : 'Not entered'}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-emerald-300/70 text-[11px]">Logistics Capability</span>
                <div className={`mt-0.5 ${draftProfile.transportAccess ? 'text-slate-200' : 'text-slate-400 italic'}`}>
                  {draftProfile.transportAccess === 'own_tractor'
                    ? 'Own Tractor: Capable of multi-taluka haulage at low cost.'
                    : draftProfile.transportAccess === 'hired_trolley'
                    ? 'Commercial Freight: Dependent on per-kilometer hiring rates.'
                    : draftProfile.transportAccess === 'middleman_pickup'
                    ? 'Middleman Dependent: High vulnerability to farmgate discount.'
                    : 'Not configured'}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-emerald-300/70 text-[11px]">AI Advisory Constraint</span>
                <div className={`mt-0.5 font-medium ${draftProfile.cashUrgency ? 'text-emerald-200' : 'text-slate-400 italic'}`}>
                  {draftProfile.cashUrgency === 'immediate'
                    ? '⚡ Immediate liquidation required: Engine recommends closest high-liquidity mandi.'
                    : draftProfile.cashUrgency === 'moderate'
                    ? '🌾 3–7 day patience window: Recommended to wait for mid-week supply dip.'
                    : draftProfile.cashUrgency === 'flexible'
                    ? '⏳ Long holding capacity: Wait for seasonal price consolidation.'
                    : 'Not configured'}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-emerald-300/70 text-[11px]">Storage Capacity</span>
                <div className={`mt-0.5 ${draftProfile.storageAccess ? 'text-slate-200' : 'text-slate-400 italic'}`}>
                  {draftProfile.storageAccess === 'pucca_warehouse'
                    ? 'Pucca Warehouse: Optimal protection from moisture and rainfall deterioration.'
                    : draftProfile.storageAccess === 'farm_shed'
                    ? 'Covered Shed: Adequate for short holding windows up to 14 days.'
                    : draftProfile.storageAccess === 'none'
                    ? 'No Dedicated Storage: Vulnerable to spoilage; quick dispatch recommended.'
                    : 'Not configured'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-emerald-900/60 text-[11px] text-emerald-300/70">
            {isComplete ? (
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>KisanTwin profile active: Driving personalized BechSmart, Forecast, and Kyun Nahi AI decisions.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-300/90">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Complete your KisanTwin Profile to receive personalized recommendations across all tools.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

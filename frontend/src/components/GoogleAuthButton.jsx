import React, { useState, useRef, useEffect } from 'react';
import { LogOut, User, Loader2, AlertCircle, ChevronDown, CheckCircle2, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { Link } from 'react-router-dom';

export default function GoogleAuthButton({ variant = 'navbar', className = '' }) {
  const { user, loading, signIn, logout, authError, clearAuthError, isFirebaseConfigured } = useAuth();
  const { profile } = useFarmerProfile();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (err) {
      // Handled in context
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    setDropdownOpen(false);
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Google 'G' official SVG
  const GoogleIcon = () => (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-medium animate-pulse ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
        <span className="hidden sm:inline">Restoring session...</span>
      </div>
    );
  }

  // Not logged in state
  if (!user) {
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={handleSignIn}
          disabled={isSigningIn}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all shadow-xs ${
            isSigningIn
              ? 'bg-slate-100 text-slate-400 cursor-wait'
              : 'bg-white hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-900 border border-slate-200 hover:border-emerald-500 hover:shadow-sm'
          } ${className}`}
          title={isFirebaseConfigured ? "Sign in with your Google account" : "Firebase configuration required in .env.local"}
        >
          {isSigningIn ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <GoogleIcon />
              <span className="whitespace-nowrap">Continue with Google</span>
            </>
          )}
        </button>

        {authError && (
          <div className="absolute top-full mt-2 right-0 w-72 bg-white rounded-xl shadow-lg border border-rose-200 p-3 text-xs text-rose-700 z-50 animate-fade-in">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Sign-In Notice</p>
                <p className="mt-0.5 text-rose-700">{authError}</p>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="mt-2 text-[11px] font-bold text-rose-800 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Authenticated farmer state
  const displayName = profile?.name || user.displayName || 'Farmer';
  const email = profile?.email || user.email || '';
  const photoURL = profile?.photoURL || user.photoURL;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all text-left focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
        aria-expanded={dropdownOpen}
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt={displayName}
            className="w-7 h-7 rounded-lg object-cover ring-1 ring-emerald-500/30"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="hidden sm:block text-left max-w-[120px]">
          <div className="text-xs font-bold text-slate-800 truncate leading-tight">
            {displayName}
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold truncate flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>KisanTwin</span>
          </div>
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
      </button>

      {/* User Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-fade-in text-xs">
          {/* User Details Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-emerald-500/30 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 truncate text-sm">{displayName}</p>
              <p className="text-slate-500 truncate text-[11px]">{email}</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 mt-0.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Firebase Synced
              </span>
            </div>
          </div>

          {/* Quick Farmer Info */}
          {profile && (
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Crop:</span>
                <span className={`font-semibold ${profile.crop ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                  {profile.crop || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Lot Size:</span>
                <span className={`font-semibold ${profile.lotSize ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                  {profile.lotSize ? `${profile.lotSize} Quintals` : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Location:</span>
                <span className={`font-semibold ${profile.district || profile.village ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                  {profile.district || profile.village
                    ? `${profile.village ? profile.village + ', ' : ''}${profile.district || ''}`
                    : 'Not set'}
                </span>
              </div>
            </div>
          )}

          {/* Links */}
          <div className="py-1">
            <Link
              to="/kisantwin"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 font-medium transition-colors"
            >
              <User className="w-4 h-4 text-emerald-600" />
              <span>Manage KisanTwin Profile</span>
            </Link>
          </div>

          {/* Logout Button */}
          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 font-semibold transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout ({displayName.split(' ')[0]})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


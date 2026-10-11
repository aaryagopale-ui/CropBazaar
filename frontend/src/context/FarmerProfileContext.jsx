import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  getOrCreateFarmerProfile,
  saveFarmerProfile,
  resetFarmerProfile,
} from '../services/firebase';

const BLANK_PROFILE = {
  name: '',
  village: '',
  district: '',
  state: '',
  crop: '',
  lotSize: '',
  storageAccess: '',
  transportAccess: '',
  cashUrgency: '',
};

const FarmerProfileContext = createContext({
  profile: BLANK_PROFILE,
  draftProfile: BLANK_PROFILE,
  setDraftProfile: () => {},
  updateProfile: async () => {},
  resetProfile: async () => {},
  discardDraft: () => {},
  loading: true,
  saving: false,
  error: null,
  clearError: () => {},
  profileComplete: false,
  hasUnsavedChanges: false,
});

export function FarmerProfileProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState(BLANK_PROFILE);
  const [draftProfile, setDraftProfile] = useState(BLANK_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Active user reference to prevent asynchronous race conditions
  const activeUidRef = useRef(null);

  // Synchronize Firestore profile with authenticated user
  useEffect(() => {
    let isCancelled = false;

    async function syncProfile() {
      if (authLoading) return;

      if (!user) {
        // Clear all private farmer state on logout immediately
        activeUidRef.current = null;
        setProfile(BLANK_PROFILE);
        setDraftProfile(BLANK_PROFILE);
        setLoading(false);
        setError(null);
        return;
      }

      // If user switched, reset local profile immediately
      if (activeUidRef.current !== user.uid) {
        setProfile(BLANK_PROFILE);
        setDraftProfile(BLANK_PROFILE);
      }
      activeUidRef.current = user.uid;
      setLoading(true);
      setError(null);

      try {
        const fetched = await getOrCreateFarmerProfile(user);
        if (!isCancelled && activeUidRef.current === user.uid) {
          const loadedProfile = {
            uid: user.uid,
            name: fetched.name || '',
            village: fetched.village || '',
            district: fetched.district || '',
            state: fetched.state || '',
            crop: fetched.crop || '',
            lotSize: fetched.lotSize !== undefined && fetched.lotSize !== null ? fetched.lotSize : '',
            storageAccess: fetched.storageAccess || '',
            transportAccess: fetched.transportAccess || '',
            cashUrgency: fetched.cashUrgency || '',
            updatedAt: fetched.updatedAt || null,
          };
          setProfile(loadedProfile);
          // Set initial draft to match saved profile
          setDraftProfile(loadedProfile);
        }
      } catch (err) {
        console.error('[FarmerProfileContext] Fetch error:', err);
        if (!isCancelled && activeUidRef.current === user.uid) {
          setError('Failed to load profile from Firestore: ' + (err.message || String(err)));
        }
      } finally {
        if (!isCancelled && activeUidRef.current === user.uid) {
          setLoading(false);
        }
      }
    }

    syncProfile();

    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  // Compute if the profile has unsaved changes in the draft
  const hasUnsavedChanges = useMemo(() => {
    if (!user) return false;
    const keys = [
      'name',
      'village',
      'district',
      'state',
      'crop',
      'lotSize',
      'storageAccess',
      'transportAccess',
      'cashUrgency',
    ];
    return keys.some((k) => {
      const pVal = profile[k] !== undefined && profile[k] !== null ? String(profile[k]).trim() : '';
      const dVal = draftProfile[k] !== undefined && draftProfile[k] !== null ? String(draftProfile[k]).trim() : '';
      return pVal !== dVal;
    });
  }, [profile, draftProfile, user]);

  // Warn on browser reload if unsaved draft changes exist
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in your KisanTwin profile.';
        return e.returnValue;
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Save profile to Firestore and commit to single source of truth
  const updateProfile = useCallback(
    async (updatedFields) => {
      if (!user) {
        throw new Error('Please sign in with Google to save your profile.');
      }
      setSaving(true);
      setError(null);

      try {
        const cleanPayload = {
          ...updatedFields,
          lotSize:
            updatedFields.lotSize !== '' && updatedFields.lotSize !== undefined && updatedFields.lotSize !== null
              ? Number(updatedFields.lotSize)
              : '',
        };

        await saveFarmerProfile(user.uid, cleanPayload);

        const newProfileState = {
          ...profile,
          ...cleanPayload,
          uid: user.uid,
          updatedAt: new Date().toISOString(),
        };

        // Update single source of truth
        setProfile(newProfileState);
        setDraftProfile(newProfileState);
        return newProfileState;
      } catch (err) {
        console.error('[FarmerProfileContext] Save error:', err);
        const msg = err.message || 'Failed to save KisanTwin profile.';
        setError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [user, profile]
  );

  // Reset profile in Firestore to blank
  const resetProfile = useCallback(async () => {
    if (!user) {
      throw new Error('Please sign in with Google to reset your profile.');
    }
    setSaving(true);
    setError(null);

    try {
      await resetFarmerProfile(user.uid);
      const blankState = {
        ...BLANK_PROFILE,
        uid: user.uid,
        updatedAt: new Date().toISOString(),
      };
      setProfile(blankState);
      setDraftProfile(blankState);
      return blankState;
    } catch (err) {
      console.error('[FarmerProfileContext] Reset error:', err);
      const msg = err.message || 'Failed to reset KisanTwin profile.';
      setError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [user]);

  // Discard uncommitted draft changes and restore last saved profile
  const discardDraft = useCallback(() => {
    setDraftProfile(profile);
  }, [profile]);

  // Check if profile is complete with all required agricultural parameters
  const profileComplete = useMemo(() => {
    return Boolean(
      profile.crop &&
      String(profile.crop).trim() !== '' &&
      profile.lotSize &&
      Number(profile.lotSize) > 0 &&
      profile.district &&
      String(profile.district).trim() !== '' &&
      profile.storageAccess &&
      profile.transportAccess &&
      profile.cashUrgency
    );
  }, [profile]);

  const value = {
    profile,
    draftProfile,
    setDraftProfile,
    updateProfile,
    resetProfile,
    discardDraft,
    loading: loading || authLoading,
    saving,
    error,
    clearError: () => setError(null),
    profileComplete,
    hasUnsavedChanges,
  };

  return <FarmerProfileContext.Provider value={value}>{children}</FarmerProfileContext.Provider>;
}

export function useFarmerProfile() {
  const context = useContext(FarmerProfileContext);
  if (!context) {
    throw new Error('useFarmerProfile must be used within a FarmerProfileProvider');
  }
  return context;
}


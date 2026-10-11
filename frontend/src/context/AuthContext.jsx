import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  isFirebaseConfigured,
  signInWithGoogle,
  logoutFarmer,
  getOrCreateFarmerProfile,
  saveFarmerProfile,
  resetFarmerProfile,
} from '../services/firebase';

const AuthContext = createContext({
  user: null,
  farmerProfile: null,
  loading: true,
  isFirebaseConfigured: false,
  authError: null,
  signIn: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
  resetProfile: async () => {},
  reloadProfile: async () => {},
  clearAuthError: () => {},
  isProfileComplete: () => false,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [farmerProfile, setFarmerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Track active user UID to prevent stale async responses from corrupting state
  const activeUidRef = useRef(null);

  // Synchronize Firebase auth state
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthError(null);

      if (currentUser) {
        // Switching account or signing in: clear previous profile immediately
        if (activeUidRef.current !== currentUser.uid) {
          setFarmerProfile(null);
        }
        activeUidRef.current = currentUser.uid;
        setUser(currentUser);
        setLoading(true);

        try {
          const profile = await getOrCreateFarmerProfile(currentUser);
          // Only commit if the user hasn't switched during the async fetch
          if (activeUidRef.current === currentUser.uid) {
            setFarmerProfile(profile);
          }
        } catch (err) {
          console.error('[AuthContext] Failed to load farmer profile:', err);
          if (activeUidRef.current === currentUser.uid) {
            setAuthError('Failed to load farmer profile from Firestore: ' + (err.message || String(err)));
          }
        } finally {
          if (activeUidRef.current === currentUser.uid) {
            setLoading(false);
          }
        }
      } else {
        // Immediately clear all private farmer state on logout
        activeUidRef.current = null;
        setUser(null);
        setFarmerProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    setLoading(true);
    try {
      const loggedInUser = await signInWithGoogle();
      activeUidRef.current = loggedInUser.uid;
      setUser(loggedInUser);
      const profile = await getOrCreateFarmerProfile(loggedInUser);
      if (activeUidRef.current === loggedInUser.uid) {
        setFarmerProfile(profile);
      }
      return profile;
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        const message = err.message || 'Google Sign-In failed. Please try again.';
        setAuthError(message);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await logoutFarmer();
      activeUidRef.current = null;
      setUser(null);
      setFarmerProfile(null);
    } catch (err) {
      setAuthError('Logout failed: ' + (err.message || String(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUpdateProfile = useCallback(async (updatedFields) => {
    if (!user) {
      throw new Error('Please sign in with Google to save your profile.');
    }
    setAuthError(null);
    try {
      await saveFarmerProfile(user.uid, updatedFields);
      setFarmerProfile((prev) => ({
        ...prev,
        ...updatedFields,
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setAuthError('Failed to update profile: ' + (err.message || String(err)));
      throw err;
    }
  }, [user]);

  const handleResetProfile = useCallback(async () => {
    if (!user) {
      throw new Error('Please sign in with Google to reset your profile.');
    }
    setAuthError(null);
    try {
      const resetData = await resetFarmerProfile(user.uid);
      setFarmerProfile((prev) => ({
        ...prev,
        ...resetData,
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setAuthError('Failed to reset profile: ' + (err.message || String(err)));
      throw err;
    }
  }, [user]);

  const handleReloadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await getOrCreateFarmerProfile(user);
      if (activeUidRef.current === user.uid) {
        setFarmerProfile(profile);
      }
    } catch (err) {
      console.error('[AuthContext] Failed to reload profile:', err);
    }
  }, [user]);

  const isProfileComplete = useCallback(() => {
    if (!farmerProfile) return false;
    return Boolean(
      farmerProfile.crop &&
      farmerProfile.crop.trim() !== '' &&
      farmerProfile.lotSize &&
      Number(farmerProfile.lotSize) > 0 &&
      farmerProfile.district &&
      farmerProfile.district.trim() !== '' &&
      farmerProfile.storageAccess &&
      farmerProfile.transportAccess &&
      farmerProfile.cashUrgency
    );
  }, [farmerProfile]);

  const value = {
    user,
    farmerProfile,
    loading,
    isFirebaseConfigured,
    authError,
    signIn: handleSignIn,
    logout: handleLogout,
    updateProfile: handleUpdateProfile,
    resetProfile: handleResetProfile,
    reloadProfile: handleReloadProfile,
    clearAuthError: () => setAuthError(null),
    isProfileComplete,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

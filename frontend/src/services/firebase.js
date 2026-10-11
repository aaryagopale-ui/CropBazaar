import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

// Read Firebase configuration from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Check if valid Firebase configuration is present
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'YOUR_FIREBASE_PROJECT_ID'
);

let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: 'select_account',
    });
  } catch (err) {
    console.error('[Firebase Init Error]:', err);
  }
} else {
  console.warn(
    '[CropBazaar Firebase] Configuration missing. Please set VITE_FIREBASE_* environment variables in frontend/.env.local.'
  );
}

export { app, auth, db, googleProvider, serverTimestamp };

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle() {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error(
      'Firebase is not configured yet. Please configure your Firebase credentials in frontend/.env.local.'
    );
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('[Google Sign-In Error]:', error);
    throw error;
  }
}

/**
 * Log out the authenticated farmer
 */
export async function logoutFarmer() {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('[Logout Error]:', error);
    throw error;
  }
}

/**
 * Fetch or initialize farmer's private profile from Firestore
 * Collection: farmers
 * Document ID: user.uid
 *
 * Rules:
 * - New user: initialize with completely blank farmer-specific fields (no sample data, no auto-filling editable name)
 * - Returning user: return only previously saved values, never overwriting with defaults
 */
export async function getOrCreateFarmerProfile(user) {
  if (!user || !db) return null;

  const farmerRef = doc(db, 'farmers', user.uid);
  const snap = await getDoc(farmerRef);

  if (snap.exists()) {
    // Existing farmer: retrieve saved profile, never overwrite with sample data
    const existing = snap.data();
    return {
      uid: user.uid,
      name: existing.name || '',
      email: existing.email || user.email || '',
      photoURL: existing.photoURL || user.photoURL || '',
      village: existing.village || '',
      district: existing.district || '',
      state: existing.state || '',
      crop: existing.crop || '',
      lotSize: existing.lotSize !== undefined && existing.lotSize !== null ? existing.lotSize : '',
      storageAccess: existing.storageAccess || '',
      transportAccess: existing.transportAccess || '',
      cashUrgency: existing.cashUrgency || '',
      createdAt: existing.createdAt || null,
      updatedAt: existing.updatedAt || null,
    };
  }

  // First time sign-in: create new document with blank farmer fields
  const blankProfile = {
    uid: user.uid,
    name: '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    village: '',
    district: '',
    state: '',
    crop: '',
    lotSize: '',
    storageAccess: '',
    transportAccess: '',
    cashUrgency: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(farmerRef, blankProfile);

  return {
    ...blankProfile,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Save updated farmer profile to Firestore
 */
export async function saveFarmerProfile(uid, profileData) {
  if (!uid || !db) {
    throw new Error('Cannot save profile: user is not authenticated or Firestore is unavailable.');
  }

  const farmerRef = doc(db, 'farmers', uid);

  // Exclude uid and createdAt from mutations to adhere to security rules
  const { uid: _id, createdAt: _created, ...cleanUpdates } = profileData;

  const payload = {
    ...cleanUpdates,
    uid, // Enforce matching ownership UID for security rule compliance
    updatedAt: serverTimestamp(),
  };

  await updateDoc(farmerRef, payload);
  return payload;
}

/**
 * Reset farmer-specific fields in Firestore to blank values
 * Clears only the current user's document in the 'farmers' collection
 */
export async function resetFarmerProfile(uid) {
  if (!uid || !db) {
    throw new Error('User is not authenticated or Firestore is unavailable.');
  }

  const farmerRef = doc(db, 'farmers', uid);
  const resetData = {
    uid,
    name: '',
    village: '',
    district: '',
    state: '',
    crop: '',
    lotSize: '',
    storageAccess: '',
    transportAccess: '',
    cashUrgency: '',
    updatedAt: serverTimestamp(),
  };

  await updateDoc(farmerRef, resetData);
  return resetData;
}

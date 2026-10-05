import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DriveConnectionStatus } from '../types';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Drive file scope (least-privilege, standard for app-managed vault)
provider.addScope('https://www.googleapis.com/auth/drive.file');

const SESSION_TOKEN_KEY = 'gdrive_oauth_token';
const SESSION_EXPIRES_KEY = 'gdrive_token_expires';

// Helper to safely read token from sessionStorage
const getStoredSessionToken = (): string | null => {
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const expiresStr = sessionStorage.getItem(SESSION_EXPIRES_KEY);
    if (token && expiresStr) {
      const expiresAt = parseInt(expiresStr, 10);
      // Valid if more than 60 seconds remain before expiration
      if (Date.now() < expiresAt - 60000) {
        return token;
      }
    }
  } catch {}
  return null;
};

const storeSessionToken = (token: string, expiresInSecs = 3550) => {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_EXPIRES_KEY, String(Date.now() + expiresInSecs * 1000));
  } catch {}
};

const clearSessionToken = () => {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  } catch {}
};

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// In-memory token initialized from active session storage if available
let cachedAccessToken: string | null = getStoredSessionToken();
let currentConnectionStatus: DriveConnectionStatus = cachedAccessToken ? 'connected' : 'disconnected';

type StatusListener = (status: DriveConnectionStatus, details?: { email?: string; error?: string }) => void;
const statusListeners = new Set<StatusListener>();

export const notifyDriveStatus = (status: DriveConnectionStatus, details?: { email?: string; error?: string }) => {
  currentConnectionStatus = status;
  statusListeners.forEach((fn) => {
    try {
      fn(status, details);
    } catch (err) {
      console.error('Error in drive status listener:', err);
    }
  });
};

export const subscribeDriveStatus = (listener: StatusListener) => {
  statusListeners.add(listener);
  // Immediately notify of current status
  listener(currentConnectionStatus);
  return () => {
    statusListeners.delete(listener);
  };
};

export const getDriveStatus = (): DriveConnectionStatus => currentConnectionStatus;

/**
 * Called when an API request fails with 401 Unauthorized or invalid credentials
 */
export const markTokenExpired = (reason = 'Google Drive access token expired') => {
  cachedAccessToken = null;
  clearSessionToken();
  notifyDriveStatus('expired', { error: reason });
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // Check memory or sessionStorage for token
      if (!cachedAccessToken) {
        cachedAccessToken = getStoredSessionToken();
      }

      if (cachedAccessToken) {
        notifyDriveStatus('connected', { email: user.email || undefined });
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // User is authenticated with Firebase but has no active Google OAuth Drive token
        notifyDriveStatus('expired', { error: 'Drive connection needs re-authentication' });
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      clearSessionToken();
      notifyDriveStatus('disconnected');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    notifyDriveStatus('checking');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google OAuth access token');
    }

    cachedAccessToken = credential.accessToken;
    storeSessionToken(cachedAccessToken);
    notifyDriveStatus('connected', { email: result.user.email || undefined });
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    notifyDriveStatus('disconnected', { error: error?.message || 'Sign-in failed' });
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    cachedAccessToken = getStoredSessionToken();
  }
  return cachedAccessToken;
};

/**
 * Explicitly tests if Google Drive API is reachable with the current token.
 * Pings Google Drive's about endpoint.
 */
export const testDriveConnection = async (): Promise<{ ok: boolean; email?: string; error?: string }> => {
  const token = await getAccessToken();
  if (!token) {
    notifyDriveStatus('disconnected', { error: 'No active Google Drive token' });
    return { ok: false, error: 'Not connected to Google Drive' };
  }

  notifyDriveStatus('checking');
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      markTokenExpired('Google Drive access token expired (401)');
      return { ok: false, error: 'Google Drive session expired (401). Please reconnect.' };
    }

    if (!res.ok) {
      const errText = await res.text();
      const msg = `Google Drive error (${res.status}): ${errText}`;
      notifyDriveStatus('disconnected', { error: msg });
      return { ok: false, error: msg };
    }

    const data = await res.json();
    const email = data.user?.emailAddress;
    notifyDriveStatus('connected', { email });
    return { ok: true, email };
  } catch (err: any) {
    const errorMsg = err?.message || 'Network error reaching Google Drive';
    notifyDriveStatus('disconnected', { error: errorMsg });
    return { ok: false, error: errorMsg };
  }
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  clearSessionToken();
  notifyDriveStatus('disconnected');
};

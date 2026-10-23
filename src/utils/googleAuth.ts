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
import { isDriveSyncDisabled } from './storageKeys';
import { getErrorMessage } from './errors';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Drive and Google Docs scopes (least-privilege for vault sync, Google Picker, and Docs import)
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
provider.addScope('https://www.googleapis.com/auth/documents.readonly');

// The OAuth access token lives in memory, mirrored to sessionStorage (per tab, cleared when the
// tab closes) so a reload doesn't force a new popup. It is never written to localStorage.
const SESSION_TOKEN_KEY = 'gdrive_oauth_token';
const SESSION_EXPIRES_KEY = 'gdrive_token_expires';
// Google OAuth access tokens live 3600s; used only if the sign-in response omits expires_in.
const DEFAULT_EXPIRES_IN_SECS = 3600;
// Treat the token as expired slightly early so in-flight requests don't hit a 401.
const EXPIRY_SKEW_MS = 60 * 1000;

// Remove tokens persisted to localStorage by older versions of the app.
try {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRES_KEY);
} catch {
  // ignore
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;

const isTokenUsable = (): boolean =>
  !!cachedAccessToken && Date.now() < tokenExpiresAt - EXPIRY_SKEW_MS;

const clearToken = () => {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  } catch {
    // ignore
  }
};

/**
 * Firebase's popup flow cannot silently refresh a Google OAuth access token (that needs a user
 * gesture), so on expiry we cleanly switch to the 'expired' status and the UI offers Reconnect.
 */
const scheduleExpiry = () => {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  const ms = tokenExpiresAt - EXPIRY_SKEW_MS - Date.now();
  if (ms <= 0) return;
  expiryTimer = setTimeout(() => {
    if (cachedAccessToken) {
      markTokenExpired(
        'Google Drive session expired. Reconnect to keep syncing — your edits are saved in this browser.',
      );
    }
  }, ms);
};

const setToken = (token: string, expiresInSecs: number) => {
  cachedAccessToken = token;
  tokenExpiresAt = Date.now() + expiresInSecs * 1000;
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_EXPIRES_KEY, String(tokenExpiresAt));
  } catch {
    // ignore
  }
  scheduleExpiry();
};

const loadSessionToken = () => {
  if (cachedAccessToken || isDriveSyncDisabled()) return;
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const expiresAt = parseInt(sessionStorage.getItem(SESSION_EXPIRES_KEY) || '', 10);
    if (token && Number.isFinite(expiresAt)) {
      cachedAccessToken = token;
      tokenExpiresAt = expiresAt;
      if (isTokenUsable()) {
        scheduleExpiry();
      } else {
        clearToken();
      }
    }
  } catch {
    // ignore
  }
};

loadSessionToken();
let currentConnectionStatus: DriveConnectionStatus = isTokenUsable() ? 'connected' : 'disconnected';

type StatusListener = (
  status: DriveConnectionStatus,
  details?: { email?: string; error?: string },
) => void;
const statusListeners = new Set<StatusListener>();

const notifyDriveStatus = (
  status: DriveConnectionStatus,
  details?: { email?: string; error?: string },
) => {
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

/**
 * Called when an API request fails with 401 Unauthorized or the token reaches its expiry
 */
export const markTokenExpired = (reason = 'Google Drive access token expired') => {
  clearToken();
  notifyDriveStatus('expired', { error: reason });
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      loadSessionToken();

      if (isTokenUsable() && cachedAccessToken) {
        notifyDriveStatus('connected', { email: user.email || undefined });
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        clearToken();
        // User is authenticated with Firebase but Drive token has expired or needs refreshing
        notifyDriveStatus('expired', {
          email: user.email || undefined,
          error: 'Drive connection needs re-authentication',
        });
        // Preserve user object so app knows user identity and can prompt for 1-click reconnection
        if (onAuthSuccess) onAuthSuccess(user, '');
      }
    } else {
      clearToken();
      notifyDriveStatus('disconnected');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isDriveSyncDisabled()) {
    throw new Error('Google sign-in is disabled in offline mock mode.');
  }
  try {
    isSigningIn = true;
    notifyDriveStatus('checking');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google OAuth access token');
    }

    // Firebase exposes the OAuth response's expires_in as `oauthExpireIn` on the raw token response.
    // It isn't part of UserCredential's public type, hence the narrow cast.
    const tokenResponse = (result as { _tokenResponse?: { oauthExpireIn?: unknown } })
      ._tokenResponse;
    const rawExpiresIn = Number(tokenResponse?.oauthExpireIn);
    const expiresIn =
      Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? rawExpiresIn : DEFAULT_EXPIRES_IN_SECS;

    setToken(credential.accessToken, expiresIn);
    notifyDriveStatus('connected', { email: result.user.email || undefined });
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('Google Sign-in error:', error);
    notifyDriveStatus('disconnected', { error: getErrorMessage(error) || 'Sign-in failed' });
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/** Returns a usable access token, or null (marking the session expired if it just lapsed). */
export const getAccessToken = async (): Promise<string | null> => {
  if (isDriveSyncDisabled()) return null;
  loadSessionToken();
  if (isTokenUsable()) return cachedAccessToken;
  if (cachedAccessToken) {
    markTokenExpired('Google Drive session expired. Please reconnect.');
  }
  return null;
};

/**
 * Explicitly tests if Google Drive API is reachable with the current token.
 * Pings Google Drive's about endpoint.
 */
export const testDriveConnection = async (): Promise<{
  ok: boolean;
  expired?: boolean;
  email?: string;
  error?: string;
}> => {
  const hadToken = !!cachedAccessToken;
  const token = await getAccessToken();
  if (!token) {
    if (hadToken || currentConnectionStatus === 'expired') {
      return { ok: false, expired: true, error: 'Google Drive session expired. Please reconnect.' };
    }
    notifyDriveStatus('disconnected', { error: 'No active Google Drive token' });
    return { ok: false, error: 'Not connected to Google Drive' };
  }

  notifyDriveStatus('checking');
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (res.status === 401) {
      markTokenExpired('Google Drive access token expired (401)');
      return {
        ok: false,
        expired: true,
        error: 'Google Drive session expired (401). Please reconnect.',
      };
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
  } catch (err) {
    const errorMsg = getErrorMessage(err) || 'Network error reaching Google Drive';
    notifyDriveStatus('disconnected', { error: errorMsg });
    return { ok: false, error: errorMsg };
  }
};

export const logout = async () => {
  await signOut(auth);
  clearToken();
  notifyDriveStatus('disconnected');
};

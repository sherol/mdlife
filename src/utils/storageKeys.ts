/**
 * Storage namespace + mock-mode switch.
 *
 * Mock/offline-demo mode must never touch the real vault cache or sync to Google Drive.
 * Entry points enable mock mode BEFORE the app (and anything reading storage) initializes,
 * by importing this module (URL auto-detection) or `./mockModeInit` (forced).
 */

const MOCK_PREFIX = 'mock_';

let keyPrefix = '';
let driveSyncDisabled = false;

function detectMockFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const { pathname, search } = window.location;
  return (
    pathname.endsWith('mock.html') ||
    pathname.endsWith('/mock') ||
    search.includes('offline=true') ||
    search.includes('mock=true')
  );
}

/** Switches storage to the isolated mock namespace and hard-disables Google Drive sync. */
export function enableMockMode(): void {
  keyPrefix = MOCK_PREFIX;
  driveSyncDisabled = true;
}

/** True when running in mock mode: nothing may be read from or written to Google Drive. */
export function isDriveSyncDisabled(): boolean {
  return driveSyncDisabled;
}

/** Namespaces a localStorage key (prefixed with "mock_" in mock mode). */
export function storageKey(key: string): string {
  return `${keyPrefix}${key}`;
}

if (detectMockFromUrl()) {
  enableMockMode();
}

/**
 * Theme preference: 'system' follows the OS setting, 'light'/'dark' are explicit.
 * The `dark` class on <html> switches the palette (see index.css). An inline script in
 * index.html/mock.html applies it before first paint to avoid a light flash.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'md_theme';
const media =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // storage unavailable (private mode) -> follow system
  }
  return 'system';
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#1c1917' : '#ffffff');
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // ignore; the choice still applies for this page view
  }
  applyTheme(pref);
}

/** Re-apply when the OS theme changes while following the system setting. */
export function watchSystemTheme(): () => void {
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system');
  };
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

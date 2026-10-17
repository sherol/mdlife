import React, { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getThemePref, setThemePref, watchSystemTheme, ThemePref } from '../utils/theme';

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemePref, string> = {
  system: 'Theme: follow system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

export const ThemeToggle: React.FC = () => {
  const [pref, setPref] = useState<ThemePref>(getThemePref);

  useEffect(() => watchSystemTheme(), []);

  const Icon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[pref];
        setThemePref(next);
        setPref(next);
      }}
      title={`${LABEL[pref]} (click to change)`}
      aria-label={LABEL[pref]}
      className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
};

'use client';

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'peerbridge_theme';
export const THEME_CHANGE_EVENT = 'peerbridge-theme-change';

export function readThemeMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch (error) {
    console.warn('Could not read saved theme preference.', error);
  }
  return 'system';
}

export function applyThemeMode(mode: ThemeMode): void {
  if (mode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}

export function saveThemeMode(mode: ThemeMode): boolean {
  applyThemeMode(mode);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
    return true;
  } catch (error) {
    console.warn('Theme was applied but could not be saved for future visits.', error);
    return false;
  }
}

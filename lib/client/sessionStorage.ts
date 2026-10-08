'use client';

export function readSessionSnapshot(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
  } catch (error) {
    console.warn('Browser session storage is unavailable; automatic session restore is disabled.', error);
    return null;
  }
}

export function writeSessionSnapshot(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('Could not save an automatic session-restore snapshot; the transfer can continue.', error);
    return false;
  }
}

export function clearSessionSnapshot(key: string): void {
  try {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('Could not clear the automatic session-restore snapshot.', error);
  }
}

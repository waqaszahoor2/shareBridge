'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[Offline] Could not register the offline app shell.', error);
    });
  }, []);

  return null;
}

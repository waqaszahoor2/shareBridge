'use client';

import { useEffect } from 'react';

export type ToastMessage = {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
};

interface ToastNotificationProps {
  toast: ToastMessage | null;
  onClose: () => void;
  durationMs?: number;
}

export default function ToastNotification({ toast, onClose, durationMs = 3000 }: ToastNotificationProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [toast, durationMs, onClose]);

  if (!toast) return null;

  return (
    <div className={`toastContainer toast-${toast.type}`} role="status">
      <span className="toastIcon">
        {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
      </span>
      <span className="toastText">{toast.text}</span>
      <button type="button" className="toastClose" onClick={onClose} aria-label="Close notification">
        ×
      </button>
    </div>
  );
}

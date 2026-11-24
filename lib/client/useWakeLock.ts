'use client';

import { useEffect } from 'react';

type ScreenWakeLock = {
  request(type: 'screen'): Promise<{
    release(): Promise<void>;
  }>;
};

export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: ScreenWakeLock }).wakeLock;
    if (!active || !wakeLock) return;

    let disposed = false;
    let lock: Awaited<ReturnType<ScreenWakeLock['request']>> | undefined;
    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      try {
        lock = await wakeLock.request('screen');
        if (disposed) await lock.release();
      } catch (error) {
        console.warn('[Wake Lock] Could not keep the screen awake.', error);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (lock) void lock.release().catch((error) => console.warn('[Wake Lock] Could not release the screen lock.', error));
    };
  }, [active]);
}

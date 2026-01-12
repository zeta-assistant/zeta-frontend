'use client';

import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    (async () => {
      try {
        if (!('serviceWorker' in navigator)) return;

        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        await reg.update();

        console.log('[SW] registered:', reg.active?.scriptURL ?? '(waiting)');
      } catch (e) {
        console.error('[SW] registration failed:', e);
      }
    })();
  }, []);

  return null;
}

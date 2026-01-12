/* public/sw.js */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const msg = event?.data || {};

  if (msg?.type === 'SHOW_TEST_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification('Pantheon', {
        body: 'Manual notification test ✅',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' },
      })
    );
    return;
  }

  if (msg?.type === 'SHOW_CUSTOM_NOTIFICATION') {
    const title = msg?.title || 'Pantheon';
    const body = msg?.body || 'New notification';
    const url = msg?.url || '/';

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
      })
    );
  }
});


// ✅ THIS is what you’re missing: handle real web-push events
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        try {
          payload = { body: event.data ? await event.data.text() : '' };
        } catch {
          payload = {};
        }
      }

      // Support both {title, body, url} and {notification:{...}}
      const title = payload?.title || payload?.notification?.title || 'Pantheon';
      const body =
        payload?.body || payload?.notification?.body || 'You have a new update.';
      const url =
        payload?.url ||
        payload?.data?.url ||
        payload?.notification?.data?.url ||
        '/';

      const icon =
        payload?.icon || payload?.notification?.icon || '/icons/icon-192.png';
      const badge =
        payload?.badge || payload?.notification?.badge || '/icons/icon-192.png';

      await self.registration.showNotification(title, {
        body,
        icon,
        badge,
        data: { url, payload },
      });
    })()
  );
});

// Open/focus app when user taps notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event?.notification?.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Focus existing window if possible
      for (const client of clientsArr) {
        try {
          await client.focus();
          try {
            await client.navigate(url);
          } catch {}
          return;
        } catch {}
      }

      // Otherwise open a new one
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

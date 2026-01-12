/* public/sw.js */
/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Manual test from your UI (postMessage)
self.addEventListener("message", (event) => {
  const msg = event?.data || {};
  if (msg?.type === "SHOW_TEST_NOTIFICATION") {
    event.waitUntil(
      self.registration.showNotification("Pantheon", {
        body: "Manual notification test ✅",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: "/" },
      })
    );
  }
});

// ✅ Real web-push handler (this is the missing piece)
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      try {
        payload = { body: event.data ? await event.data.text() : "" };
      } catch {
        payload = {};
      }
    }

    const title =
      payload?.title ||
      payload?.notification?.title ||
      "Pantheon";

    const body =
      payload?.body ||
      payload?.notification?.body ||
      "You have a new update.";

    const url =
      payload?.url ||
      payload?.data?.url ||
      payload?.notification?.data?.url ||
      "/";

    const icon =
      payload?.icon ||
      payload?.notification?.icon ||
      "/icons/icon-192.png";

    const badge =
      payload?.badge ||
      payload?.notification?.badge ||
      "/icons/icon-192.png";

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url, payload },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event?.notification?.data?.url || "/";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Focus an existing tab if open
    for (const client of allClients) {
      if ("focus" in client) {
        client.focus();
        // If it's already on your origin, just navigate it
        try {
          client.navigate(url);
        } catch {}
        return;
      }
    }

    // Otherwise open a new tab
    if (self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  })());
});

// public/sw.js  (custom source for next-pwa)

// ✅ Web Push handlers (robust: no JSON crash, always shows)
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (e) {
      // If payload is missing / not JSON, still show default notif
      data = {};
    }

    const title = data.title || "Pantheon";
    const options = {
      body: data.body || "Test push received ✅",
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      data: { url: data.url || "/" },
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    // Prefer focusing an existing tab on same origin
    const match = allClients.find((c) => {
      try {
        return new URL(c.url).pathname === new URL(url, self.location.origin).pathname;
      } catch {
        return false;
      }
    });

    if (match) return match.focus();
    return clients.openWindow(url);
  })());
});

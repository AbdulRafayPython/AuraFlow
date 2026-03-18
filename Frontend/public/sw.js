// public/sw.js — AuroFlow Service Worker for Web Push Notifications
// Handles push events and notification clicks.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'AuroFlow', body: event.data.text() };
  }

  const title = payload.title || 'AuroFlow';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/AuraflowLogo.png',
    badge: '/AuraflowLogo.png',
    data: payload.data || {},
    vibrate: [100, 50, 100],
    tag: payload.data?.notificationId ? `notif-${payload.data.notificationId}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return;
        }
      }
      // Otherwise open a new tab
      return clients.openWindow(url);
    })
  );
});

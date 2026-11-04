// UniMate service worker: shows pushes (messages, likes, follows…) and opens the right screen when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const iOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent);

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'يونيميت', body: e.data ? e.data.text() : '' }; }
  const url = d.url || '/';
  e.waitUntil((async () => {
    // already looking at this chat: no need for a banner (iPhone always needs one shown)
    if (!iOS) {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (open.some((c) => c.focused && c.visibilityState === 'visible' && new URL(c.url).pathname === url)) return;
    }
    await self.registration.showNotification(d.title || 'يونيميت', {
      body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: d.icon || '/icon-512.png', badge: '/icon-512.png',
      dir: 'auto', lang: 'ar', data: { url },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = open[0];
    if (c) { await c.focus(); c.postMessage({ type: 'open', url }); return; }
    await self.clients.openWindow(url);
  })());
});

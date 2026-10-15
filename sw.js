// Eaji — permet d'installer l'application sur le téléphone.
// Les pages sont toujours chargées depuis Internet en priorité (pour avoir la dernière version) ;
// la copie gardée sur le téléphone ne sert que si la connexion est coupée.
// Les échanges avec le serveur (API) ne sont jamais mis en cache.
const CACHE_NAME = 'eaji-v10';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API, fichiers, appels : jamais en cache
  // Les pages et fichiers de l'application sont toujours revérifiés auprès du site (jamais une vieille copie).
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});

// ==== Notifications sur l'appareil (écran verrouillé, application fermée) ====
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const call = d.kind === 'appel';
  event.waitUntil((async () => {
    // Eaji est ouvert et affiché à l'écran : l'application prévient elle-même (sonnerie, compteur).
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const shown = wins.find((w) => w.visibilityState === 'visible' && w.focused);
    if (shown) { shown.postMessage({ type: 'eaji-push', ...d }); return; }
    await self.registration.showNotification(d.title || 'Eaji', {
      body: d.body || '',
      icon: String(d.link || '').startsWith('admin:') ? 'icon-admin-192.png' : 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || d.kind || 'eaji',
      renotify: true,                       // re-sonne même si une notification du même fil est déjà là
      requireInteraction: call,             // un appel reste affiché jusqu'à ce qu'on le touche
      vibrate: call ? [600, 300, 600, 300, 600, 300, 600] : [200, 100, 200],
      timestamp: d.at || Date.now(),
      data: { link: d.link || '' },
      actions: call ? [{ action: 'open', title: 'Répondre' }, { action: 'close', title: 'Ignorer' }] : [],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const link = (event.notification.data && event.notification.data.link) || '';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Alerte de l'application Eaji Admin : on ouvre le tableau de bord sur le bon onglet.
    if (link.startsWith('admin:')) {
      const adm = wins.find((w) => w.url.includes('admin-dashboard'));
      if (adm) { await adm.focus(); adm.postMessage({ type: 'eaji-open', link }); return; }
      await self.clients.openWindow(new URL('./admin-dashboard.html?tab=' + encodeURIComponent(link.slice(6)), self.registration.scope).href);
      return;
    }
    const app = wins.find((w) => w.url.startsWith(self.registration.scope) && !w.url.includes('admin-dashboard'));
    if (app) { await app.focus(); app.postMessage({ type: 'eaji-open', link }); return; }
    await self.clients.openWindow(new URL('./?go=' + encodeURIComponent(link), self.registration.scope).href);
  })());
});

// Le téléphone a renouvelé l'abonnement : l'application le renverra au serveur à sa prochaine ouverture.
self.addEventListener('pushsubscriptionchange', () => {});

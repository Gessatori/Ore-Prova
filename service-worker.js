const CACHE_NAME = 'tecnoplafon-ore-v25-push-materiale';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './styles.css',
  './app.js',
  './config.js',
  './supporto_cantieri.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './push-materiale.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(res => res || caches.match('./index.html'))
    )
  );
});

self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'Nuova richiesta materiale',
      body: event.data ? event.data.text() : 'Apri il gestionale Tecnoplafon'
    };
  }

  const title = data.title || 'Nuova richiesta materiale';
  const options = {
    body: data.body || 'Apri il gestionale Tecnoplafon',
    icon: './icons/icon-192.png',
    badge: './icons/icon-180.png',
    data: {
      url: data.url || './admin.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : './admin.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('admin.html') && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

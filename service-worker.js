const CACHE_NAME = 'tecnoplafon-ore-v10-push-materiale';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './styles.css',
  './app.js',
  './config.js',
  './push-materiale.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

async function fetchAdminWithPush(request){
  const response = await fetch(request).catch(() => null);
  const cached = response || await caches.match('./admin.html');
  if(!cached) return caches.match('./index.html');
  const html = await cached.text();
  if(html.includes('push-materiale.js')) return new Response(html, {headers:{'content-type':'text/html; charset=utf-8'}});
  const out = html.replace('</body>', '<script src="./push-materiale.js"></script></body>');
  return new Response(out, {headers:{'content-type':'text/html; charset=utf-8'}});
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.pathname.endsWith('/admin.html') || url.pathname.endsWith('/Ore-Prova/admin.html')){
    event.respondWith(fetchAdminWithPush(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match('./index.html')))
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Tecnoplafon - materiale';
  const options = {
    body: data.body || 'Nuova richiesta materiale in attesa.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-180.png',
    data: { url: data.url || './admin.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : './admin.html';
  event.waitUntil(clients.openWindow(url));
});

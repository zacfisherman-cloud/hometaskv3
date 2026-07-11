// Minimal cache-first (stale-while-revalidate) shell cache so home-screen
// launches render instantly, even offline. Data was already offline-capable
// via localStorage — this covers the shell itself.
//
// Only the app shell and its CDN scripts are handled; every other request
// (Firestore, auth, the FSQ proxy, OSRM, Nominatim…) passes straight through
// untouched. SWR means the first launch after a deploy can still show the
// previous version — the refreshed shell lands on the next open.
const CACHE = 'ht-shell-v1';

const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js',
  'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShellRequest(req){
  if(req.method !== 'GET') return false;
  const url = new URL(req.url);
  if(url.origin === self.location.origin){
    return url.pathname === '/' || url.pathname === '/index.html'
        || url.pathname === '/app.js' || url.pathname === '/styles.css';
  }
  return SHELL.includes(req.url);
}

self.addEventListener('fetch', e => {
  if(!isShellRequest(e.request)) return; // everything else: default network
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request, {ignoreSearch: e.request.url.startsWith(self.location.origin)});
      const refresh = fetch(e.request).then(res => {
        if(res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      return cached || refresh.then(r => r || new Response('offline', {status: 503}));
    })
  );
});

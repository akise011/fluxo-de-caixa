// Service Worker: guarda os arquivos do app para abrir sem internet.
const CACHE = 'controle-mais-v8';
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'script.js', 'favicon.svg', 'icone-192.png', CDN];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (pega a versão nova); sem rede, usa o cache.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || (url.origin !== location.origin && req.url !== CDN)) return; // chamadas ao Supabase não passam pelo cache
  e.respondWith(
    fetch(req).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return r; })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

/* Battle Cards — offline support for the phone version. Caches the page, the shared game files
 * from ../public and every card illustration, then serves them from the cache (refreshing in
 * the background) so the game opens and plays without a connection. */
'use strict';
const CACHE = 'battle-cards-mobile-v1';
const SHARED = '../public/';
const SCRIPTS = ['sets/elementals.js', 'sets/bureau.js', 'sets/apex.js', 'sets/octo.js', 'sets/hollowing.js', 'cards.js', 'engine.js',
  'bots.js', 'render.js', 'sound.js', 'ui.js', 'controllers.js', 'tutorial.js', 'deckbuilder.js', 'rules.js', 'main.js'];
const CORE = ['./', 'index.html', 'css/mobile.css', 'js/layout.js', 'js/mobile.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  SHARED + 'css/style.css'].concat(SCRIPTS.map(s => SHARED + 'js/' + s));

// The card list tells us which illustrations exist.
importScripts(...['sets/elementals.js', 'sets/bureau.js', 'sets/apex.js', 'sets/octo.js', 'sets/hollowing.js', 'cards.js'].map(s => SHARED + 'js/' + s));
const ART = Object.keys(self.BCCards.byId).map(id => SHARED + 'art/' + id + '.svg');

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(ART.map(u => c.add(u).catch(() => {}))); // a missing image just falls back to its emoji
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return; // online play goes to the network
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await fresh) || new Response('Offline', { status: 503 });
  })());
});

/* Battle Cards — phone extras: install as an app (offline play) and the desktop link. */
(function () {
  'use strict';
  // The service worker caches the game so it works offline once installed to the home screen.
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline play just won't be available */ }));
  }
  // Opened as a single downloaded file there is no desktop page next to it.
  const link = document.getElementById('desktop-link');
  if (link && !/^https?:/.test(location.protocol) && window.BCArt) link.remove();
})();

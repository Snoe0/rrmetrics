// Minimal service worker to satisfy PWA installability.
// No caching — the app is online-only.
self.addEventListener('fetch', () => {});

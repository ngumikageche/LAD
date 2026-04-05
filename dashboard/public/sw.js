self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Ignore non-HTTP(S) schemes (e.g., chrome-extension://) to avoid Cache API errors.
  if (!event.request?.url?.startsWith('http')) return;

  // Intentionally no caching logic here; requests fall through to the network.
});

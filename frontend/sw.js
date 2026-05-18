const CACHE_NAME = 'pharma-inventory-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// Cache static assets during installation
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Handle fetch requests
self.addEventListener('fetch', function(event) {
  // Handle API requests separately from static assets
  if (event.request.url.includes('/api/')) {
    // Only cache GET requests (POST/PUT/DELETE cannot be cached via cache.put)
    if (event.request.method !== 'GET') {
      event.respondWith(fetch(event.request));
      return;
    }

    // For API requests, try network first, then fallback to cached data or return error
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // If response is valid, clone it and store in cache
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(function() {
          // If network fails, try to get from cache
          return caches.match(event.request)
            .then(function(response) {
              return response || new Response(JSON.stringify({error: 'Offline'}), {
                status: 503,
                headers: {'Content-Type': 'application/json'}
              });
            });
        })
    );
  } else {
    // For static assets, serve from cache if available, otherwise fetch from network
    event.respondWith(
      caches.match(event.request)
        .then(function(response) {
          // Return cached version if available, otherwise fetch from network
          return response || fetch(event.request);
        })
    );
  }
});

// Clean up old caches during activation
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          // Delete old caches that aren't our main cache
          return cacheName !== CACHE_NAME;
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
});
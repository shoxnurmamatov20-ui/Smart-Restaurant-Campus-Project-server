/*
 * The service worker, and the two things it is deliberately narrow about.
 *
 * This application is multi-tenant and mostly authenticated. A service worker
 * sees every request the page makes, so the default advice — "cache pages for
 * offline" — is dangerous here in a specific way: a cached HTML document from
 * one signed-in person, replayed to the next person on a shared tablet, is one
 * restaurant's figures shown to another. So:
 *
 *   **No HTML is ever stored.** Navigations go to the network, and when the
 *   network is gone they fall back to one static page that contains nothing.
 *
 *   **No `/api/` request is ever touched.** Not cached, not intercepted, not
 *   retried. Money moves through those calls.
 *
 * What it does do is the part that is both safe and worth having: it serves
 * Next's content-hashed assets from a cache, and it exists at all — which is
 * what makes the browser offer to install the app. The manifest alone does not;
 * Chrome requires a fetch handler before it shows the prompt, so until now this
 * project shipped a manifest promising an installable app that could not be
 * installed.
 */

/*
 * Bumped by hand when the strategy changes, NOT per deploy.
 *
 * Next's static assets are content-hashed, so a new build writes new URLs and
 * the old entries simply stop being requested — `trimCache` clears them on the
 * next activation. Versioning per deploy would throw away a warm cache on every
 * release for nothing.
 */
const VERSION = 'srcp-v1';
const ASSETS = `${VERSION}-assets`;
const SHELL = `${VERSION}-shell`;

/** The one page that may be served from the cache, because it says nothing. */
const OFFLINE = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add(OFFLINE)));
  /*
   * No `skipWaiting()`.
   *
   * Activating immediately swaps the worker under a page that is already
   * running, so a document from the old build starts asking a new worker for
   * assets that no longer exist. The new worker takes over on the next
   * navigation instead, which is one reload later and always consistent.
   */
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Content-hashed and immutable: safe to serve from a cache forever. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/');
}

/** Icons and the manifest. Small, rarely changed, and needed to install. */
function isAppIcon(url) {
  return /^\/(icon|apple-icon|favicon)[^/]*$/.test(url.pathname) || url.pathname === '/manifest.json';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Anything that is not a plain GET is a write. Never touched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Another origin's problem. Fonts, analytics, anything embedded.
  if (url.origin !== self.location.origin) return;

  /*
   * The API, untouched — no cache, no interception, no offline fallback.
   *
   * A stale order, a replayed payment or one tenant's data answered to another
   * are all failure modes a caching layer introduces and none of them are
   * visible in testing. The POS has its own offline queue for exactly this
   * problem, in the one place that understands what may be replayed.
   */
  if (url.pathname.startsWith('/api/')) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }

            return response;
          }),
      ),
    );

    return;
  }

  if (isAppIcon(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => caches.match(request)),
    );

    return;
  }

  /*
   * A page. Always from the network; the offline page only when there is none.
   *
   * `request.mode === 'navigate'` rather than a path test, so this covers every
   * surface — console, till, staff app, restaurant site — without a list that
   * would go stale the day a route group is added.
   */
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
  }
});

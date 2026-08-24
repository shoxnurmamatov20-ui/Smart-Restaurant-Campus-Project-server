import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

/**
 * The service worker, driven rather than read.
 *
 * A service worker is the one piece of this application that sits between every
 * request and the network, and it is invisible: it has no type checker, no
 * import graph, and nothing renders when it is wrong. The two properties below
 * are not performance concerns — they are the reason a caching layer is
 * dangerous in a multi-tenant, mostly-authenticated product:
 *
 *   **No HTML is ever stored.** A cached document belongs to whoever was signed
 *   in when it was fetched. Replayed to the next person on a shared till or a
 *   handed-over phone, it is one restaurant's figures shown to another.
 *
 *   **`/api/` is never touched.** Money moves through those calls. A stale
 *   order, a replayed payment, or one tenant's data answered to another are all
 *   failure modes a cache introduces and none of them are visible in testing.
 *
 * So the file is loaded and its handler is actually run, rather than grepped.
 * A test that matched on source text would pass the day somebody rewrote the
 * same mistake differently.
 */
const SOURCE = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

type Handler = (event: FakeEvent) => void;

type FakeEvent = {
  request: { method: string; url: string; mode?: string };
  respondWith: (value: unknown) => void;
  waitUntil: (value: unknown) => void;
};

/** What the worker was allowed to write, by cache name. */
let stored: { cache: string; url: string }[] = [];

/** Every `respondWith` the worker made, so "did it intervene at all" is testable. */
let responded: boolean;

function loadWorker(): { fetch: Handler } {
  const handlers: Record<string, Handler> = {};

  const self = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    location: { origin: 'https://oshxona.uz' },
    clients: { claim: () => Promise.resolve() },
  };

  const caches = {
    open: (name: string) =>
      Promise.resolve({
        add: () => Promise.resolve(),
        put: (request: { url: string }) => {
          stored.push({ cache: name, url: request.url });

          return Promise.resolve();
        },
      }),
    match: () => Promise.resolve(undefined),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  };

  const fetchStub = () =>
    Promise.resolve({ ok: true, clone: () => ({ url: 'copy' }) } as unknown as Response);

  /*
   * The worker's own source, executed with a fake global.
   *
   * `new Function` rather than an import, because `public/sw.js` is not a
   * module: it reaches for `self`, `caches` and `fetch` off the global scope
   * the way a service worker does. Handing those in as parameters is what lets
   * the real file — the one the browser will run — be driven here.
   */
  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, fetchStub);

  return { fetch: handlers.fetch! };
}

function ask(worker: { fetch: Handler }, url: string, over: Partial<FakeEvent['request']> = {}) {
  responded = false;

  worker.fetch({
    request: { method: 'GET', url, mode: 'no-cors', ...over },
    respondWith: () => {
      responded = true;
    },
    waitUntil: () => {},
  });
}

describe('service worker', () => {
  beforeEach(() => {
    stored = [];
    responded = false;
  });

  it('registers a fetch handler at all', () => {
    /*
     * Not a formality. Chrome will not offer to install a web app unless the
     * worker has a fetch handler — a manifest alone gets no prompt — which is
     * the whole reason this file exists on a platform that caches almost
     * nothing.
     */
    expect(loadWorker().fetch).toBeTypeOf('function');
  });

  it('never stores a page', async () => {
    const worker = loadWorker();

    ask(worker, 'https://oshxona.uz/dashboard', { mode: 'navigate' });
    ask(worker, 'https://oshxona.uz/pos', { mode: 'navigate' });
    ask(worker, 'https://oshxona.uz/r/osh-xona', { mode: 'navigate' });

    /*
     * A macrotask, not `await Promise.resolve()`.
     *
     * A cache write is `caches.open(...).then((cache) => cache.put(...))` —
     * two microtasks deep — so a single `await` asserts before the write it is
     * looking for could have happened. Written that way first, and it passed
     * against a worker that DID cache every page: the test proved nothing.
     */
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A cached `/dashboard` is one signed-in person's figures, served to
    // whoever opens the tablet next.
    expect(stored).toEqual([]);
  });

  it('does not intervene in an API call at all', () => {
    const worker = loadWorker();

    ask(worker, 'https://oshxona.uz/api/pos/bill?bill=41');

    /*
     * Not "does not cache it" — does not call `respondWith` at all, so the
     * request goes to the network exactly as if no worker existed. Anything
     * else puts a cache between a till and its money.
     */
    expect(responded).toBe(false);
    expect(stored).toEqual([]);

    /*
     * And again as a navigation, which is what makes this test discriminate.
     *
     * A plain GET to `/api/` falls through every branch anyway, so removing the
     * guard changes nothing and the assertion above passes either way — it did,
     * when the guard was deleted to check. A navigation reaches the page branch,
     * so only the guard stops it being answered from a cache.
     */
    ask(worker, 'https://oshxona.uz/api/v1/pos/bills/41', { mode: 'navigate' });

    expect(responded).toBe(false);
  });

  it('leaves every write alone', () => {
    const worker = loadWorker();

    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      ask(worker, 'https://oshxona.uz/r/osh-xona/book/submit', { method });
      expect(responded, `${method} was intercepted`).toBe(false);
    }
  });

  it('ignores another origin entirely', () => {
    const worker = loadWorker();

    ask(worker, 'https://fonts.gstatic.com/s/inter.woff2');

    expect(responded).toBe(false);
  });

  it('serves and stores Next’s content-hashed assets', async () => {
    const worker = loadWorker();

    ask(worker, 'https://oshxona.uz/_next/static/chunks/main-abc123.js');

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Immutable by construction: a new build writes a new URL, so a cache entry
    // can never be stale — which is what makes this one safe when pages are not.
    expect(responded).toBe(true);
    expect(stored.map((entry) => entry.url)).toContain(
      'https://oshxona.uz/_next/static/chunks/main-abc123.js',
    );
  });
});

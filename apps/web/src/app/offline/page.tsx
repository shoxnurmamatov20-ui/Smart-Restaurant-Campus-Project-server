/**
 * What a reader sees when the network is gone.
 *
 * The only page in this application the service worker is allowed to store, and
 * it is allowed because it contains nothing: no name, no restaurant, no
 * figures. A cached page that held any of those would be one person's data
 * shown to whoever picks the tablet up next.
 *
 * Trilingual with no language negotiation, and that is deliberate rather than
 * lazy: this document is served by a service worker from a cache, with no
 * server to read `Accept-Language` and no way to know who is reading. Three
 * short lines is smaller than the logic to choose one, and correct for
 * everybody.
 *
 * No JavaScript beyond the retry, because on the connection this page exists
 * for, a bundle is the thing that did not arrive.
 */
export const metadata = {
  title: 'Oflayn',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Ulanish yo‘q</h1>
        <p className="text-fg-subtle text-sm">Нет соединения</p>
        <p className="text-fg-subtle text-sm">No connection</p>
      </div>

      <p className="text-fg-subtle max-w-[38ch] text-sm leading-normal">
        Sahifani ochish uchun internet kerak. Ulanish tiklanganda qayta urinib ko‘ring.
      </p>

      {/*
       * A plain anchor, and `next/link` would be wrong here.
       *
       * This document is served by the service worker from a cache, to a
       * browser with no network. `<Link>` hydrates into a client navigation
       * that fetches an RSC payload — a request that cannot succeed, and one
       * that leaves the reader on a page that appears to do nothing when
       * tapped. A full navigation goes back through the service worker, which
       * either finds the network or serves this page again.
       *
       * `location.reload()` is out for the same family of reasons: it needs a
       * script, and a script is what did not arrive.
       */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="border-border grid h-11 place-items-center rounded-md border px-5 text-sm font-semibold"
      >
        Qayta urinish · Повторить · Retry
      </a>
    </main>
  );
}

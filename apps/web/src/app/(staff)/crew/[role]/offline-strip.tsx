'use client';

import { useSyncExternalStore } from 'react';

import { copy, OFFLINE } from '@restaurant/surfaces/crew/copy';
import type { Lang } from '@restaurant/surfaces/crew/data';

/**
 * The browser's own connectivity, as a store.
 *
 * `useSyncExternalStore` is what this is for — `navigator.onLine` is an
 * external source that changes without React's involvement — and it also gets
 * the server right: the server snapshot is `true`, so nothing renders during
 * SSR and the strip cannot flash on every page load before the browser has
 * said anything. A strip that appears on load is one people learn to ignore.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);

  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * The amber strip that appears when the phone loses the network.
 *
 * Not decoration and not a demo toggle — the design file has a switch above the
 * frame so a reviewer can see the state, and this reads the browser instead.
 * The internet drops during the evening rush in Tashkent; it is a daily
 * condition here, not an edge case, and a waiter needs to know the table list
 * they are about to act on stopped updating four minutes ago.
 *
 * **It says only what is true.** The design's strip reads "keep working,
 * everything is saved", because the prototype has an offline queue behind it.
 * This build does not, so the strip says the figures may be stale — something a
 * reader can act on — rather than promising a queue that would silently swallow
 * their order.
 */
export function OfflineStrip({ lang }: { lang: Lang }) {
  const t = copy(OFFLINE, lang);

  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="border-warning-500/30 bg-warning-50 flex flex-none items-center gap-2.5 border-b px-[var(--crew-gutter)] py-2"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
        className="text-warning-600 flex-none"
      >
        <path d="M2 3l20 18" />
        <path d="M5 12.5a10 10 0 0 1 4-2.4" />
        <path d="M12 16.8h.01" />
        <path d="M15.5 13.2a6 6 0 0 0-2-1.1" />
      </svg>
      <p className="text-warning-700 text-2xs min-w-0 truncate font-semibold">
        {t.title} · <span className="font-normal">{t.body}</span>
      </p>
    </div>
  );
}

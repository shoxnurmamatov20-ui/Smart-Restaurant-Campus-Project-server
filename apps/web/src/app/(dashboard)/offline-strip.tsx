'use client';

import { useSyncExternalStore } from 'react';

/**
 * The console's own connectivity strip.
 *
 * The staff app has had one since it shipped and the back office had none — a
 * manager reading a floor plan that stopped updating four minutes ago had
 * nothing on screen to say so. The internet drops during the evening rush in
 * Tashkent; it is a daily condition here rather than an edge case.
 *
 * `useSyncExternalStore` is what `navigator.onLine` is for: an external source
 * that changes without React's involvement, with a server snapshot of `true` so
 * the strip cannot flash on every page load before the browser has said
 * anything. A strip that appears on load is one people learn to ignore.
 *
 * **It says only what is true.** The console has no offline queue — the POS
 * does, and that is a different surface — so this warns that the figures are
 * stale rather than promising that edits are saved. Promising a queue that does
 * not exist is how an edit gets lost while somebody believes it is held.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);

  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function OfflineStrip({ label }: { label: string }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="bg-warning-500 flex h-9 flex-none items-center justify-center gap-2.5 px-4 text-xs font-semibold text-white"
    >
      {/* `data-live` is the design's own loop, and this is the one state it is
          for: the dot pulses while the condition holds and stops the moment the
          strip disappears. `motion.css` drops it under reduced motion. */}
      <span data-live="true" aria-hidden className="size-2 rounded-full bg-white/85" />
      {label}
    </div>
  );
}

'use client';

import { useSyncExternalStore } from 'react';

import type { TgMode } from '@restaurant/surfaces/tg/data';

/**
 * Delivery or pickup, held for the whole mini app.
 *
 * The design puts the switch in the menu header (`switchMode`) and reads the
 * answer in the cart totals — `deliv = mode === "delivery" ? 12000 : 0`. Two
 * screens, one decision, so it cannot live in either one's `useState`: a guest
 * who chose pickup on the menu and was charged 12 000 so'm at the basket would
 * be right to think the app is lying to them.
 *
 * A module store rather than context, matching `lib/guest-cart`: the screens
 * around it stay server components and only the small islands subscribe.
 * `localStorage` because the WebView is reloaded whenever Telegram feels like
 * it, and a mode that resets to delivery on reload is a fee that reappears.
 */
const KEY = 'srcp.tg.mode';

const listeners = new Set<() => void>();

let cached: TgMode = 'delivery';
let loaded = false;

function read(): TgMode {
  if (typeof window === 'undefined') return 'delivery';

  if (!loaded) {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === 'delivery' || raw === 'pickup') cached = raw;
    } catch {
      /* Private mode. Delivery is the honest default: it is the one that costs. */
    }

    loaded = true;
  }

  return cached;
}

export function setMode(next: TgMode): void {
  cached = next;
  loaded = true;

  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* The choice still holds for this visit. */
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useMode(): TgMode {
  return useSyncExternalStore(subscribe, read, () => 'delivery' as TgMode);
}

'use client';

import { useSyncExternalStore } from 'react';

/**
 * The delivery address this browser has chosen, shared by the header and the
 * sheet that sets it.
 *
 * The header used to read `addrCity` — "Chilonzor 24, Toshkent" — from the
 * catalogue, so every visitor, signed in or not, in Termiz or in Tashkent,
 * saw the design's street as their own. A guest who has chosen nothing sees
 * "choose an address"; a choice is kept in this browser so the next visit
 * starts where the last one ended. The signed-in address book is the API's
 * (`PUT /api/v1/mp/me/addresses`); this is only which one is current.
 */
const KEY = 'mp.address';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function chooseAddress(address: string | null): void {
  try {
    if (address === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, address);
  } catch {
    // A private window that refuses storage still gets the choice for this page.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** The chosen address, or null — and null on the server, so the first paint matches. */
export function useChosenAddress(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

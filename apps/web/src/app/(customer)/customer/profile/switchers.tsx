'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { LANG_COOKIE } from '../../customer-session';
import type { Lang } from '@restaurant/surfaces/customer/data';

/**
 * The two settings rows that actually change something.
 *
 * Both had been `RowText` — a label, a grey value, no control. The language row
 * printed whatever `Accept-Language` said and could not be argued with, and the
 * appearance row printed the words "Light · Dark" as though naming the options
 * were the same as offering them. On a phone app in a trilingual market, the
 * language switch is not a setting; it is the second thing a customer looks for.
 *
 * ---------------------------------------------------------------------------
 * Language writes a cookie and refreshes
 *
 * The copy is resolved on the server (`copy(SECTION, lang)`), so changing the
 * language has to reach the server. `router.refresh()` re-renders the current
 * route with the new cookie and keeps the scroll position and the cart, which a
 * full navigation would not.
 */
export function LanguageRow({ label, current }: { label: string; current: Lang }) {
  const router = useRouter();

  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="text-sm">{label}</span>

      <span className="bg-bg-muted flex gap-0.5 rounded-md p-0.5">
        {(['uz', 'ru', 'en'] as const).map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={code === current}
            onClick={() => {
              /* A year, path-wide. A preference that expires with the tab is a
                 preference the customer has to set again tomorrow. */
              document.cookie = `${LANG_COOKIE}=${code};path=/;max-age=31536000;samesite=lax`;
              router.refresh();
            }}
            className={`text-2xs grid h-8 w-9 place-items-center rounded font-bold ${
              code === current ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
            }`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ theme */

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'srcp.customer.theme';

/**
 * The chosen theme, as a store rather than as `useState`.
 *
 * `localStorage` is not reactive and this value is read during render, so a
 * `useSyncExternalStore` with a cached snapshot is what keeps the button row and
 * the `<html>` attribute from disagreeing after a change. The server snapshot is
 * `'system'`, which is what the markup is generated against.
 */
let cached: Theme = 'system';
const listeners = new Set<() => void>();

function readTheme(): Theme {
  const raw = window.localStorage.getItem(THEME_KEY);

  if (raw === 'light' || raw === 'dark' || raw === 'system') cached = raw;

  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function writeTheme(next: Theme): void {
  cached = next;
  window.localStorage.setItem(THEME_KEY, next);
  applyTheme(next);

  for (const listener of listeners) listener();
}

/**
 * `data-theme` on the root element, which is the contract the token layer
 * publishes: `:root[data-theme='dark']` redefines the palette, and the bare
 * `:root` plus `prefers-color-scheme` handles "system". So "system" removes the
 * attribute rather than setting a third value.
 */
function applyTheme(theme: Theme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export function AppearanceRow({
  label,
  light,
  dark,
  system,
}: {
  label: string;
  light: string;
  dark: string;
  system: string;
}) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);

  /*
   * Re-apply on mount, and only that — no state is set here.
   *
   * The attribute is normally written before first paint by the inline script
   * in `(customer)/layout.tsx`, which is what stops the app flashing white on a
   * dark phone. This is the belt to that braces: it covers the case where the
   * value changed in another tab while this one was in the background.
   */
  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  const options = [
    ['light', light],
    ['dark', dark],
    ['system', system],
  ] as const;

  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="text-sm">{label}</span>

      <span className="bg-bg-muted flex gap-0.5 rounded-md p-0.5">
        {options.map(([value, text]) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => writeTheme(value)}
            className={`h-8 rounded px-2.5 text-xs font-semibold ${
              theme === value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
            }`}
          >
            {text}
          </button>
        ))}
      </span>
    </li>
  );
}

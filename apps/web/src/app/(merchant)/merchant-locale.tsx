'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/theme-provider';

import { rememberLocale } from '@/i18n/locale';
import { withLocale } from '@/lib/locale-path';
import { useLocalePath } from '@/lib/use-locale-path';

import type { Lang } from './merchant-data';

/**
 * Language and theme, in the merchant panel's own header.
 *
 * `MyPOS Marketplace - Do'kon paneli.dc.html:138-145` draws both: three 28px
 * segments reading UZ · RU · EN, a hairline divider, and a 30px theme button
 * carrying a moon or a sun. It had been left out on the reasoning that language
 * comes from `Accept-Language` and the theme is set platform-wide — which is
 * true of the *defaults* and beside the point. A shop manager in Chilonzor is
 * not the person who configured the platform, and the design puts the control
 * in front of them because they are the one who needs it.
 *
 * The theme comes from the app's own `ThemeProvider`, not from `next-themes`.
 * `next-themes` is a dependency of `packages/ui` — the Toaster reads it — and
 * importing it here would work only for as long as pnpm happens to hoist it,
 * which is an undeclared dependency wearing a passing build.
 *
 * The language is written to the same cookie the console uses, so a person who
 * works in both windows sets it once. `router.refresh()` because this panel is
 * server-rendered from `Accept-Language` and the cookie: the new words have to
 * come back from the server rather than being swapped in the browser.
 *
 * `data-seg` / `data-on` are the design's own attribute pair here — note it uses
 * `data-on`, not the console's `data-active`, so the selected fill is drawn by
 * `mp.css` rather than by the shared rule. Both are the same treatment; the
 * design simply named them differently on the two surfaces and the file wins.
 */

const LANGS: readonly { code: Lang; label: string }[] = [
  { code: 'uz', label: 'UZ' },
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
];

export function MerchantLocale({ lang, themeLabel }: { lang: Lang; themeLabel: string }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { here } = useLocalePath();

  const dark = resolvedTheme === 'dark';

  function choose(next: Lang) {
    if (next === lang) return;

    // `rememberLocale` writes the year-long cookie; the console shares it, and
    // it is what an unprefixed URL gets redirected to.
    rememberLocale(next);
    /*
     * The language's own URL, loaded as a document.
     *
     * `router.refresh()` was here and it was wrong twice over. It re-fetched
     * every server component and swapped them in place — on a phone that
     * measured 1327 ms of the old language sitting on screen — and it left the
     * address bar naming a language the page was no longer in, which is the
     * whole thing the move into the path was for.
     *
     * A client navigation cannot do this either: `<html lang>` is set by the
     * root layout from a request header, and root layouts do not re-render on
     * navigation. The document has to be the thing that changes.
     */
    const { search, hash } = window.location;

    window.location.assign(`${withLocale(here, next)}${search}${hash}`);
  }

  return (
    <div className="bg-bg-muted flex flex-none items-center gap-0.5 rounded-[9px] p-[3px]">
      {LANGS.map((entry) => (
        <button
          key={entry.code}
          type="button"
          data-seg
          data-on={entry.code === lang ? 'true' : undefined}
          aria-pressed={entry.code === lang}
          onClick={() => choose(entry.code)}
          className="text-fg-muted h-7 rounded-[7px] px-[9px] text-xs font-semibold"
        >
          {entry.label}
        </button>
      ))}

      <span aria-hidden className="bg-divider mx-[3px] h-[18px] w-px" />

      <button
        type="button"
        title={themeLabel}
        aria-label={themeLabel}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        className="text-fg-muted grid h-7 w-[30px] place-items-center rounded-[7px]"
      >
        {/* Moon in light, sun in dark — the design's `themeIcon`, which names
            the theme you would switch *to*. */}
        {dark ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

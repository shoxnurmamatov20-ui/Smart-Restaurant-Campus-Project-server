'use client';

import { useTheme } from '@/components/providers/theme-provider';

/**
 * Day and night, from the header — `dc.html:122-124`.
 *
 * The design puts this control beside the language switch on every screen of
 * the restaurant site and the build had it on none of them, although the label
 * for it (`site.nav.theme`) had been written in three languages. A restaurant's
 * menu is read at a table in the evening as often as at a desk at noon, and a
 * page that can only be white is a page that is read with a hand over it.
 *
 * A client island rather than a client header: the bar around it is a server
 * component carrying the copy catalogue and the branch list, and making the
 * whole thing hydrate for one button would put both into the browser bundle.
 *
 * The two glyphs are the design's own paths — a moon for "switch to dark" and a
 * sun for "switch back". They say what pressing does, not which theme is on:
 * the page already answers the second question by being the colour it is.
 */
export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      aria-pressed={dark}
      className="text-fg-muted grid size-10 flex-none place-items-center rounded-md"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        aria-hidden
      >
        {dark ? (
          <path d="M12 4v2m0 12v2M4 12H2m20 0h-2M6.3 6.3 4.9 4.9m14.2 1.4 1.4-1.4M6.3 17.7l-1.4 1.4m14.2-1.4 1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}

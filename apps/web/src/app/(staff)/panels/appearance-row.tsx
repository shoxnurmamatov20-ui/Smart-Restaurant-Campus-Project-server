'use client';

import { copy, SHARED } from '@restaurant/surfaces/crew/copy';
import type { Lang } from '@restaurant/surfaces/crew/data';

import { useTheme } from '@/components/providers/theme-provider';

/**
 * Day and night, on the one screen in this app that is about preferences.
 *
 * **Not from the design file, and worth saying why.** The staff mock does carry
 * a light/dark switch, but it sits in `[data-toolbar]` *outside*
 * `[data-phoneframe]` — the harness a designer flips while reviewing the mock,
 * beside a Pin/Lock view picker that is plainly not a screen of the app. So the
 * file does not draw this control for the product; it is here because the owner
 * asked for it, and it goes where this app keeps settings rather than where the
 * review harness keeps its own.
 *
 * A control rather than a `MORE` entry. Every row in that table is a destination
 * with an `href` and `more-fidelity.test.ts` holds it to that; a preference is
 * changed in place, and sending somebody to a screen to press one of three words
 * would be a navigation standing in for a control that fits on the line.
 *
 * Three options, not a toggle. With two there is no way back to the phone's own
 * setting once either is tapped — a one-way door on the screen whose whole job
 * is preferences.
 *
 * The provider is the app-wide one from the root layout, so the choice a waiter
 * makes here is the same choice the console and the restaurant site read. One
 * person, one phone, one preference.
 */
export function AppearanceRow({ lang }: { lang: Lang }) {
  const s = copy(SHARED, lang);
  const { theme, setTheme } = useTheme();

  const options = [
    ['light', s.themeLight],
    ['dark', s.themeDark],
    ['system', s.themeSystem],
  ] as const;

  return (
    <div className="border-divider flex flex-col gap-2.5 border-t py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{s.appearance}</p>
        <p className="text-fg-subtle text-2xs mt-0.5">{s.appearanceNote}</p>
      </div>

      {/* Stretched rather than trailing the label: three words and a label do
          not share 320px, and the note under the label is the half that would
          have been truncated away. */}
      <div className="bg-bg-muted flex gap-0.5 rounded-[9px] p-[3px]" role="group">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-seg
            data-active={theme === key ? 'true' : undefined}
            data-press
            aria-pressed={theme === key}
            onClick={() => setTheme(key)}
            className="text-fg-muted text-2xs h-[30px] min-w-0 flex-1 truncate rounded-[7px] px-2 font-semibold"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

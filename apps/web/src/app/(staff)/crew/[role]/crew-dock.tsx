'use client';

import Link from 'next/link';
import { useLocalePath } from '@/lib/use-locale-path';
import { Fragment } from 'react';

import { copy, SHARED } from '@restaurant/surfaces/crew/copy';
import { CrewGlyph } from '../../crew-icons';
import { badgeCount, say, tabsFor, type CrewRole, type Lang } from '@restaurant/surfaces/crew/data';

/**
 * The four-slot dock the whole app is navigated by.
 *
 * Four, and the role decides what is in them: a manager gets an approval queue
 * where a courier gets a route. Same bar, five products — which is the design's
 * central idea and the reason the role has to be known before anything else can
 * be drawn.
 *
 * Floating over the content rather than sitting under it, from the design: on a
 * 390px screen the last row of a two-up table grid is worth more than a
 * horizontal rule, and the gradient behind the buttons keeps them legible over
 * whatever they are covering. The scroll region reserves `--crew-dock` at the
 * bottom so nothing important ends up permanently underneath.
 *
 * `absolute` inside the shell rather than `fixed`. A fixed bar is positioned
 * against the viewport, so on a wide screen it would break out of the 390px
 * column and run the full width of the page — and it mispositions inside any
 * transformed ancestor, which the press animation makes one.
 *
 * **The search pill sits between the second and third slot** — the design's own
 * place for it, and the only slot in this bar that is not a tab. It was left out
 * for a long time on the grounds that the design's handler is a toast reading
 * "order, table, guest, item" and no endpoint answers all four; a box that
 * cannot search is worse than none, because people type into it and conclude the
 * app is broken. Two of those four now answer a partial word — `filter[search]`
 * on the menu, and one added to `tables` for this — so the pill leads to a
 * screen that searches those two and names its own reach under the field. The
 * other two are waiting on an endpoint rather than on a decision.
 *
 * **The labels under the discs went with it.** They were this file's own
 * addition, made when the pill was dropped and its width had to go somewhere;
 * the design's slots are bare 50px discs whose label lives in `aria-label` and
 * is never drawn. Keeping both would not fit — four discs, four captions and a
 * pill do not share 320px — and of the two it is the pill the design has.
 */
export function CrewDock({ role, lang }: { role: CrewRole; lang: Lang }) {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const tabs = tabsFor(role);
  const s = copy(SHARED, lang);

  return (
    <nav
      aria-label={s.mainMenu}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-start gap-1.5 px-3.5 pt-8"
      style={{
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(0deg, var(--surface) 34%, transparent)',
      }}
    >
      {tabs.map((tab, index) => {
        const href = `/crew/${role}/${tab.slug}`;
        const active = here === href;
        const count = tab.badge ? badgeCount(role, tab.badge) : 0;

        return (
          <Fragment key={tab.slug}>
            {/* After the second slot, which is where the design draws it. A dock
                with fewer than three slots never reaches this and keeps its
                shape rather than growing a pill in the wrong place. */}
            {index === 2 ? <SearchPill role={role} lang={lang} /> : null}

            <Link
              href={to(href)}
              data-press
              aria-label={say(tab.label, lang)}
              aria-current={active ? 'page' : undefined}
              className="pointer-events-auto flex-none"
            >
              <span
                /*
                 * 50px, comfortably over the 44px floor, because this is pressed
                 * with a thumb by somebody standing up and carrying something in
                 * the other hand.
                 */
                className={`relative grid size-[50px] place-items-center rounded-full border shadow-md ${
                  active
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-border bg-surface text-fg-muted'
                }`}
              >
                <CrewGlyph name={tab.icon} />

                {/*
                 * Hidden at zero rather than drawn as `0`. An always-present
                 * badge teaches a reader to stop looking at it, and this one is
                 * how a manager finds out a waiter is waiting on a discount.
                 */}
                {count > 0 ? (
                  <span
                    data-num
                    className="bg-danger-500 border-surface absolute -top-px -right-px grid h-[19px] min-w-[19px] place-items-center rounded-full border-[2.5px] px-1 text-[10px] leading-none font-bold text-white"
                  >
                    {count}
                  </span>
                ) : null}
              </span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}

/**
 * The dock's search pill.
 *
 * `flex-1 min-w-0`, so it takes whatever the four fixed discs leave and shrinks
 * rather than pushing the last one off a 320px screen — which is why the discs
 * beside it are `flex-none`. The label truncates; the magnifier never does,
 * which is the right order, because the icon is what makes the control
 * recognisable at a glance.
 */
function SearchPill({ role, lang }: { role: CrewRole; lang: Lang }) {
  const s = copy(SHARED, lang);
  // Its own, because it is its own component — the dock above cannot hand it
  // down without threading a prop through for one href.
  const { to } = useLocalePath();

  return (
    <Link
      href={to(`/crew/${role}/search`)}
      data-press
      /*
       * `@container` so the label can ask how wide the pill actually is. At
       * 320px the four discs leave it 68px, and a truncated "Qidirish" in that
       * is one clipped glyph — worse than no word. The query reads the
       * *content* box — the pill minus its 18px sides — so `96px` means a
       * 134px pill: the 390px phone shows the word, the 360px one does not,
       * and measured, that is where "Qidirish" at 14px stops fitting beside
       * the magnifier. Below it the icon stands alone; `aria-label` keeps the
       * name for the reader who cannot see it.
       */
      className="border-border bg-surface text-fg-subtle @container pointer-events-auto flex h-[50px] min-w-0 flex-1 items-center gap-[9px] rounded-full border px-[18px] shadow-md"
      aria-label={s.search}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden
        className="text-fg-muted flex-none"
      >
        <circle
          cx="10.8"
          cy="10.8"
          r="6.6"
          stroke="currentColor"
          strokeWidth="1.95"
          strokeLinecap="round"
        />
        <path d="m15.7 15.7 4 4" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" />
      </svg>

      <span className="hidden min-w-0 flex-1 truncate text-sm font-medium @min-[96px]:block">
        {s.search}
      </span>
    </Link>
  );
}

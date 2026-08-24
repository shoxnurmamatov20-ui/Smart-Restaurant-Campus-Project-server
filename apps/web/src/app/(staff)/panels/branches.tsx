import Link from 'next/link';

import { BRANCHES_COPY, copy } from '@restaurant/surfaces/crew/copy';
import { attainment, BRANCHES, type Lang } from '@restaurant/surfaces/crew/data';
import { Millions } from '../crew-money';

/**
 * Five branches, ranked by how close each is to the day it was asked for.
 *
 * The bar is attainment against the daily target, not against the best branch.
 * Ranking branches against each other rewards the biggest one for being big;
 * ranking each against its own target is the comparison an owner can act on —
 * Termiz turning over a fifth of Chilonzor is fine, Termiz at 76% of its own
 * plan for three days is not.
 *
 * **Colour is never the only signal.** The bar carries green, blue or amber and
 * the line under it states the percentage, so the same fact survives a
 * colour-blind reader and a phone in direct sun outside a restaurant — which is
 * where an owner actually reads this.
 *
 * The cards do not open anything. The design taps through to a branch detail
 * with an hourly breakdown and a recommendation; that screen is not built, and
 * a card that looks tappable and is not is a worse promise than one that never
 * offered.
 */
export function BranchesPanel({ lang, role }: { lang: Lang; role: string }) {
  const t = copy(BRANCHES_COPY, lang);

  return (
    <section>
      <p className="text-fg-muted mb-3.5 text-sm leading-normal">{t.intro}</p>

      <ul className="flex flex-col gap-2.5">
        {BRANCHES.map((branch, index) => {
          const pct = attainment(branch);
          const bar = pct >= 100 ? 'bg-success-500' : pct >= 85 ? 'bg-brand-500' : 'bg-warning-500';

          return (
            /*
             * A card, and it opens.
             *
             * These were inert `<li>` elements: an owner looking at five
             * branches could read a bar and had nowhere to go with it. The
             * design puts the whole branch behind a tap — target attainment,
             * orders, margin, headcount — and this is the entry to it.
             *
             * The index rides in the query string rather than the id, because
             * the detail screen reads the design's own branch list by position;
             * `more-fidelity.test.ts` checks the two lists are the same length.
             */
            <li key={branch.id}>
              <Link
                data-press
                href={`/crew/${role}/more/branch?i=${index}`}
                className="border-border bg-surface block rounded-[14px] border px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <h3 className="min-w-0 truncate text-sm font-semibold">{branch.name}</h3>
                  <span className="text-fg-subtle text-2xs flex-none">{branch.city}</span>
                </div>

                <div className="mt-1.5 flex items-baseline gap-3">
                  <Millions
                    tiyin={branch.revenue}
                    lang={lang}
                    className="font-display tracking-snug text-xl font-bold"
                  />
                  <span
                    data-num
                    className={`text-xs font-semibold ${branch.up ? 'text-success-600' : 'text-danger-600'}`}
                  >
                    {branch.delta}
                  </span>
                </div>

                {/*
                 * The bar is capped at 100 so a branch over plan does not draw
                 * past its own track, while the label below keeps the real
                 * figure — a branch at 105% has earned being told so.
                 */}
                <div className="bg-bg-muted mt-3 h-[3px] overflow-hidden rounded-sm">
                  <div
                    className={`h-[3px] rounded-sm ${bar}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <p data-num className="text-fg-subtle text-2xs mt-1.5">
                  {pct}% {t.ofTarget} ·{' '}
                  <Millions tiyin={branch.target} lang={lang} className="text-2xs" />
                </p>

                <dl className="border-divider text-2xs mt-3 flex gap-4 border-t pt-3">
                  <div className="flex gap-1">
                    <dt className="text-fg-subtle">{t.orders}</dt>
                    <dd data-num className="font-semibold">
                      {branch.orders}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-fg-subtle">{t.margin}</dt>
                    <dd data-num className="font-semibold">
                      {branch.margin}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-fg-subtle">{t.staff}</dt>
                    <dd data-num className="font-semibold">
                      {branch.staff}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

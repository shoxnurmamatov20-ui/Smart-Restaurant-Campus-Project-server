import { copy, TODAY as TODAY_COPY } from '@restaurant/surfaces/crew/copy';
import {
  CURRENCY_WORD,
  say,
  TODAY,
  type Kpi,
  type Lang,
  type TodayBoard,
  type Trilingual,
} from '@restaurant/surfaces/crew/data';
import { Millions, Som } from '../crew-money';
import { Note, SectionLabel } from './bits';

/** A KPI's value or delta may be a plain figure or a phrase that translates. */
function text(value: Trilingual | string, lang: Lang): string {
  return typeof value === 'string' ? value : say(value, lang);
}

/**
 * The first thing an owner or a manager opens the app to see.
 *
 * One component for both, because it is one screen with a different scope: the
 * owner's headline is five branches, the manager's is their own, and the list
 * underneath is branches for one and waiters for the other. Splitting it into
 * two would guarantee they drift — a KPI added to one and forgotten in the
 * other is how the same restaurant ends up reporting two average tickets.
 *
 * The revenue card is dark in both themes, which is the design and not a
 * dark-mode artefact: it is the one figure on the screen that everything else
 * is context for, and inverting it is what makes the rest read as context.
 *
 * **The figure includes VAT and the note says so.** VAT here is price-inclusive
 * and never added at the till, so revenue is `total / 1.12` while cash turnover
 * is `total` — and a screen that shows one while a report shows the other, with
 * nothing to say which is which, is how an owner concludes the system is
 * lying. The line under the number is the whole defence.
 */
export function TodayPanel({
  lang,
  role,
  board = TODAY[role],
  live = false,
}: {
  lang: Lang;
  role: 'owner' | 'manager';
  /**
   * Today, as `crew-server.ts` read it — or the design's own day.
   *
   * This panel used to render `TODAY[role]` unconditionally and take no `live`
   * flag at all, unlike the two sibling panels on the same route. So the first
   * screen an owner opened in the staff app was a complete fabricated trading
   * day, in the app they check between meetings, with nothing to say it was a
   * sample.
   */
  board?: TodayBoard;
  live?: boolean;
}) {
  const t = copy(TODAY_COPY, lang);

  return (
    <section>
      <div className="overflow-hidden rounded-[20px] bg-[var(--crew-hero-bg)] px-5 pt-5">
        <div className="flex items-start justify-between gap-2.5">
          <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--crew-hero-dim)]">
            {say(board.revenueLabel, lang)}
          </p>
          <span
            data-num
            className="text-2xs flex flex-none items-center gap-1 rounded-full px-2 py-1 leading-none font-bold text-[var(--crew-hero-up)]"
            style={{ background: 'var(--crew-hero-chip)' }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 10V2.6" />
              <path d="M2.6 6 6 2.6 9.4 6" />
            </svg>
            {board.delta}
          </span>
        </div>

        <p className="font-display mt-2.5 text-[38px] leading-none font-bold tracking-tight text-[var(--crew-hero-fg)]">
          <Som tiyin={board.revenue} lang={lang} unit={false} />
        </p>
        {/*
         * The currency word lives here rather than beside the figure, which is
         * where the design puts it: at 38px a unit set alongside competes with
         * the number, and the number is the only thing this card exists to say.
         * It also has to be painted in the hero's own dim rather than
         * `--fg-subtle` — that grey is chosen against white and would be
         * unreadable on this near-black card.
         */}
        <p className="text-2xs mt-1.5 text-[var(--crew-hero-dim)]">
          {say(CURRENCY_WORD, lang)} · {say(board.revenueNote, lang)}
        </p>

        {/*
         * The sparkline is decoration with a job: it says whether today is
         * shaped like a normal day. It carries no axis and no labels, so it is
         * `aria-hidden` and the figures above it are the accessible version —
         * a screen reader reading twelve unlabelled coordinates learns nothing.
         *
         * `preserveAspectRatio="none"` lets it stretch the full width of the
         * card at a fixed 60px height, which is what makes it read as a
         * horizon rather than a chart.
         */}
        <svg
          viewBox="0 0 300 74"
          preserveAspectRatio="none"
          aria-hidden
          className="mt-3.5 -mb-px block h-[60px] w-[calc(100%+40px)] -translate-x-5"
        >
          <defs>
            <linearGradient id="crew-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--crew-hero-spark)" stopOpacity=".34" />
              <stop offset="1" stopColor="var(--crew-hero-spark)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M${board.spark.replace(/ /g, ' L')} L300,74 L0,74 Z`} fill="url(#crew-spark)" />
          <polyline
            points={board.spark}
            fill="none"
            stroke="var(--crew-hero-spark)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2.5">
        {board.kpis.map((kpi) => (
          <KpiTile key={say(kpi.label, 'en')} kpi={kpi} lang={lang} />
        ))}
      </dl>

      <SectionLabel>{say(board.listLabel, lang)}</SectionLabel>

      <ul>
        {board.list.map((row, index) => (
          <li
            key={row.name}
            className="border-divider flex items-center gap-3 border-b py-2.5 last:border-b-0"
          >
            <span
              className={`grid size-8 flex-none place-items-center rounded-full text-[11px] font-bold ${
                /* The leader gets the brand tint. One row, so it reads as a
                   position rather than as a category. */
                index === 0 ? 'bg-brand-100 text-brand-700' : 'bg-bg-muted text-fg-muted'
              }`}
            >
              {row.initials}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
            <span className="flex flex-none flex-col items-end gap-px">
              <Millions tiyin={row.revenue} lang={lang} className="text-sm font-semibold" />
              <span className="text-fg-subtle text-[10px] font-semibold">
                {say(row.note, lang)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {live ? null : <Note>{t.demoBoard}</Note>}
      <Note>{t.vatNote}</Note>
    </section>
  );
}

function KpiTile({ kpi, lang }: { kpi: Kpi; lang: Lang }) {
  const tone =
    kpi.tone === 'up'
      ? 'text-success-600'
      : kpi.tone === 'down'
        ? 'text-danger-600'
        : 'text-fg-subtle';

  return (
    <div className="bg-bg-subtle rounded-[14px] px-4 py-3.5">
      <dt className="text-fg-subtle text-2xs truncate">{say(kpi.label, lang)}</dt>
      <dd className="font-display tracking-snug mt-1 text-xl font-bold" data-num>
        {text(kpi.value, lang)}
      </dd>
      <p className={`mt-0.5 text-[10px] font-semibold ${tone}`} data-num>
        {text(kpi.delta, lang)}
      </p>
    </div>
  );
}

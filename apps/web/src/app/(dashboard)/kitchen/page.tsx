import { getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../module-page';
import {
  ageTone,
  COLUMNS,
  KITCHEN_SUMMARY,
  STATIONS,
  STOPPABLE,
  getTickets,
  type Ticket,
} from './kds-data';

export const generateMetadata = () => moduleMetadata('kitchen');

type Dict = Awaited<ReturnType<typeof getTranslations<'console.kitchen'>>>;

/**
 * The kitchen display.
 *
 * Built to the design's KDS: five columns, one per state, tickets moving left
 * to right, and a 48px button on each so it can be hit with the back of a hand.
 * The station filter and the stop list sit above, because both are things a
 * chef reaches for mid-service without leaving the board.
 *
 * Everything here is sized for a wall screen read from two metres: 17px dish
 * names, a 20px timer, a whole ticket's border turning red at ten minutes. The
 * design draws this surface in dark and it stays dark whatever the console's
 * theme — a bright screen over a hot line is a screen nobody looks at.
 *
 * TODO — Phase 1 · kitchen, once the module is built:
 *   - Reverb, so a ticket lands the moment the waiter sends it
 *   - Bump and recall, and who bumped what
 *   - The stop list writing through to the POS and the QR menu
 *   - Per-station routing from the recipe card
 *   - Cook times measured rather than assumed
 */
export default async function KitchenPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.kitchen'),
  ]);

  // The API when there is a session, the fixtures when there is not. No
  // station filter here: this is the pass, where the chef watches all five.
  const board = await getTickets();

  return (
    /*
     * Dark, on its own, regardless of the console's theme.
     *
     * `[data-theme='dark']` re-declares the token layer for this subtree, the
     * same mechanism the marketing site uses to force light. Without it the
     * board would follow the office's preference, which is not the room this
     * screen lives in.
     */
    <div data-theme="dark" className="bg-bg-subtle text-fg -mx-8 -mt-7 -mb-12 min-h-screen">
      <header className="bg-surface flex h-[68px] flex-none items-center gap-5 border-b px-6">
        <div>
          <div className="font-display tracking-snug text-xl leading-[1.1] font-semibold">
            {nav('kitchen')}
          </div>
          <div className="text-fg-subtle mt-[3px] text-xs">{t('subtitle')}</div>
        </div>

        <div data-kdsstats className="ml-8 flex gap-7">
          {[
            { label: t('openTickets'), value: String(KITCHEN_SUMMARY.open) },
            { label: t('avgCook'), value: KITCHEN_SUMMARY.averageCook },
            {
              label: t('longestWait'),
              value: KITCHEN_SUMMARY.longestWait,
              tone: 'text-warning-500',
            },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-fg-subtle text-2xs tracking-caps uppercase">{stat.label}</div>
              <div
                data-num
                className={`font-display mt-[3px] text-xl font-semibold ${stat.tone ?? ''}`}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-fg-muted flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm">
            <span aria-hidden className="bg-success-500 rounded-pill size-[7px]" />
            {t('live')}
          </span>
          <span data-num className="font-display tracking-snug text-xl font-semibold">
            11:24
          </span>
        </div>
      </header>

      <div className="bg-surface flex flex-none flex-wrap items-center gap-3.5 border-b px-6 py-3">
        <div className="bg-bg-muted flex gap-0.5 rounded-md p-[3px]">
          {STATIONS.map((station, index) => (
            <button
              key={station}
              type="button"
              data-seg
              data-active={index === 0 ? 'true' : undefined}
              className="text-fg-muted h-[34px] rounded-[7px] border-0 bg-transparent px-[15px] text-sm font-semibold"
            >
              {t(station)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="border-warning-500 bg-warning-50 text-warning-700 ml-auto flex h-10 items-center gap-[9px] rounded-md border px-4 text-sm font-semibold"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M8.5 8.5l7 7" />
          </svg>
          {t('stopList')}
          <span
            data-num
            className="bg-warning-500 rounded-pill text-2xs grid h-5 min-w-5 place-items-center px-[5px] font-bold text-white"
          >
            {STOPPABLE.filter((item) => item.off).length}
          </span>
        </button>
      </div>

      <div data-scroll className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-5 pt-4 pb-6">
        {COLUMNS.map((column, index) => {
          const tickets = board.filter((ticket) => ticket.state === column.state);

          return (
            <section
              key={column.state}
              data-kdscol
              className="flex min-w-[288px] flex-1 flex-col gap-3"
            >
              <div
                className="flex items-center gap-2.5 border-b-2 px-1 pb-2"
                style={{ borderColor: column.accent }}
              >
                <span className="text-sm font-semibold tracking-wide uppercase">
                  {t(column.state)}
                </span>
                <span
                  data-num
                  className="bg-bg-muted text-fg-muted rounded-pill px-2 py-0.5 text-xs font-semibold"
                >
                  {tickets.length}
                </span>
              </div>

              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  accent={column.accent}
                  action={t(column.action)}
                  final={index === COLUMNS.length - 1}
                  ready={index >= 3}
                  t={t}
                />
              ))}

              {tickets.length === 0 ? (
                <div className="text-fg-subtle rounded-md border border-dashed px-4 py-7 text-center text-xs">
                  {t('empty')}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One ticket.
 *
 * The quantity leads in brand colour and the dish follows at 15px semibold,
 * because from two metres the number is what a chef reads first. A note sits
 * under its own line in amber — it is the thing that gets missed.
 */
function TicketCard({
  ticket,
  accent,
  action,
  final,
  ready,
  t,
}: {
  ticket: Ticket;
  accent: string;
  action: string;
  final: boolean;
  ready: boolean;
  t: Dict;
}) {
  const tone = ageTone(ticket.minutes);

  return (
    <article
      className={`bg-surface flex flex-col gap-3 rounded-md border p-4 ${tone.border}`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="font-display tracking-snug text-lg font-semibold">{ticket.table}</div>
          <div className="text-fg-subtle mt-[3px] font-mono text-xs">
            {ticket.id} · {ticket.waiter}
          </div>
        </div>

        <div className="text-right">
          <div data-num className={`font-display tracking-snug text-xl font-semibold ${tone.text}`}>
            {ticket.age}
          </div>
          <div className="text-fg-subtle text-2xs mt-0.5">
            {ready ? t('ageSinceReady') : t('ageInKitchen')}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {ticket.lines.map((line) => (
          <div key={line.name} className="flex items-baseline gap-2.5">
            <span data-num className="text-fg-brand text-md min-w-6 font-bold">
              ×{line.quantity}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-md block leading-[1.3] font-semibold">{line.name}</span>
              {line.note ? (
                <span className="text-warning-700 mt-[3px] block text-xs">{t(line.note)}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {/* 48px, because this is pressed with the back of a hand. */}
      <button
        type="button"
        className={`flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold ${
          final
            ? 'text-fg-muted border-border bg-transparent'
            : ready
              ? 'bg-success-500 border-transparent text-white'
              : 'bg-brand-500 border-transparent text-white'
        }`}
      >
        {action}
      </button>
    </article>
  );
}

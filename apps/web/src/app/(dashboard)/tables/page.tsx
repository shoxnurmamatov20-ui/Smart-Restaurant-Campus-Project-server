import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import {
  isOccupied,
  TABLE_STATUS,
  TABLE_STATUSES,
  type Table,
  type TableStatus,
} from './tables-data';
import { getFloor } from './tables-server';

export const generateMetadata = () => moduleMetadata('tables');

type Dict = Awaited<ReturnType<typeof getTranslations<'console.floor'>>>;

/**
 * The floor.
 *
 * Built to the design's Tables screen: a legend of five states across the top,
 * then the plan itself — zones separated by a ruled caption, tables on a
 * `minmax(126px,1fr)` grid — and a 340px panel beside it that fills in when a
 * table is picked.
 *
 * Rendered here with nothing selected, which is the state the design draws for
 * an untouched screen and the state a host actually opens it in. Picking a
 * table is a client concern; the panel below is the empty half of that pair,
 * written so wiring the selection in is a change of state rather than of shape.
 *
 * A server component; getFloor() is the seam: rooms with their tables.
 *
 * TODO — Phase 1 · tables, once the module is built:
 *   - Live occupancy over Reverb, so two hosts cannot seat the same table
 *   - Reservations: create, confirm, remind
 *   - The waitlist
 *   - Per-table QR codes, generated and printed
 *   - Banquet and event holds
 */
const QUIET =
  'bg-surface hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-medium whitespace-nowrap';

export default async function TablesPage() {
  const [t, common, locale] = await Promise.all([
    getTranslations('console.floor'),
    getTranslations('console.common'),
    getLocale(),
  ]);

  // The API when there is a session, the fixtures when there is not. Rooms
  // arrive with their tables already in them — see getFloor().
  const zones = await getFloor(t, locale);
  const floor = zones.flatMap((zone) => zone.tables);

  return (
    <>
      <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{t('subtitle')}</p>
        </div>

        <div data-pageactions className="flex flex-none gap-2.5">
          <button type="button" className={QUIET}>
            {t('reservations')}
          </button>
          <button type="button" className={QUIET}>
            {t('editLayout')}
          </button>
        </div>
      </div>

      {/* The legend doubles as a tally — how many tables are in each state. */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABLE_STATUSES.map((status) => (
          <span
            key={status}
            className="bg-surface text-fg-muted rounded-pill inline-flex h-[30px] items-center gap-2 border px-3 text-xs font-medium"
          >
            <span
              aria-hidden
              className="size-2 rounded-[2px]"
              style={{ background: TABLE_STATUS[status].dot }}
            />
            {t(statusKey(status))}
            <span data-num className="text-fg-subtle">
              {floor.filter((table) => table.status === status).length}
            </span>
          </span>
        ))}
      </div>

      <div
        data-split
        className="grid [grid-template-columns:minmax(0,1fr)_340px] items-start gap-5"
      >
        <div className="bg-surface rounded-lg border p-6">
          {zones.map((zone) => {
            const tables = zone.tables;
            const busy = tables.filter(isOccupied).length;

            return (
              <div key={zone.key} className="mb-7 last:mb-0">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-fg-subtle tracking-caps text-xs font-semibold uppercase">
                    {zone.label}
                  </span>
                  <span aria-hidden className="bg-divider h-px flex-1" />
                  <span data-num className="text-fg-subtle text-xs">
                    {t('zoneMeta', { total: tables.length, busy })}
                  </span>
                </div>

                <div className="grid [grid-template-columns:repeat(auto-fill,minmax(126px,1fr))] gap-3">
                  {tables.map((table) => (
                    <TableTile key={table.name} table={table} t={t} common={common} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <aside
          data-sticky
          className="bg-surface sticky top-0 rounded-lg border px-8 py-14 text-center"
        >
          <div className="text-fg-disabled mx-auto mb-4 grid size-11 place-items-center rounded-md border">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </svg>
          </div>
          <div className="text-sm font-semibold">{t('emptyTitle')}</div>
          <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{t('emptyBody')}</p>
        </aside>
      </div>
    </>
  );
}

/**
 * One table.
 *
 * The bottom line changes with the state, which is what makes the plan worth
 * looking at: an occupied table shows its covers and its running bill, a held
 * one shows who is coming and when, a free one just its size.
 */
function TableTile({ table, t, common }: { table: Table; t: Dict; common: Dict }) {
  const style = TABLE_STATUS[table.status];

  const meta = isOccupied(table)
    ? `${table.guests} ${common('guests')} · ${formatTiyinAmount(table.bill ?? 0)}`
    : table.status === 'reserved'
      ? table.reservation
      : table.status === 'cleaning'
        ? t('cleaningMeta')
        : `${table.seats} ${common('seats')}`;

  return (
    <button
      type="button"
      data-tile
      className={`flex min-h-[104px] flex-col gap-2.5 rounded-md border p-3.5 text-left ${style.tile}`}
    >
      <span className="flex items-center justify-between">
        <span className="font-display tracking-snug text-lg font-semibold">{table.name}</span>
        <span aria-hidden style={{ color: style.dot }}>
          {style.glyph}
        </span>
      </span>

      <span className={`text-2xs block font-semibold tracking-wide uppercase ${style.label}`}>
        {t(statusKey(table.status))}
      </span>

      <span className="text-fg-subtle mt-auto block text-xs">{meta}</span>
    </button>
  );
}

/** The catalogue key for a status — `free` is written `statusFree`. */
function statusKey(status: TableStatus) {
  const keys = {
    free: 'statusFree',
    seated: 'statusSeated',
    reserved: 'statusReserved',
    cleaning: 'statusCleaning',
    to_pay: 'statusToPay',
  } as const;

  return keys[status];
}

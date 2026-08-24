import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { realtimeConfig } from '@/lib/realtime-server';
import { getSession } from '@/lib/session';

import { moduleMetadata } from '../module-page';
import {
  isOccupied,
  TABLE_STATUS,
  TABLE_STATUSES,
  type Table,
  type TableStatus,
} from './tables-data';
import { FloorBoard } from './floor-board';
import { LayoutEditor } from './layout-editor';
import { floorFacts, getFloor, getFloorPlan } from './tables-server';

export const generateMetadata = () => moduleMetadata('tables');

type Dict = Awaited<ReturnType<typeof getTranslations<'console.floor'>>>;

/**
 * The floor.
 *
 * Built to the design's Tables screen: a legend of five states across the top,
 * then the plan itself — zones separated by a ruled caption, tables on a
 * `minmax(min(126px,100%),1fr)` grid — and a 340px panel beside it that fills
 * in when a table is picked.
 *
 * Rendered here with nothing selected, which is the state the design draws for
 * an untouched screen and the state a host actually opens it in. Picking a
 * table is a client concern; the panel below is the empty half of that pair,
 * written so wiring the selection in is a change of state rather than of shape.
 *
 * A server component; getFloor() is the seam: rooms with their tables.
 *
 * Live occupancy arrives over Reverb — `branch.{id}.floor`, the channel the
 * console, the door and every handset in one building share. Two hosts cannot
 * seat the same table any more, because the second one watches the first do it.
 *
 * TODO — Phase 1 · tables:
 *   - Reservations: confirming and reminding. Taking one is on the panel now,
 *     against `POST /tables/reservations` with the tile's own table id; the
 *     other two belong to a diary screen that does not exist, because the
 *     design routes "bronlar" at the rota.
 *   - The waitlist
 *   - Banquet and event holds
 */
const QUIET =
  'bg-surface hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-medium whitespace-nowrap';

export default async function TablesPage() {
  const [t, common, locale, session] = await Promise.all([
    getTranslations('console.floor'),
    getTranslations('console.common'),
    getLocale(),
    getSession(),
  ]);

  // The API when there is a session, the fixtures when there is not. Rooms
  // arrive with their tables already in them — see getFloor().
  /*
   * The board's state and the room's furniture, side by side.
   *
   * Two reads rather than one: the board is redrawn off a realtime channel
   * every few seconds, and hall ids and positions have no business riding along
   * on every nudge. `null` from the second is the demo console, and the layout
   * button is then not offered rather than offered and refused.
   */
  const [plan, rooms] = await Promise.all([getFloor(t, locale), getFloorPlan(locale)]);
  const { zones, branchId, tableIds, orderIds } = plan;

  /*
   * The line under the title, counted rather than recited.
   *
   * The catalogue's sentence claimed "32 tables · 14 seated" directly above a
   * legend that counts the real ones — the source of the "32 of 32 tables
   * seated" report from a restaurant whose plan was empty.
   */
  const facts = floorFacts(plan, session.placeName);
  const subtitle = facts === null ? t('subtitle') : t('subtitleLive', facts);

  /* Every open bill the panel can show, formatted here — the locale is here. */
  const amounts = Object.fromEntries(
    zones.flatMap((zone) =>
      zone.tables
        .filter((table) => table.bill !== undefined)
        .map((table) => [`bill_${table.name}`, formatTiyinAmount(table.bill ?? 0)]),
    ),
  );
  const floor = zones.flatMap((zone) => zone.tables);

  return (
    <>
      <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
        </div>

        <div data-pageactions className="flex flex-none gap-2.5">
          {/* `goResv` in the design opens the rota screen with its booking form
              already unfolded — the bookings live there, not on a second list. */}
          <Link href="/staff/shifts" className={`${QUIET} grid place-items-center`}>
            {t('reservations')}
          </Link>
          {/*
            The design's "edit layout" button, and it opens one now. A list
            rather than a canvas — see ./layout-editor.tsx: the design's plan is
            a wrapping grid of equal tiles, so a table needs a place in its room
            rather than an (x, y). Offered only when the rooms came from the
            API, because every move is addressed by a table id.
          */}
          {rooms === null ? null : (
            <LayoutEditor
              plan={rooms}
              labels={{
                open: t('editLayout'),
                close: t('editLayoutClose'),
                title: t('layoutTitle'),
                hint: t('layoutHint'),
                room: t('layoutRoom'),
                empty: t('layoutEmpty'),
                up: t('layoutUp'),
                down: t('layoutDown'),
                saved: t('layoutSaved'),
                failed: t('layoutFailed'),
              }}
            />
          )}
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

      <FloorBoard
        zones={zones}
        money={amounts}
        branchId={branchId}
        tableIds={tableIds}
        orderIds={orderIds}
        realtimeConfig={realtimeConfig()}
        labels={{
          zoneMeta: t.raw('zoneMeta') as string,
          emptyTitle: t('emptyTitle'),
          emptyBody: t('emptyBody'),
          seats: t.raw('seatsOf') as string,
          guests: common('guests'),
          since: t('since'),
          waiter: t('waiter'),
          reservation: t('reservation'),
          bill: t('bill'),
          close: common('close'),
          actionsNote: t('actionsNote'),
          qrPrint: t('qrPrint'),
          qrFailed: t('qrFailed'),
          /* The panel's two forms and the one button that deliberately has no
             endpoint behind it — see `floor-board.tsx`. */
          bookGuest: t('bookGuest'),
          bookPhone: t('bookPhone'),
          bookGuests: t('bookGuests'),
          bookTime: t('bookTime'),
          bookSave: t('bookSave'),
          needGuest: t('needGuest'),
          needPhone: t('needPhone'),
          needTime: t('needTime'),
          moveTo: t('moveTo'),
          moveSave: t('moveSave'),
          needTable: t('needTable'),
          noBill: t('noBill'),
          billAtTill: t('billAtTill'),
          formCancel: t('formCancel'),
          ...Object.fromEntries(
            (['seat', 'bill', 'transfer', 'reserve', 'clean'] as const).map((action) => [
              `action_${action}`,
              t(`action_${action}`),
            ]),
          ),
          ...Object.fromEntries(
            TABLE_STATUSES.map((status) => [`status_${status}`, t(statusKey(status))]),
          ),
          ...Object.fromEntries(
            zones.flatMap((zone) =>
              zone.tables.map((table) => [`meta_${table.name}`, metaFor(table, t, common)]),
            ),
          ),
        }}
      />
    </>
  );
}

function metaFor(table: Table, t: Dict, common: Dict): string {
  if (isOccupied(table) && table.guests !== undefined) {
    return `${table.guests} ${common('guests')} · ${formatTiyinAmount(table.bill ?? 0)}`;
  }

  if (table.status === 'reserved' && table.reservation !== undefined) return table.reservation;

  /*
   * A table being cleaned used to read "~4 daqiqada tayyor". Nothing measures
   * that: no row records when the tile entered `cleaning` and no setting holds
   * a turn time, so the figure was invented and a host repeated it to a
   * waiting guest. The seat count below is what the tile can honestly say.
   */

  return `${table.seats} ${common('seats')}`;
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

'use client';

import { flash } from '@restaurant/ui';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

import { post } from '@/lib/console-post';
import { adopt, usePollWhileOffline } from '@/lib/live-fallback';
import { realtime } from '@/lib/realtime';
import type { RealtimeConfig } from '@/lib/realtime-server';

// The rota's diary and this panel take the same booking, so they settle the day
// the same way: a time that has already gone today means tomorrow. Two copies
// of that rule is one diary filing tonight and the other filing yesterday.
import { bookingStartsAt } from '../staff/shifts/shift-blocks';
import { isOccupied, TABLE_STATUS, type Table, type TableStatus } from './tables-data';
import { TABLE_STATE, type TableChanged } from './tables-live';

/** A room with its tables, as the board holds them. */
type Zone = { key: string; label: string; tables: readonly Table[] };

/**
 * The board with one square recoloured.
 *
 * Matched by label rather than by id, because `Table` is the design's shape and
 * carries no id — which is also why the broadcast carries the label. Shared by
 * the socket and by this screen's own writes so the two cannot repaint
 * differently: a table that turns green when somebody else clears it and stays
 * amber when *you* do is a floor plan nobody trusts.
 */
const recolour = (zones: readonly Zone[], label: string, status: TableStatus): Zone[] =>
  zones.map((zone) => ({
    ...zone,
    tables: zone.tables.map((table) => (table.name === label ? { ...table, status } : table)),
  }));

/**
 * The floor, and the panel a table opens.
 *
 * The tiles were `<button>`s with no handler and the 340px panel beside them
 * was permanently in its empty state — the design's "nothing selected" drawing
 * shipped as the only state there was. `specs/01-os.md §5.4` puts the whole of
 * a table behind a tap: who is on it, since when, what they owe, and the five
 * things a host does next.
 *
 * **Tapping the selected table clears it.** A panel with no way out of it is a
 * panel a host escapes by reloading, and on a floor screen that costs the whole
 * room's state.
 *
 * The empty state stays and is still the design's, because it is what a host
 * sees most of the evening.
 */
export function FloorBoard({
  zones,
  labels,
  money,
  branchId = null,
  tableIds = {},
  orderIds = {},
  realtimeConfig = null,
}: {
  /*
   * `key` is a plain string, not a `ZoneKey`. The fixtures use the three
   * catalogue keys; the API sends a hall's own id, and a restaurant names its
   * rooms whatever it likes. `tables-server.ts` resolves the label either way,
   * so this only needs something stable to key a list by.
   */
  zones: readonly { key: string; label: string; tables: readonly Table[] }[];
  labels: Record<string, string>;
  /** Every bill the panel can show, formatted on the server. */
  money: Readonly<Record<string, string>>;
  /** Which room's channel to listen on. Null leaves the board still. */
  branchId?: number | null;
  /** Table label → row id, for the QR endpoint. Empty on fixtures. */
  tableIds?: Readonly<Record<string, number>>;
  /** Table label → the bill running on it. A transfer moves that, not the table. */
  orderIds?: Readonly<Record<string, number>>;
  realtimeConfig?: RealtimeConfig | null;
}) {
  const [selected, setSelected] = useState<Table | null>(null);
  /*
   * The floor as it is *now*, not as it was when this page rendered.
   *
   * A floor plan is the one screen in a restaurant more than one person reads
   * at the same moment — the console on the desk, a host at the door, two
   * waiters on handsets — and the one who did not do the tapping is the one who
   * walks a second party to an occupied table. `props.zones` is the first
   * paint; the socket is every paint after it.
   *
   * Seeded once and never re-synced from the prop, the same way the kitchen
   * display holds its dockets: a re-sync would be a second source of truth for
   * the same squares, and the two would disagree for exactly as long as a
   * server render takes to arrive.
   */
  const [live, setLive] = useState<readonly Zone[]>(zones);
  /* A fresh `zones` after the poll's `router.refresh()` replaces what events built. */
  const [seenZones, setSeenZones] = useState(zones);
  adopt(zones, seenZones, setSeenZones, setLive);
  /** True while a status write is in flight — the panel's buttons wait for it. */
  const [busy, setBusy] = useState(false);
  /**
   * Which of the panel's two forms is open, if either.
   *
   * The design draws five verbs and no fields, because a drawing does not have
   * to ask a guest's name. Two of the five need answers a floor tile cannot
   * supply on its own, so the button opens the smallest form that can supply
   * them rather than firing a request that would be refused.
   */
  const [form, setForm] = useState<'reserve' | 'transfer' | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [party, setParty] = useState('2');
  const [at, setAt] = useState('19:00');
  /** The destination table's label, for a transfer. */
  const [target, setTarget] = useState('');
  const router = useRouter();
  const lang = useLocale() as 'uz' | 'ru' | 'en';

  /** Open a table's panel, closing whatever form the last one had unfolded. */
  function open(table: Table | null) {
    setSelected(table);
    setForm(null);
    setTarget('');
  }

  /* Fifteen seconds: a table turning is a minutes-long event, not a seconds-long one. */
  usePollWhileOffline(realtimeConfig, 15_000);

  useEffect(() => {
    if (branchId === null) return;

    const echo = realtime(realtimeConfig);

    if (echo === null) return;

    const room = `branch.${branchId}.floor`;

    echo.private(room).listen('.tables.table.changed', (event: TableChanged) => {
      /*
       * The event carries the label rather than only an id, because a handset
       * that joined late has no floor plan to look an id up in — "A-7 went
       * green" is the whole message. `recolour` matches on it.
       */
      const status: TableStatus = TABLE_STATE[event.to] ?? 'free';

      setLive((current) => recolour(current, event.label, status));

      // The open panel is a copy, so it would otherwise keep showing the state
      // the table was in when somebody tapped it.
      setSelected((current) =>
        current !== null && current.name === event.label ? { ...current, status } : current,
      );
    });

    return () => {
      // Left, not disconnected: the connection is shared with whatever else
      // this tab has open.
      echo.leave(room);
    };
  }, [branchId, realtimeConfig]);

  const ACTIONS = ['seat', 'bill', 'transfer', 'reserve', 'clean'] as const;

  /**
   * The two verbs that move the floor plan itself.
   *
   * `seat` colours the square occupied and `clean` takes it out of service —
   * both are facts about the room, which is what this screen is the authority
   * on. The bill is not: opening one, closing one and moving it are things a
   * person does at a till after signing in with a PIN, and every route under
   * `/pos/bills` refuses a back-office token by design.
   *
   * `clean` reads both ways because the design lists it for both states, and
   * the catalogue has both words for it: a table in use is *put up* for
   * cleaning, and one already being cleaned is finished by the same button.
   *
   * Repainted here as well as by the socket. The broadcast is what tells
   * everybody else; this is what tells the person who pressed it, on a console
   * with no broadcaster configured or a socket that has not reconnected yet.
   */
  async function move(action: 'seat' | 'clean') {
    if (selected === null || busy) return;

    const id = tableIds[selected.name];

    // A fixture floor. There is no row to move, and saying so is better than a
    // square that changes colour and is back where it was on the next render.
    if (id === undefined) {
      flash.problem(`${selected.name} · ${labels[`action_${action}`] ?? action}`);

      return;
    }

    const status =
      action === 'seat' ? 'occupied' : selected.status === 'cleaning' ? 'free' : 'cleaning';

    setBusy(true);

    const answer = await post<unknown>('/api/tables/status', { tableId: id, status }, lang);

    setBusy(false);

    if (!answer.ok) {
      // The API's own sentence when it sent one — it is in the reader's
      // language and it says which rule refused, which no toast here could.
      flash.problem(answer.message ?? `${selected.name} · ${labels[`action_${action}`] ?? action}`);

      return;
    }

    const painted: TableStatus = TABLE_STATE[status] ?? 'free';

    setLive((current) => recolour(current, selected.name, painted));
    // The open panel is a copy of the tile, so it would otherwise keep showing
    // the state the table was in when it was tapped.
    setSelected((current) => (current === null ? null : { ...current, status: painted }));

    flash(`${selected.name} · ${labels[`action_${action}`] ?? action}`);
  }

  /**
   * A booking on this table, taken at the door.
   *
   * `POST /api/v1/tables/reservations` has existed all along and the panel had
   * no form for it — a floor tile knows which table and nothing else, and a
   * booking is a guest, a number to ring, a party size and a time. Those four
   * are what this asks for, and they are exactly what
   * `StoreReservationRequest` requires.
   *
   * `restaurant_table_id` goes with them, which is the one thing this screen
   * can say that the rota's diary cannot: there the table is a typed label and
   * labels repeat across halls, so it travels in the note. Here the tile IS the
   * table and carries its row id.
   *
   * `status` and `source` are the route handler's, never this form's — see
   * `api/tables/reservations/route.ts`. A console that could write `confirmed`
   * would be a console that holds a table without anybody agreeing to it, and
   * the source it stamps is `phone`, which is what a staff-taken booking is on
   * this platform whether the host is holding a handset or standing at the door.
   */
  async function reserve() {
    if (selected === null || busy) return;

    const id = tableIds[selected.name];

    // A fixture floor. There is no table row to book against, and saying so
    // beats a line that appears in a diary nobody can open.
    if (id === undefined) {
      flash.problem(`${selected.name} · ${labels.action_reserve}`);

      return;
    }

    if (guestName.trim() === '') {
      flash.problem(labels.needGuest);

      return;
    }

    /* Nine digits, a full Uzbek subscriber number. A booking with no way to
       reach the guest is a table held for nobody — the rota's diary checks the
       same thing for the same reason. */
    if (guestPhone.replace(/\D/g, '').length < 9) {
      flash.problem(labels.needPhone);

      return;
    }

    const startsAt = bookingStartsAt(at, new Date());

    if (startsAt === null) {
      flash.problem(labels.needTime);

      return;
    }

    const seats = Number.parseInt(party.trim() === '' ? '2' : party.trim(), 10);

    setBusy(true);

    const answer = await post<unknown>(
      '/api/tables/reservations',
      {
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guests: Number.isFinite(seats) && seats > 0 ? seats : 2,
        startsAt,
        tableId: id,
      },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? `${selected.name} · ${labels.action_reserve}`);

      return;
    }

    /*
     * Painted held only when the booking is for today.
     *
     * `getFloor()` reads the diary a day at a time — `filter[day]` — so a
     * booking rolled to tomorrow is not in the render this square would be
     * corrected by, and a tile that turns amber and is back to green on the
     * next paint is a floor plan nobody trusts.
     */
    if (new Date(startsAt).toDateString() === new Date().toDateString()) {
      const held = `${at} · ${guestName.trim()}, ${seats}`;

      setLive((current) => recolour(current, selected.name, 'reserved'));
      setSelected((current) =>
        current === null ? null : { ...current, status: 'reserved', reservation: held },
      );
    }

    setForm(null);
    setGuestName('');
    setGuestPhone('');
    flash(`${selected.name} · ${labels.action_reserve}`);
  }

  /**
   * Move the bill to another table.
   *
   * `POST /api/v1/orders/orders/{id}/transfer` — an Orders endpoint rather than
   * a proxy at the till, which is what the panel's own note used to say was
   * missing: every route under `/pos/bills` sits behind `RequireTerminalSession`
   * and refuses a console token on purpose. `BillActionController` is the same
   * operation asked by a different person, under `orders.manage`, which no
   * waiter or cashier holds.
   *
   * It moves the BILL, not the furniture, which is why the destination is sent
   * as a table id and the source is not sent at all — and why a table with
   * nothing running on it has no transfer button.
   */
  async function moveBill() {
    if (selected === null || busy) return;

    const orderId = orderIds[selected.name];

    if (orderId === undefined) {
      flash.problem(labels.noBill);

      return;
    }

    const toId = tableIds[target];

    if (target === '' || toId === undefined) {
      flash.problem(labels.needTable);

      return;
    }

    setBusy(true);

    const answer = await post<unknown>(
      '/api/orders',
      // The label rides along with the id: `BillRegistry::transfer()` takes
      // both, and the one a person reads on a receipt is the label.
      { action: 'transfer', orderId, tableId: toId, tableLabel: target },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? `${selected.name} · ${labels.action_transfer}`);

      return;
    }

    /*
     * The destination turns occupied; the source is left where it is.
     *
     * A table whose bill has moved is not automatically free — the party walked
     * away from it and somebody has to clear it — and `clean` is the verb that
     * says so. Colouring it green from here would offer the square to the next
     * guests before anybody had wiped it.
     */
    setLive((current) => recolour(current, target, 'seated'));
    flash(`${selected.name} → ${target}`);
    /*
     * The panel closes, because it is no longer about this table.
     *
     * Everything in it — the covers, the time they sat, what they owe — came
     * off the bill that has just moved, and `orderIds` is the render's, not
     * live state: leaving it open would offer "move to another table" a second
     * time with an id that is now somebody else's square.
     */
    open(null);
  }

  /**
   * The square that goes on the table.
   *
   * Opened into its own window and printed rather than downloaded: a host wants
   * paper, and a file in the Downloads folder is two more steps and a printer
   * dialog they have to find themselves. The label is printed under the code
   * because a sheet of twenty-four identical squares is a sheet somebody sticks
   * on the wrong tables.
   */
  async function printQr(table: Table) {
    const id = tableIds[table.name];

    if (id === undefined) {
      flash.problem(labels.qrFailed);

      return;
    }

    try {
      const response = await fetch(`/api/tables/qr?id=${id}`);

      if (!response.ok) throw new Error(String(response.status));

      const { data } = (await response.json()) as {
        data: { label: string; svg: string; qr_url: string };
      };

      const sheet = window.open('', '_blank', 'width=420,height=560');

      if (sheet === null) {
        flash.problem(labels.qrFailed);

        return;
      }

      // `textContent` for everything that came off the wire — the label is a
      // restaurant's own text and the URL contains a token, and neither is
      // markup this window should interpret.
      const document_ = sheet.document;
      document_.title = data.label;

      const figure = document_.createElement('figure');
      figure.style.cssText = 'font:600 24px system-ui;text-align:center;margin:24px';
      figure.innerHTML = data.svg;

      const caption = document_.createElement('figcaption');
      caption.textContent = data.label;
      caption.style.cssText = 'margin-top:12px';
      figure.append(caption);

      document_.body.append(figure);
      sheet.print();
    } catch {
      flash.problem(labels.qrFailed);
    }
  }

  return (
    <div data-split className="grid [grid-template-columns:minmax(0,1fr)_340px] items-start gap-5">
      <div className="bg-surface rounded-lg border p-6">
        {live.map((zone) => {
          const busy = zone.tables.filter(isOccupied).length;

          return (
            <div key={zone.key} className="mb-7 last:mb-0">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-fg-subtle tracking-caps text-xs font-semibold uppercase">
                  {zone.label}
                </span>
                <span aria-hidden className="bg-divider h-px flex-1" />
                <span data-num className="text-fg-subtle text-xs">
                  {labels.zoneMeta
                    .replace('{total}', String(zone.tables.length))
                    .replace('{busy}', String(busy))}
                </span>
              </div>

              <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(126px,100%),1fr))] gap-3">
                {zone.tables.map((table) => {
                  const style = TABLE_STATUS[table.status];
                  const isOpen = selected?.name === table.name;

                  return (
                    <button
                      key={table.name}
                      type="button"
                      data-tile
                      aria-pressed={isOpen}
                      onClick={() => open(isOpen ? null : table)}
                      className={`flex min-h-[104px] flex-col gap-2.5 rounded-md border p-3.5 text-left ${style.tile} ${
                        isOpen ? 'ring-brand-500 ring-2' : ''
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-display tracking-snug text-lg font-semibold">
                          {table.name}
                        </span>
                        <span data-num className="text-fg-subtle text-xs">
                          {table.seats}
                        </span>
                      </span>

                      <span
                        className={`text-2xs block font-semibold tracking-wide uppercase ${style.label}`}
                      >
                        {labels[`status_${table.status}`]}
                      </span>

                      <span className="text-fg-subtle text-2xs mt-auto">
                        {labels[`meta_${table.name}`] ?? ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <aside data-sticky className="bg-surface sticky top-0 rounded-lg border">
        {selected === null ? (
          <div className="px-8 py-14 text-center">
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
            <div className="text-sm font-semibold">{labels.emptyTitle}</div>
            <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{labels.emptyBody}</p>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  {selected.name}
                </h3>
                <p className="text-fg-subtle mt-1 text-xs">
                  {labels[`status_${selected.status}`]} ·{' '}
                  {labels.seats.replace('{n}', String(selected.seats))}
                </p>
              </div>

              <button
                type="button"
                onClick={() => open(null)}
                aria-label={labels.close}
                className="text-fg-muted hover:bg-bg-muted grid size-8 flex-none place-items-center rounded-md"
              >
                ✕
              </button>
            </div>

            <dl className="border-divider mt-5 grid grid-cols-2 gap-y-2.5 border-t pt-4 text-sm">
              {selected.guests === undefined ? null : (
                <>
                  <dt className="text-fg-subtle">{labels.guests}</dt>
                  <dd data-num className="text-right font-medium">
                    {selected.guests}
                  </dd>
                </>
              )}

              {selected.since === undefined ? null : (
                <>
                  <dt className="text-fg-subtle">{labels.since}</dt>
                  <dd data-num className="text-right font-medium">
                    {selected.since}
                  </dd>
                </>
              )}

              {selected.waiter === undefined ? null : (
                <>
                  <dt className="text-fg-subtle">{labels.waiter}</dt>
                  <dd className="text-right font-medium">{selected.waiter}</dd>
                </>
              )}

              {selected.reservation === undefined ? null : (
                <>
                  <dt className="text-fg-subtle">{labels.reservation}</dt>
                  <dd className="text-right font-medium">{selected.reservation}</dd>
                </>
              )}
            </dl>

            {selected.bill === undefined ? null : (
              <div className="border-divider mt-4 flex items-baseline justify-between border-t pt-3.5">
                <span className="text-sm font-semibold">{labels.bill}</span>
                <span data-num className="font-display text-xl font-bold">
                  {money[`bill_${selected.name}`]}
                </span>
              </div>
            )}

            {/*
             * The five actions the design puts under a table. Which ones make
             * sense depends on the table: seating a table that is already
             * seated is not a thing, and asking for a bill on an empty one is
             * not either — so they are filtered rather than dimmed.
             */}
            <div className="mt-5 flex flex-col gap-2">
              {ACTIONS.filter((action) =>
                action === 'seat'
                  ? selected.status === 'free' || selected.status === 'reserved'
                  : action === 'bill' || action === 'transfer'
                    ? isOccupied(selected)
                    : action === 'clean'
                      ? selected.status === 'cleaning' || isOccupied(selected)
                      : selected.status === 'free',
              ).map((action) => (
                <button
                  key={action}
                  type="button"
                  data-press
                  disabled={busy}
                  /*
                   * Four of the five write. `bill` is the exception, and it is a
                   * deliberate absence rather than a missing endpoint.
                   *
                   * Opening a bill is an act at a terminal by a named person who
                   * signed in with a PIN, and the audit row has to say which
                   * terminal and which person — which is why every route under
                   * `/pos/bills` sits behind `RequireTerminalSession` and refuses
                   * a back-office token on purpose. `BillActionController` gave
                   * Orders a console-side door for the two acts that are
                   * management rather than till work (a discount and a transfer);
                   * opening a bill is neither, so there is no such door and there
                   * should not be one. The button says so and walks the person to
                   * the till instead of flashing a toast that changes nothing.
                   */
                  onClick={() => {
                    if (action === 'seat' || action === 'clean') {
                      void move(action);

                      return;
                    }

                    if (action === 'bill') {
                      flash(labels.billAtTill);
                      router.push('/pos');

                      return;
                    }

                    setTarget('');
                    setForm((current) => (current === action ? null : action));
                  }}
                  className={`h-11 rounded-md text-sm font-semibold disabled:opacity-60 ${
                    action === 'seat' ? 'bg-brand-500 text-white' : 'border'
                  }`}
                >
                  {labels[`action_${action}`]}
                </button>
              ))}
            </div>

            {/* ------------------------------------------------ the booking */}
            {form === 'reserve' ? (
              <div className="border-divider mt-3 grid gap-2.5 border-t pt-3.5">
                <Field label={labels.bookGuest}>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    maxLength={120}
                    className="bg-surface h-10 w-full rounded-md border px-3 text-sm"
                  />
                </Field>

                <Field label={labels.bookPhone}>
                  <input
                    value={guestPhone}
                    onChange={(event) => setGuestPhone(event.target.value)}
                    type="tel"
                    inputMode="tel"
                    maxLength={32}
                    data-num
                    className="bg-surface h-10 w-full rounded-md border px-3 text-sm"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2.5">
                  <Field label={labels.bookGuests}>
                    <input
                      value={party}
                      onChange={(event) => setParty(event.target.value)}
                      inputMode="numeric"
                      data-num
                      className="bg-surface h-10 w-full rounded-md border px-3 text-sm"
                    />
                  </Field>

                  <Field label={labels.bookTime}>
                    <input
                      value={at}
                      onChange={(event) => setAt(event.target.value)}
                      placeholder="19:00"
                      data-num
                      className="bg-surface h-10 w-full rounded-md border px-3 text-sm"
                    />
                  </Field>
                </div>

                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reserve()}
                    className="bg-brand-500 h-10 flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {labels.bookSave}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="h-10 rounded-md border px-4 text-sm font-semibold"
                  >
                    {labels.formCancel}
                  </button>
                </div>
              </div>
            ) : null}

            {/* ----------------------------------------------- the transfer */}
            {form === 'transfer' ? (
              <div className="border-divider mt-3 grid gap-2.5 border-t pt-3.5">
                <Field label={labels.moveTo}>
                  {/*
                   * Only tables that are free and have a row behind them.
                   * Moving a bill onto an occupied table is how two parties end
                   * up on one cheque, and a fixture table has no id to move to.
                   */}
                  <select
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    className="bg-surface h-10 w-full rounded-md border px-3 text-sm"
                  >
                    <option value="">—</option>
                    {live
                      .flatMap((zone) => zone.tables)
                      .filter(
                        (table) =>
                          table.name !== selected.name &&
                          table.status === 'free' &&
                          tableIds[table.name] !== undefined,
                      )
                      .map((table) => (
                        <option key={table.name} value={table.name}>
                          {table.name}
                        </option>
                      ))}
                  </select>
                </Field>

                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void moveBill()}
                    className="bg-brand-500 h-10 flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {labels.moveSave}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="h-10 rounded-md border px-4 text-sm font-semibold"
                  >
                    {labels.formCancel}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Not one of the design's five verbs, and deliberately below them:
                printing a sticker is a thing a manager does once when a table
                is built, not a thing a host does during service. */}
            {tableIds[selected.name] === undefined ? null : (
              <button
                type="button"
                onClick={() => void printQr(selected)}
                className="mt-2 h-11 w-full rounded-md border text-sm font-semibold"
              >
                {labels.qrPrint}
              </button>
            )}

            <p className="text-fg-subtle mt-4 text-xs leading-normal">{labels.actionsNote}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-fg-subtle mb-1 block text-xs font-semibold">{label}</span>
      {children}
    </label>
  );
}

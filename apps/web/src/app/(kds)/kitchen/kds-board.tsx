'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flash } from '@restaurant/ui';

import { adopt, usePollWhileOffline } from '@/lib/live-fallback';
import { realtime } from '@/lib/realtime';
import type { RealtimeConfig } from '@/lib/realtime-server';
import {
  ageTone,
  boardSummary,
  callNumber,
  COLUMNS,
  elapsed,
  LATE_MINUTES,
  STATE_OF,
  STATIONS,
  type StopEntry,
  type Ticket,
  type TicketState,
} from './kds-data';
import { ShortcutsSheet, type ShortcutGroup } from '../../(pos)/pos/shortcuts-sheet';
import { StopSheet } from './stop-sheet';

/**
 * The board, live.
 *
 * The page renders it once on the server so a screen that comes back from a
 * reboot has something on it immediately; from then on it moves by itself. Two
 * sources feed it and they are deliberately different in kind:
 *
 *   - **`kitchen.ticket.fired`** carries a whole docket. A new order, or an
 *     edited one refired. It is added or replaced wholesale.
 *   - **`kitchen.ticket.moved`** carries a status. A cook — this one or the one
 *     at the next station — claimed, started or finished something.
 *
 * Neither triggers a refetch. A kitchen screen that reloaded the board on every
 * message would spend the busiest twenty minutes of the day making requests,
 * and each one is a chance to show a board that is a second out of date rather
 * than the message that was already in hand.
 *
 * When the socket is not available the board still renders and its buttons
 * still work — they post, and the response updates the card. That is the
 * degraded mode a kitchen can actually run in: slower, never blank.
 */
export function KdsBoard({
  initial,
  initialStops,
  branchId,
  realtimeConfig,
  labels,
}: {
  initial: readonly Ticket[];
  /** The 86 sheet as the server read it. */
  initialStops: readonly StopEntry[];
  /** Which room's channel to listen to. Null disables the subscription. */
  branchId: number | null;
  /** How to reach the broadcaster. Null when none is configured. */
  realtimeConfig: RealtimeConfig | null;
  /** Everything this component draws, resolved by the server. */
  labels: {
    /** "Oshxona" — the surface's own name, in the corner of the wall screen. */
    title: string;
    /**
     * The venue the board is over, from the session.
     *
     * The subtitle used to be `console.kitchen.subtitle` — "Chilonzor · issiq
     * sex" — which named the demo branch and pinned every kitchen in every
     * restaurant to one station regardless of the tab in front of it.
     */
    placeName: string;
    openTickets: string;
    avgCook: string;
    longestWait: string;
    liveLabel: string;
    columns: Record<TicketState, string>;
    actions: Record<string, string>;
    empty: string;
    ageInKitchen: string;
    ageSinceReady: string;
    /**
     * "Kechikdi" — the word beside the red timer.
     *
     * `console.kitchen.late` has been in all three catalogues since the board
     * was drawn and nothing read it, so a ticket past ten minutes was red and
     * nothing else. `FOUNDATIONS §7`: status is never carried by colour alone,
     * and a kitchen is exactly where that rule earns itself — the board is read
     * across a room, in steam, by people who are not all going to see the
     * difference between this red and the amber next to it.
     */
    late: string;
    seat: string;
    /**
     * The fixture board's notes, already translated.
     *
     * `TicketLine.note` is a catalogue key and this component cannot translate —
     * next-intl's translator is a server object. Resolved upstream and passed as
     * words, which keeps the demo board legible: it is the board every screenshot
     * of this console has been taken from, and an amber line reading
     * `noteNoOnion` would be worse than no line at all.
     */
    notes: Record<string, string>;
    /** One heading per entry in STATIONS, in the same order. */
    stations: readonly string[];
    /** Station codes to headings, for the 86 sheet's own grouping. */
    stationsByCode: Record<string, string>;
    stopList: string;
    stopTitle: string;
    stopSub: string;
    stopClose: string;
    stopOff: string;
    stopOn: string;
    stopFailed: string;
    stopEmpty: string;
    /** The keyboard sheet — `?` is global, so the board carries its own list. */
    shortcuts: string;
    close: string;
    shortcutGroups: readonly ShortcutGroup[];
  };
}) {
  const [tickets, setTickets] = useState<readonly Ticket[]>(initial);
  /*
   * The server snapshot this board last adopted. After `router.refresh()` —
   * which the poll below runs while the socket is down — `initial` is a new
   * list, and the board takes it over in place of what events have built.
   */
  const [seenInitial, setSeenInitial] = useState(initial);
  adopt(initial, seenInitial, setSeenInitial, setTickets);
  const [busy, setBusy] = useState<number | null>(null);

  /*
   * Which station this screen is watching. `null` is the pass.
   *
   * Filtered here rather than fetched. The design's own words: a cook sees their
   * own queue and no one else's — but the *screen* still holds the whole board,
   * because a tap that had to go to the server would be a round trip a chef makes
   * forty times a service, and because a docket for a station this screen is not
   * showing still has to be here the moment somebody taps across to it.
   *
   * `station` on the server call exists for a different case: a screen bolted over
   * one section for good, which is a per-terminal setting and not a tab.
   */
  const [station, setStation] = useState<string | null>(null);
  const [stops, setStops] = useState<readonly StopEntry[]>(initialStops);
  const [seenStops, setSeenStops] = useState(initialStops);
  adopt(initialStops, seenStops, setSeenStops, setStops);
  const [sheetOpen, setSheetOpen] = useState(false);
  /* `?` opens the same sheet the till uses, with this board's rows. */
  const [keysOpen, setKeysOpen] = useState(false);

  /** How many dishes are off. Decides the 86 button's colour, per `§5.5`. */
  const stopped = stops.filter((entry) => entry.stopped).length;

  /*
   * The clock the timers are read against.
   *
   * Every fifteen seconds, not every second. The figures are in minutes, so a
   * second-by-second tick would redraw thirty cards sixty times a minute to change
   * a digit four times — on a tablet propped over a hot line, that is battery and
   * heat for nothing. Fifteen seconds is close enough that a minute never appears
   * to skip and coarse enough to be free.
   *
   * `useSyncExternalStore` rather than an effect that calls `setState`: an
   * interval writing state from inside an effect is the pattern
   * `react-hooks/set-state-in-effect` exists to catch, and it renders once with
   * the wrong value before correcting itself. The server snapshot is null, which
   * is what keeps the first paint identical on both sides of hydration — the
   * server has no clock this board can agree with.
   */
  const tick = useSyncExternalStore(subscribeToTheQuarterMinute, quarterMinute, () => null);
  const now = tick === null ? null : tick * 15_000;

  /*
   * Ten seconds between reads while the socket is not carrying events. A
   * docket fired into an empty kitchen can wait ten seconds; the board showing
   * nothing for a whole service cannot. Stops entirely once the socket is up.
   */
  usePollWhileOffline(realtimeConfig, 10_000);

  useEffect(() => {
    if (branchId === null) return;

    const echo = realtime(realtimeConfig);

    if (echo === null) return;

    const channel = echo.private(`branch.${branchId}.kitchen`);

    channel.listen('.kitchen.ticket.fired', (event: FiredEvent) => {
      setTickets((current) => {
        const arrived = toTicket(event);
        const without = current.filter((ticket) => ticket.ticketId !== arrived.ticketId);

        // Newest first within its column, which is where a cook's eye goes.
        return [arrived, ...without];
      });
    });

    channel.listen('.kitchen.ticket.moved', (event: MovedEvent) => {
      setTickets((current) =>
        current.map((ticket) =>
          ticket.ticketId === event.id
            ? {
                ...ticket,
                state: STATE_OF[event.status] ?? ticket.state,
                /*
                 * The timer is re-based, not carried over.
                 *
                 * Moving a docket changes what its clock is measuring. A card in
                 * the Ready column is answering "how long has this been going
                 * cold", and the caption under the number says so — so it counts
                 * from `ready_at`, not from when the ticket landed. Keeping the
                 * old origin would put a plate on the pass showing eleven minutes
                 * the instant the cook finished it, in red.
                 */
                since: sinceOf(event.ready_at) ?? sinceOf(event.started_at) ?? ticket.since,
              }
            : ticket,
        ),
      );
    });

    /*
     * The 86 sheet, changed on some other screen.
     *
     * A second wall screen, a manager on a laptop, the same chef on a tablet in
     * the walk-in. Without this the count on the button and the switches in the
     * sheet would be whatever they were when this page rendered, and two cooks
     * would disagree about what is off — which is the exact confusion the
     * stop-list exists to end.
     *
     * The flag is flipped rather than the sheet refetched: the message already
     * says which dish and which way, and a refetch would be a request per tap on
     * every screen in the building.
     */
    const stoplist = echo.private(`branch.${branchId}.stoplist`);

    stoplist.listen('.menu.dish.stopped', (event: { dish_id: number }) => {
      setStops((current) => flag(current, event.dish_id, true));
    });

    stoplist.listen('.menu.dish.resumed', (event: { dish_id: number }) => {
      setStops((current) => flag(current, event.dish_id, false));
    });

    return () => {
      // Left, not disconnected: another screen on this tablet may be using the
      // same socket, and the connection is shared on purpose.
      echo.leave(`branch.${branchId}.kitchen`);
      echo.leave(`branch.${branchId}.stoplist`);
    };
  }, [branchId, realtimeConfig]);

  async function move(ticket: Ticket, action: string) {
    if (ticket.ticketId === undefined || busy !== null) return;

    setBusy(ticket.ticketId);

    try {
      const response = await fetch(`/api/kitchen/tickets?id=${ticket.ticketId}&move=${action}`, {
        method: 'POST',
      });

      if (!response.ok) return;

      const body = (await response.json()) as { data?: { status?: string } };
      const status = body.data?.status;

      if (status === undefined) return;

      /*
       * Applied from the response rather than assumed from the button.
       *
       * The broadcast will say the same thing a moment later and this is the
       * same update, so the two converge rather than fighting. What it protects
       * against is the socket being down: without it, a kitchen with no
       * WebSocket would press a button and watch nothing happen.
       */
      const moved = STATE_OF[status] ?? ticket.state;

      setTickets((current) =>
        current.map((entry) =>
          entry.ticketId === ticket.ticketId ? { ...entry, state: moved } : entry,
        ),
      );

      /*
       * `A-1291 → Tayyorlanmoqda` — `dc.html:11622`.
       *
       * The card moves column, which a cook watching that card already saw. The
       * toast is for the cook who pressed the key: the keypad has no hover and
       * no press state a wet glove can feel, so without this the only proof the
       * press landed is a card sliding somewhere else on a wall of thirty.
       */
      flash(`${ticket.id} → ${labels.columns[moved]}`);
    } finally {
      setBusy(null);
    }
  }

  /*
   * The cards a digit can reach, in the order the board reads.
   *
   * Column by column and top to bottom, which is the design's own numbering
   * (`dc.html:13297` walks the columns and increments a counter as it goes) —
   * and the served column is skipped, because a served docket has nowhere to
   * advance to and giving it a digit would waste one of the nine.
   *
   * Numbering across the whole board rather than per column: the cook presses 3
   * for the third card they can see, and they are not counting columns.
   */
  const onScreen =
    station === null ? tickets : tickets.filter((ticket) => ticket.station === station);

  const selectable = COLUMNS.slice(0, -1).flatMap((column) =>
    onScreen.filter((ticket) => ticket.state === column.state),
  );

  /*
   * The keypad. `FOUNDATIONS §11`: "KDS is fully operable from a numeric
   * keypad: digit selects a ticket, ... Enter advances."
   *
   * It is not an accessibility nicety on this surface — it is how the screen is
   * used. A cook has a pan in one hand and a wall-mounted keypad under the
   * screen; reaching up to a touch target with a wet glove is the thing the
   * keypad exists to avoid.
   *
   * The design lists five keys here (`dc.html:15167`) and the board bound three.
   * `Tab` moves between stations and `S` opens the 86 sheet — the two a chef
   * reaches for without leaving the board, and the two that were touch-only on
   * a screen mounted above head height.
   */
  const [selected, setSelected] = useState(0);

  /*
   * Clamped at render, not stored clamped.
   *
   * The board moves underneath the selection: a docket is served, a station
   * filter narrows, a ticket arrives. Keeping the raw index in state and
   * clamping here means the ring lands on the last reachable card rather than
   * on nothing, and `Enter` never reads past the end of the list.
   */
  const at = selectable.length === 0 ? 0 : Math.min(selected, selectable.length - 1);

  /* Kept in a ref so the listener binds once, never per keystroke. */
  const keypad = useRef({ selectable, at, move, station, sheetOpen, keysOpen });

  useEffect(() => {
    keypad.current = { selectable, at, move, station, sheetOpen, keysOpen };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;

      /* The 86 sheet has a search field in it. Nothing here fires while
         somebody is typing into one. */
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const state = keypad.current;

      /*
       * `S` — the 86 sheet, from the keypad.
       *
       * Bound whether or not there is a ticket on the board: a chef who has
       * just looked in an empty fridge opens this before the board has anything
       * on it, and a quiet board is exactly when they get the chance.
       */
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        setSheetOpen((open) => !open);

        return;
      }

      /* `?` — the list of everything above. Shift+/ on most layouts, so the
         key itself is what is matched rather than the modifier. */
      if (event.key === '?') {
        event.preventDefault();
        setKeysOpen((open) => !open);

        return;
      }

      if (event.key === 'Escape' && (state.sheetOpen || state.keysOpen)) {
        setSheetOpen(false);
        setKeysOpen(false);

        return;
      }

      /* Nothing below fires while the keyboard list is over the board: a chef
         reading what `S` does should not also be toggling the 86 sheet. */
      if (state.keysOpen) return;

      /*
       * `Tab` — the next station.
       *
       * Only when nothing has focus. The design steals Tab outright on this
       * surface, and on a wall screen driven by a keypad that is right; but a
       * person who has started tabbing through the board's own buttons must be
       * able to keep going, and `FOUNDATIONS §7` does not have an exception for
       * kitchens. `document.body` holding focus is the wall-screen case, and it
       * is the only one this takes.
       */
      if (event.key === 'Tab' && document.activeElement === document.body) {
        event.preventDefault();

        const index = STATIONS.findIndex((tab) => tab.code === state.station);
        const step = event.shiftKey ? STATIONS.length - 1 : 1;

        setStation(STATIONS[(index + step) % STATIONS.length].code);

        return;
      }

      const visible = state.selectable;

      if (visible.length === 0) return;

      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;

        if (index < visible.length) {
          event.preventDefault();
          setSelected(index);
        }

        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected(Math.min(visible.length - 1, state.at + 1));

        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected(Math.max(0, state.at - 1));

        return;
      }

      if (event.key === 'Enter') {
        const ticket = visible[state.at];
        const column = COLUMNS.find((entry) => entry.state === ticket?.state);

        if (ticket === undefined || column?.move == null) return;

        event.preventDefault();
        void state.move(ticket, column.move);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * The three figures across the top, counted from what this screen is showing.
   *
   * They follow the station tab because a cook on the grill reading "eleven
   * open" when eleven is the whole building is reading somebody else's queue.
   */
  const summary = boardSummary(onScreen, now);

  /*
   * The wall clock. Null until the client's first tick, like every other time
   * on this board — the server has no clock the browser can agree with, and a
   * hydration mismatch on a screen nobody reloads is a screen stuck on the
   * server's minute. A dash is the honest first paint.
   */
  const clock =
    now === null
      ? '—'
      : new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  /** The heading of whichever tab is selected — "Barchasi", "Issiq sex". */
  const stationLabel =
    labels.stations[
      Math.max(
        0,
        STATIONS.findIndex((tab) => tab.code === station),
      )
    ] ?? '';

  return (
    <>
      {/* A 68px row of station, longest wait, live chip and clock is 620px
          wide; the shell clips rather than scrolls, so on anything narrow the
          clock and the live indicator were simply absent. It wraps instead —
          height is the one dimension a kitchen screen can spend. */}
      <header className="bg-surface flex min-h-[68px] flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-2 sm:px-6 sm:py-0">
        <div>
          <div className="font-display tracking-snug text-xl leading-[1.1] font-semibold">
            {labels.title}
          </div>
          <div className="text-fg-subtle mt-[3px] text-xs">
            {labels.placeName} · {stationLabel}
          </div>
        </div>

        <div data-kdsstats className="ml-8 flex gap-7">
          {[
            { label: labels.openTickets, value: String(summary.open) },
            { label: labels.avgCook, value: summary.averageCook ?? '—' },
            {
              label: labels.longestWait,
              value: summary.longestWait ?? '—',
              /* Amber only when there is something waiting. A permanently
                 warm figure is not a warning. */
              tone: summary.longestWait === null ? '' : 'text-warning-500',
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
          {/*
           * The one loop the design allows, and the reason it is allowed:
           * it stops when the thing it is about stops. `dc.html:6679` puts
           * `softPulse 2s infinite` on this dot, and `FOUNDATIONS §4`'s "no
           * looping motion anywhere" is the doc the file overrules — a chef
           * glancing up needs to see that the board is still listening, not
           * frozen on the last thing that happened twenty minutes ago.
           */}
          <span className="text-fg-muted flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm">
            <span aria-hidden data-live="true" className="bg-success-500 rounded-pill size-[7px]" />
            {labels.liveLabel}
          </span>
          <span data-num className="font-display tracking-snug text-xl font-semibold">
            {clock}
          </span>
        </div>
      </header>

      <div className="bg-surface flex flex-none flex-wrap items-center gap-3.5 border-b px-6 py-3">
        <div className="bg-bg-muted flex max-w-full gap-0.5 overflow-x-auto rounded-md p-[3px]">
          {STATIONS.map((tab, index) => (
            <button
              key={tab.label}
              type="button"
              data-seg
              data-press
              data-active={tab.code === station ? 'true' : undefined}
              onClick={() => setStation(tab.code)}
              className={`h-[34px] flex-none rounded-[7px] border-0 px-[15px] text-sm font-semibold ${
                tab.code === station ? 'bg-surface text-fg' : 'text-fg-muted bg-transparent'
              }`}
            >
              {labels.stations[index]}
            </button>
          ))}
        </div>

        {/*
         * Red when something is off, neutral when nothing is — `§5.5` calls it
         * "a red 86 button". It was amber in every state, which meant a board
         * with a clean stop list looked exactly like a board with six dishes
         * down: a warning that is always on is not a warning.
         */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`ml-auto flex h-10 items-center gap-[9px] rounded-md border px-4 text-[16px] font-semibold ${
            stopped > 0
              ? 'border-danger-500 bg-danger-50 text-danger-700'
              : 'border-border-strong text-fg-muted'
          }`}
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
          {labels.stopList}
          {stopped > 0 ? (
            <span
              data-num
              className="bg-danger-500 rounded-pill grid h-5 min-w-5 place-items-center px-[5px] text-xs font-bold text-white"
            >
              {stopped}
            </span>
          ) : null}
        </button>
      </div>

      {sheetOpen ? (
        <StopSheet
          entries={stops}
          onEntries={setStops}
          onClose={() => setSheetOpen(false)}
          labels={{
            title: labels.stopTitle,
            subtitle: labels.stopSub,
            close: labels.stopClose,
            off: labels.stopOff,
            on: labels.stopOn,
            failed: labels.stopFailed,
            empty: labels.stopEmpty,
            stations: labels.stationsByCode,
          }}
        />
      ) : null}

      {/* The same sheet the till opens, with this board's five keys.
          `FOUNDATIONS §6` makes `?` global; it was bound on one surface. */}
      {keysOpen ? (
        <ShortcutsSheet
          title={labels.shortcuts}
          closeLabel={labels.close}
          groups={labels.shortcutGroups}
          onClose={() => setKeysOpen(false)}
        />
      ) : null}

      <div data-scroll className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-5 pt-4 pb-6">
        {COLUMNS.map((column, index) => {
          const inColumn = onScreen.filter((ticket) => ticket.state === column.state);

          return (
            <section
              key={column.state}
              data-kdscol
              aria-label={`${labels.columns[column.state]} · ${inColumn.length}`}
              /*
               * `FOUNDATIONS §7`: "KDS ticket list `aria-live=\"polite\"`".
               *
               * The one thing on this screen that changes without anybody
               * touching it is a docket landing, and a chef using a screen
               * reader had no way to know it had. Polite rather than assertive
               * — a new order is not an interruption, it is the next thing —
               * and `additions` rather than `all`, because a card leaving a
               * column is a card arriving in the next one and announcing both
               * halves of one move says everything twice.
               */
              aria-live="polite"
              aria-relevant="additions"
              className="flex min-w-[288px] flex-1 flex-col gap-3"
            >
              <div
                className="flex items-center gap-2.5 border-b-2 px-1 pb-2"
                style={{ borderColor: column.accent }}
              >
                <span className="text-sm font-semibold tracking-wide uppercase">
                  {labels.columns[column.state]}
                </span>
                <span
                  data-num
                  className="bg-bg-muted text-fg-muted rounded-pill px-2 py-0.5 text-xs font-semibold"
                >
                  {inColumn.length}
                </span>
              </div>

              {inColumn.map((ticket) => {
                /* Zero for a card no digit reaches — the served column, and
                   anything past the ninth. The chip is drawn only when there
                   is a key behind it. */
                const reach = selectable.indexOf(ticket);
                const digit = reach >= 0 && reach < 9 ? reach + 1 : 0;

                return (
                  <TicketCard
                    key={ticket.ticketId ?? ticket.id}
                    ticket={ticket}
                    now={now}
                    accent={column.accent}
                    action={labels.actions[column.action] ?? ''}
                    move={column.move}
                    busy={busy === ticket.ticketId}
                    onMove={() => column.move !== null && void move(ticket, column.move)}
                    final={index === COLUMNS.length - 1}
                    ready={index >= 3}
                    labels={labels}
                    keypadNumber={digit}
                    selected={reach >= 0 && reach === at}
                  />
                );
              })}

              {inColumn.length === 0 ? (
                <div className="text-fg-subtle rounded-md border border-dashed px-4 py-7 text-center text-xs">
                  {labels.empty}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * One ticket.
 *
 * The quantity leads in brand colour and the dish follows at 15px semibold,
 * because from two metres the number is what a chef reads first. What the guest
 * asked for sits under the dish in amber — it is the line that gets missed, and
 * for somebody with an allergy it is the whole order.
 */
function TicketCard({
  ticket,
  now,
  accent,
  action,
  move,
  busy,
  onMove,
  final,
  ready,
  labels,
  keypadNumber,
  selected,
}: {
  ticket: Ticket;
  /**
   * Now, in epoch milliseconds, or null before the first client tick.
   *
   * Null on the server render and on the first paint, which is deliberate: the
   * card falls back to the figure it was handed rather than to a time the server
   * could not have known, so hydration matches and the timer starts a moment
   * later without the number jumping.
   */
  now: number | null;
  accent: string;
  action: string;
  move: string | null;
  busy: boolean;
  onMove: () => void;
  final: boolean;
  ready: boolean;
  /**
   * Which digit selects this card, or 0 when none does.
   *
   * Drawn as its own small `kbd` chip beside the call number, which is what the
   * design does (`dc.html:6733`) and what this card used to collapse into one:
   * it printed the keypad index *as* the call number for the first nine cards
   * and only fell back to the real one past that. So the cook shouting "three"
   * across the pass was shouting a board position that changed the moment a
   * docket ahead of it was served, and the waiter who came back for ticket 3
   * collected somebody else's food.
   */
  keypadNumber: number;
  selected: boolean;
  labels: {
    ageInKitchen: string;
    ageSinceReady: string;
    late: string;
    seat: string;
    notes: Record<string, string>;
  };
}) {
  // Counted here when the board knows where to count from, and taken as given
  // when it does not — which is the fixture board, and only the fixture board.
  const clock =
    ticket.since !== undefined && now !== null
      ? elapsed(ticket.since, now)
      : { age: ticket.age, minutes: ticket.minutes };
  const tone = ageTone(clock.minutes);
  const late = clock.minutes >= LATE_MINUTES;

  return (
    <article
      aria-current={selected ? 'true' : undefined}
      /*
       * One pulse when the docket crosses ten minutes — `FOUNDATIONS §4`:
       * "A KDS ticket crossing the late threshold pulses **once**."
       *
       * Once, not a loop: a board with six late tickets throbbing is a board
       * nobody can read, and the colour is what carries the state afterwards.
       * The attribute goes on when the timer crosses, and `motion.css` runs the
       * keyframe a single time — including the `prefers-reduced-motion` escape,
       * which is the same rule that drops the press-scale.
       */
      data-late={late ? 'true' : undefined}
      className={`bg-surface flex flex-col gap-3 rounded-md border p-4 ${tone.border} ${
        selected ? 'ring-brand-500 ring-2' : ''
      }`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      {/*
       * Typed for a wall, not for a desk.
       *
       * `FOUNDATIONS §2` sets a hard floor for this surface — "KDS never below
       * 16px; KDS item names 18px" — and `specs/01-os.md §5.5` gives the header
       * 20px/700 and the timer mono 18px. This card was drawn at the console's
       * scale: 15px names, 12px modifiers, a 12px mono timer. It is read from
       * two to three metres by somebody holding a pan, and at that distance the
       * difference between 12px and 18px is the difference between reading it
       * and walking over.
       */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {/*
             * The number a cook shouts across the pass, and the digit that
             * selects this card from the keypad. One chip, because they are the
             * same number to the person using them — the card you call out is
             * the card you press.
             */}
            {keypadNumber > 0 ? (
              <kbd
                className={`grid h-[19px] min-w-[19px] flex-none place-items-center rounded-[5px] border px-1 font-mono text-xs font-semibold ${
                  selected
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-border-strong bg-bg-subtle text-fg-subtle'
                }`}
              >
                {keypadNumber}
              </kbd>
            ) : null}

            {/* The number a cook shouts across the pass. Two digits off the
                order number and stable for the life of the docket — see
                `callNumber`. */}
            <span
              data-num
              className={`grid size-8 flex-none place-items-center rounded-md text-[16px] font-bold ${
                late
                  ? 'bg-danger-500 text-white'
                  : ready
                    ? 'bg-success-500 text-white'
                    : 'bg-bg-muted text-fg'
              }`}
            >
              {callNumber(ticket.id)}
            </span>

            <div className="font-display tracking-snug truncate text-[20px] leading-tight font-bold">
              {ticket.table}
            </div>
          </div>
          <div className="text-fg-subtle mt-[3px] font-mono text-[16px]">
            {ticket.id} · {ticket.waiter}
          </div>
        </div>

        <div className="text-right">
          <div
            data-num
            className={`font-display tracking-snug font-mono text-[18px] font-bold ${tone.text}`}
          >
            {clock.age}
          </div>
          {/* The word, because the red is not the message — `FOUNDATIONS §7`.
              It replaces the caption rather than sitting beside it: a late
              docket's question is no longer "how long has this been cooking". */}
          <div
            className={`mt-0.5 text-[16px] ${late ? 'text-danger-500 font-semibold' : 'text-fg-subtle'}`}
          >
            {late ? labels.late : ready ? labels.ageSinceReady : labels.ageInKitchen}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {ticket.lines.map((line, index) => (
          <div key={`${line.name}-${index}`} className="flex items-baseline gap-2.5">
            <span data-num className="text-fg-brand min-w-7 text-[18px] font-bold">
              ×{line.quantity}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] leading-[1.3] font-semibold">{line.name}</span>

              {line.note !== undefined ? (
                <span className="text-warning-700 mt-[3px] block text-[16px]">
                  {labels.notes[line.note] ?? ''}
                </span>
              ) : null}

              {line.modifiers !== undefined && line.modifiers.length > 0 ? (
                <span className="text-warning-700 mt-[3px] block text-[16px]">
                  {line.modifiers.join(' · ')}
                </span>
              ) : null}

              {line.seat !== undefined ? (
                <span data-num className="text-fg-subtle mt-[3px] block text-[16px]">
                  {labels.seat} {line.seat}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {/* 52px and 16px type — `§5.5`. Pressed with the back of a hand. */}
      <button
        type="button"
        onClick={onMove}
        disabled={move === null || ticket.ticketId === undefined || busy}
        className={`flex h-[52px] items-center justify-center gap-2 rounded-md border text-[16px] font-semibold disabled:opacity-45 ${
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

/** What arrives on `kitchen.ticket.fired`. */
type FiredEvent = {
  id: number;
  order_number: string;
  table_label: string | null;
  station: string;
  status: string;
  created_at: string | null;
  lines: readonly {
    title: string;
    quantity: number;
    modifiers?: readonly string[] | null;
    seat_no?: number | null;
  }[];
};

/** What arrives on `kitchen.ticket.moved`. */
type MovedEvent = {
  id: number;
  status: string;
  started_at: string | null;
  ready_at: string | null;
};

/**
 * One dish's switch, flipped.
 *
 * A dish the sheet has never heard of is left alone rather than appended: the
 * sheet is every dish the kitchen could stop, so an unknown id means the menu
 * gained a dish since this page rendered, and a row invented from a broadcast
 * would have no station and no section to sit under. The next render has it.
 */
function flag(
  entries: readonly StopEntry[],
  dishId: number,
  stopped: boolean,
): readonly StopEntry[] {
  return entries.map((entry) => (entry.dishId === dishId ? { ...entry, stopped } : entry));
}

/** Ticks the board's timers. Fifteen seconds — see the call site for why. */
function subscribeToTheQuarterMinute(onTick: () => void): () => void {
  const timer = setInterval(onTick, 15_000);

  return () => clearInterval(timer);
}

/**
 * The current quarter-minute.
 *
 * A number that only changes every fifteen seconds, rather than `Date.now()`.
 * `useSyncExternalStore` compares snapshots to decide whether to re-render, and a
 * snapshot that is different on every read would redraw the board on any render
 * anything else in the tree caused.
 */
function quarterMinute(): number {
  return Math.floor(Date.now() / 15_000);
}

function toTicket(event: FiredEvent): Ticket {
  return {
    id: event.order_number,
    ticketId: event.id,
    station: event.station,
    table: event.table_label ?? event.station,
    waiter: '—',
    /*
     * Counted from what the docket says, not from when this browser heard about
     * it. Usually the same second — but a screen that was asleep, or on the far
     * side of a queue that backed up, would otherwise show a ten-minute-old
     * ticket as brand new and in black, which is exactly the ticket the colour
     * exists to flag.
     */
    since: sinceOf(event.created_at),
    // Only reached when the event carried no timestamp at all, which the API does
    // not do. Zero is the honest answer to "how long has this been here" for a
    // docket that has this instant arrived.
    age: '0:00',
    minutes: 0,
    state: STATE_OF[event.status] ?? 'colNew',
    lines: event.lines.map((line) => ({
      quantity: line.quantity,
      name: line.title,
      modifiers: line.modifiers ?? [],
      seat: line.seat_no ?? undefined,
    })),
  };
}

function sinceOf(stamp: string | null): number | undefined {
  if (stamp === null) return undefined;

  const at = Date.parse(stamp);

  return Number.isNaN(at) ? undefined : at;
}

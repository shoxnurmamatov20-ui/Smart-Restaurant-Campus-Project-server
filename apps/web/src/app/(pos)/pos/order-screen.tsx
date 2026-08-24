'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';
import { flash } from '@restaurant/ui';
import { dishImageFrom } from '@restaurant/surfaces/media/image';

import type { Messages } from '@/i18n';
import { DishPhoto } from '@/components/dish-photo';
import { useTheme } from '@/components/providers/theme-provider';
import type { PosDish, PosQuestion, PosSection, PosTable } from '@/lib/pos-session';
import type { PosPayable } from '@/lib/pos-tenders';
import { usePollWhileOffline } from '@/lib/live-fallback';
import { realtime } from '@/lib/realtime';
import { enqueue } from './pos-queue';
import { SyncPanel } from './sync-panel';
import type { RealtimeConfig } from '@/lib/realtime-server';

import { DiscountSheet, MoveSheet, SplitSheet, VoidSheet, type MoveKind } from './bill-actions';
import { ApprovalSheet } from './approval-sheet';
import { fill, POS_COPY, say } from './pos-copy';
import { GuestSheet } from './guest-sheet';
import { ShortcutsSheet, tillShortcuts } from './shortcuts-sheet';
import { HealthStrip } from './health-strip';
import { ModifierSheet } from './modifier-sheet';
import { PaySheet, type Settlement } from './pay-sheet';
import type { BillRates } from './rates-server';

/**
 * Where a waiter spends their shift.
 *
 * The screen the plan calls the cut that pays the project back, and the one
 * rule that shapes every decision in it: **the server owns the money**. A line
 * is not in the cart until the API has taken it, the totals are the ones the
 * API returned, and nothing here multiplies a price by a quantity. The cart on
 * the tablet is a view of a bill that exists.
 *
 * That is slower than an optimistic cart and it is the right trade. The
 * alternative — add locally, reconcile later — means a waiter reads one total
 * and the guest is charged another whenever a rule the client does not know
 * about fires: a happy-hour price, a stop-listed dish, a modifier that costs
 * more than it did this morning, VAT on a channel that does not charge service.
 * Every one of those is a line the guest argues about at the till.
 *
 * What is kept from the fixture screen it replaces: the three-column layout,
 * the 44px floor, and the ticket pinned to the bottom right where a waiter's
 * thumb already is.
 *
 * @see BillTotals on the API for the arithmetic this screen refuses to repeat
 */

/** What the API answers with after any change to a bill. */
type Bill = {
  id: number;
  number: string;
  channel: string;
  status: string;
  table_label: string | null;
  guests_count: number;
  subtotal: number;
  discount_total: number;
  service_charge: number;
  delivery_fee: number;
  vat_included: number;
  total: number;
  /** Whose tab, when there is one. `credit` cannot be taken without it. */
  customer_id: number | null;
  lines: BillLine[];
  /**
   * The whole family, on the answer to a split by money.
   *
   * Only `ways` and `amount_tiyin` produce it: the server mints the siblings
   * itself, so the count is a fact the till has no other way of knowing —
   * `ways` is what was *asked* for and `BillSplit` is what was *done*. The
   * parent is first and the list is in payment order, which is the order the
   * cashier reads them out and prints them.
   *
   * Absent on a split by dish, which answers with the one new bill.
   */
  split?: Bill[];
};

type BillLine = {
  id: number;
  title: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  note: string | null;
  seat_no: number;
  bill_no: number;
  modifiers: { option_id: number | null; title: string; price_delta: number }[];
};

/** What arrives on `branch.{id}.orders` when a cook moves a docket. */
type TicketMovedEvent = { order_id: number; station: string; status: string };

/**
 * The five writes that change a bill without adding a dish.
 *
 * Named rather than written inline because a refused one is *held* — see
 * `needsManager` — and replayed verbatim once a manager has signed it, so the
 * verb has to survive a round trip through state with its type intact.
 */
type BillAction = 'void-line' | 'discount' | 'split' | 'merge' | 'transfer';

const BILLS = [1, 2, 3, 4] as const;

/**
 * The kitchen's states in the order a docket passes through them.
 *
 * Used to answer one question — how far along is the *whole* table — by taking
 * the least advanced station. A recalled ticket sits back at `cooking` rather
 * than getting a rung of its own: for a waiter it means the same thing as
 * cooking, which is "not yet".
 */
const FIRE_LADDER = ['new', 'accepted', 'cooking', 'recalled', 'ready', 'served'] as const;

/** How far along the slowest station is, or null if nothing has moved. */
function slowest(stations: Record<string, string> | undefined): string | null {
  const heard = Object.values(stations ?? {});

  if (heard.length === 0) return null;

  return heard.reduce((worst, status) => (rung(status) < rung(worst) ? status : worst));
}

function rung(status: string): number {
  const at = FIRE_LADDER.indexOf(status as (typeof FIRE_LADDER)[number]);

  // A state this screen has not been taught about is treated as the earliest
  // rung. Erring towards "not ready" keeps a waiter from collecting a plate that
  // is not there; the reverse mistake is a cold table.
  return at === -1 ? 0 : at;
}

export function OrderScreen({
  sections,
  tables,
  who,
  terminal,
  branchId,
  discountCeiling,
  realtimeConfig,
  rates = null,
}: {
  sections: PosSection[];
  tables: PosTable[];
  who: string | null;
  terminal: string | null;
  /**
   * The largest discount this person may apply here without an approval.
   *
   * The server's number for this person at this till, not the plan's floor: a
   * waiter is 0, a cashier 5, a manager 20, an owner 100, and a venue may edit
   * all four. Drawn, never enforced — above the ceiling the chip is still
   * offered and opens an approval instead, which is the design's whole flow.
   */
  discountCeiling: number;
  /** The room this till stands in — the channel the kitchen answers on. */
  branchId: number | null;
  /** How to reach the broadcaster. Null when none is configured. */
  realtimeConfig: RealtimeConfig | null;
  /**
   * The venue's own VAT and service rates — `fetchBillRates()`.
   *
   * Used for the two labels and for nothing else: every figure on this screen
   * still comes down from `BillTotals::of()`, because a till that could work
   * out a total could disagree with the receipt in front of a guest.
   *
   * `null` when the till may not read settings, which is the ordinary case for
   * a cashier. The labels then omit the rate, which is what they did before
   * this prop existed and is correct in every configuration.
   */
  rates?: BillRates | null;
}) {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  /*
   * A second reader over the same namespace, for the two labels that take a
   * number.
   *
   * `m` is the raw catalogue object and is right for the hundred plain strings
   * on this screen; an ICU message with a placeholder has to go through
   * `next-intl` to be formatted, and `keys-in-use.test.ts` only sees a key that
   * is written as `pos('…')`.
   */
  const pos = useTranslations('console.pos');
  const common = messages.console.common;
  const shell = messages.console.shell;
  const locale = useLocale() as 'uz' | 'ru' | 'en';
  /* `K` goes to the pass. A router push rather than `location.assign`, so the
     till keeps its client state and the shift cookie is not re-read. */
  const router = useRouter();

  const [bill, setBill] = useState<Bill | null>(null);
  const [opening, setOpening] = useState(false);
  /*
   * Null means "whichever is first", resolved at render rather than copied into
   * state. A version of this seeded the state from `sections[0]` and then kept
   * an effect to fix it up when the sections arrived — but they arrive as props
   * from a server render, so the effect only ever caused a second render for
   * nothing.
   */
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [seat, setSeat] = useState(1);
  const [billNo, setBillNo] = useState(1);
  const [asking, setAsking] = useState<{ dish: PosDish; questions: PosQuestion[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /*
   * What to ask the guest for, straight from the API.
   *
   * Kept beside the bill rather than derived from it, because the rounded cash
   * figure is a server number and this screen must never compute one. Every bill
   * response carries it, so it is current after each line added — a payment sheet
   * opened from a stale figure would quote the wrong amount to a guest.
   */
  const [payable, setPayable] = useState<PosPayable | null>(null);
  const [paying, setPaying] = useState(false);

  /*
   * Which sheet is open, and on what.
   *
   * Four actions the cart had none of — a discount, a move, a void, and the
   * request that goes to a manager when the server refuses one of them. The
   * copy for all four has been in the catalogue since the screen was drawn
   * (`split`, `transfer`, `discount`, `remove`, `toastDiscount`,
   * `needsApproval`) and nothing read any of it.
   */
  const [discounting, setDiscounting] = useState(false);
  const [moving, setMoving] = useState<MoveKind | null>(null);
  const [voiding, setVoiding] = useState<BillLine | null>(null);
  const [asked, setAsked] = useState(false);
  /** The refusal a manager could lift, kept so the request can name it. */
  /** Which off-premise channel the waiter picked, while the form is open. */
  const [offPremise, setOffPremise] = useState<'takeaway' | 'delivery' | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  /*
   * The queue drawer, held here because three controls open it: the badge in
   * the header, the health strip's *Navbatni ko'rish*, and — when the queue is
   * empty — nothing else would, since the badge hides itself at zero.
   */
  const [syncOpen, setSyncOpen] = useState(false);
  /** The health strip's diagnosis panel, tracked only so the keyboard mutes. */
  const [diagnosing, setDiagnosing] = useState(false);
  const [zone, setZone] = useState('all');

  const [needsManager, setNeedsManager] = useState<{
    action: BillAction;
    payload: Record<string, unknown>;
    /**
     * The request a manager has to sign, if the API named one.
     *
     * Null on an older answer that carried no `meta.approval_id`, and the two
     * lead to different buttons: with an id the manager can settle it here on
     * four digits, without one the till can only raise the request and wait.
     */
    approvalId: number | null;
  } | null>(null);

  /** The keypad, while a manager is standing at the till answering. */
  const [approving, setApproving] = useState<{
    approvalId: number;
    action: BillAction;
    payload: Record<string, unknown>;
  } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  /*
   * What the kitchen has done, by bill and then by station.
   *
   * Two levels, and both earn themselves. **By bill**, because a waiter has four
   * tables going and walks back to a screen that should already know which of
   * them is ready — and because keying it this way is what lets the subscription
   * below ignore which bill happens to be open, and so never re-authorise a
   * channel when the waiter switches tables.
   *
   * **By station**, because a table is served together: the grill says "ready"
   * while the bar has not started, and a chip reading "ready" then would send a
   * waiter to collect half a table. `slowest()` takes the least advanced of them,
   * which is the honest answer to "can I go and get it".
   *
   * Empty for a bill the kitchen has not touched. That is not the same as "not
   * sent" — the bill's own status says that — and the two are drawn differently.
   */
  const [kitchen, setKitchen] = useState<Record<number, Record<string, string>>>({});

  /*
   * What this kitchen has run out of.
   *
   * Ids in a Set rather than a flag rewritten onto the sections, because the
   * sections are props from a server render and copying a hundred dishes to change
   * one boolean is a hundred objects a waiter's tablet did not need to allocate.
   * Seeded from what the server drew, then kept by the stop-list channel.
   */
  const [stopped, setStopped] = useState<ReadonlySet<number>>(() => stoppedIn(sections));
  /* A fresh `sections` after the poll's `router.refresh()` carries the 86 sheet as it is now. */
  const [seenSections, setSeenSections] = useState(sections);
  if (seenSections !== sections) {
    setSeenSections(sections);
    setStopped(stoppedIn(sections));
  }

  const money = useCallback((tiyin: number) => formatTiyinAmount(tiyin, locale), [locale]);

  /*
   * The till's own vocabulary, in the reader's language.
   *
   * `console.pos` carries everything this screen draws; `pos-copy.ts` carries
   * the sentences the design's `flash()` says and the catalogue never had.
   */
  const word = useCallback((phrase: Parameters<typeof say>[1]) => say(locale, phrase), [locale]);

  /*
   * Hand the till back, without ending the shift.
   *
   * `dc.html:6408` gives the header a lock that is a *separate* control from the
   * one carrying the cashier's name, and the two do different things: this drops
   * the person, `posSwitchUser` picks a different one. Both leave the drawer
   * exactly where it was — the cash shift belongs to the terminal, and a shift
   * closed by a screen lock would be a Z report nobody asked for.
   *
   * `DELETE /api/pos/pin` clears the shift cookie and the "count it later" note.
   * The refresh is what makes `/pos` re-decide: no shift session, so the idle
   * screen, which is where the design's `posLock` lands (`dc.html:11897`).
   */
  async function lock() {
    try {
      await fetch('/api/pos/pin', { method: 'DELETE' });
    } catch {
      // The cookie may not have been cleared, so the navigation below may land
      // back on the work screen. That is the honest outcome of a failed lock and
      // it is visible — better than a screen that looks locked and is not.
    }

    router.push('/pos');
    router.refresh();
  }

  /** Open a bill on a table, or a takeaway with no table at all. */
  async function open(
    table: PosTable | null,
    offPremise?: {
      channel: 'takeaway' | 'delivery';
      phone: string;
      name: string;
      address: string;
      customerId: number | null;
    },
  ) {
    if (opening) return;

    setOpening(true);
    setFailed(null);
    setOutcome(null);

    try {
      const response = await fetch('/api/pos/bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /*
           * Three channels, not two. A takeaway and a delivery differ on the
           * bill — a delivery carries a fee and an address and a takeaway does
           * not — and the till used to collapse both into `takeaway`, which
           * meant every delivery was priced as a collection.
           */
          channel: offPremise?.channel ?? (table === null ? 'takeaway' : 'dine_in'),
          table_id: table?.id ?? null,
          table_label: table?.label ?? null,
          guests: table?.seats ?? 1,
          /*
           * The customer's **id**, not their name.
           *
           * `OpenBillRequest` takes `customer_id` and drops anything else, so
           * sending a phone number and a name would be sending fields the
           * server silently ignores — the bill would open anonymously and the
           * guest's points would not move. The sheet looks the number up and
           * hands over what it found; a first-time caller opens without one,
           * which is the honest outcome rather than a fabricated record.
           */
          ...(offPremise?.customerId == null ? {} : { customer_id: offPremise.customerId }),
        }),
      });

      if (!response.ok) {
        setFailed(m.lineFailed);
        setOpening(false);

        return;
      }

      const body = (await response.json()) as { data: Bill; payable?: PosPayable };
      setBill(body.data);
      setPayable(body.payable ?? null);
    } catch {
      setFailed(m.lineFailed);
    } finally {
      setOpening(false);
    }
  }

  /**
   * Ring up a dish.
   *
   * The modifier ids go up as ids and come back priced — see the API's
   * `priceChoices`. Nothing here knows what a modifier costs, which is why
   * nothing here can get it wrong.
   */
  async function add(dish: PosDish, choiceIds: number[] = [], note = '') {
    if (bill === null || busy) return;

    setBusy(true);
    setFailed(null);

    /*
     * One id for this action, minted before the network is involved.
     *
     * It goes up with the request and, if the request never lands, onto the
     * queue entry — so the replay carries the id the server would have seen the
     * first time. Minting it inside the route handler, as this used to, meant a
     * retried tap was a *new* action to the server and the line was added
     * twice.
     */
    const localId = crypto.randomUUID();

    try {
      const response = await fetch(`/api/pos/bill?bill=${bill.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pos-Local-Id': localId },
        body: JSON.stringify({
          menu_item_id: dish.id,
          quantity: 1,
          seat_no: seat,
          bill_no: billNo,
          modifiers: choiceIds,
          /* Only when there is one — an empty string is not a note. */
          ...(note === '' ? {} : { note }),
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        data?: Bill;
        payable?: PosPayable;
        message?: string;
      } | null;

      if (!response.ok || body?.data === undefined) {
        setFailed(body?.message ?? m.lineFailed);
        flash.problem(body?.message ?? m.lineFailed);

        return;
      }

      setBill(body.data);
      setPayable(body.payable ?? null);
    } catch {
      /*
       * The request never reached anybody — the router is down, not the API.
       *
       * This used to say "the line failed" and drop it, and dropping it is the
       * one thing that must not happen: the waiter has told the guest, the
       * kitchen is about to be told, and the till is the only thing that knows.
       * So it goes on the local queue and the badge counts it. `catch` and not
       * the `!response.ok` branch above, deliberately — a refusal that reached
       * the server is an answer, and queueing it would replay a write the API
       * has already declined.
       */
      if (terminal !== null) {
        const held = enqueue(
          terminal,
          'bill.line.add',
          {
            bill_id: bill.id,
            menu_item_id: dish.id,
            quantity: 1,
            seat_no: seat,
            bill_no: billNo,
            modifiers: choiceIds,
            ...(note === '' ? {} : { note }),
          },
          localId,
        );

        /*
         * The line is shown as if it landed, because for the guest it has: they
         * ordered it and it is going to be cooked. The bill total is left alone
         * — this client does not price anything, and inventing a total here is
         * the one way to make the phone and the receipt disagree. It corrects
         * itself the moment the queue drains.
         */
        setBill({
          ...bill,
          lines: [
            ...bill.lines,
            {
              /*
               * A negative id, from the queue's own sequence.
               *
               * Negative because every real line id is positive, so nothing can
               * mistake this for a row the server knows about — and from
               * `local_seq` rather than a clock, because a clock read during a
               * render is impure and because two lines rung up in the same
               * millisecond would collide on a key.
               */
              id: -held.local_seq,
              title: dish.title,
              quantity: 1,
              unit_price: dish.price_tiyin,
              total_price: dish.price_tiyin,
              status: 'queued',
              note: null,
              seat_no: seat,
              bill_no: billNo,
              modifiers: [],
            },
          ],
        });

        /*
         * Said out loud, not written in the red banner.
         *
         * The banner used to read "the line could not be added" over a line
         * that had just been added to the ticket — the one message on this
         * screen that contradicted what was on screen beside it. A queued line
         * is a promise kept, so it gets the toast the design gives every
         * successful action and the queue badge keeps the count.
         */
        flash(word(POS_COPY.sendQueued));
      } else {
        setFailed(m.lineFailed);
        flash.problem(m.lineFailed);
      }
    } finally {
      setBusy(false);
      setAsking(null);
    }
  }

  /** Tapping a dish: ask first if there is anything to ask, otherwise ring it. */
  async function tap(dish: PosDish) {
    if (busy) return;

    if (stopped.has(dish.id)) {
      // The tile is already disabled, so this is the race: a stop arriving between
      // a waiter's finger landing and the handler running. Saying so is better than
      // a request the API will refuse with a sentence about a dish the waiter can
      // still see on screen.
      setFailed(m.stopped);
      flash.problem(fill(word(POS_COPY.dishStopped), { name: dish.title }));

      return;
    }

    try {
      const response = await fetch(`/api/pos/menu?menu_item=${dish.id}`, { cache: 'no-store' });

      if (!response.ok) {
        // The questions could not be read. Adding it anyway would put a line on
        // the bill that the kitchen cannot cook to — refuse and say so.
        setFailed(m.lineFailed);

        return;
      }

      const body = (await response.json()) as { questions: PosQuestion[] };

      if (body.questions.length === 0) {
        // One tap, no sheet. Most dishes are like this and the design's
        // "bir teginishda qo'shish" is about exactly them.
        await add(dish);

        return;
      }

      setAsking({ dish, questions: body.questions });
    } catch {
      setFailed(m.lineFailed);
    }
  }

  /**
   * One more of the same thing.
   *
   * The dish id comes off the line rather than out of the menu, so a repeat
   * carries the same modifiers the guest asked for the first time — "no onion"
   * on the first plate and not on the second is the mistake this exists to
   * avoid. Falls back to the plain dish when the line has no options.
   */
  async function repeat(line: BillLine) {
    const dish = sections
      .flatMap((section) => section.dishes)
      .find((entry) => entry.title === line.title);

    if (dish === undefined) return;

    await add(
      dish,
      line.modifiers
        .map((modifier) => modifier.option_id)
        .filter((id): id is number => id !== null),
    );
  }

  /**
   * The five writes that change a bill without adding a dish.
   *
   * One function because they are one request with a different body, and one
   * error path because they fail the same three ways: the server refused, the
   * server needs a manager, or the router is down. The last of those is *not*
   * queued offline — unlike adding a line, none of these is a promise already
   * made to a guest, and replaying a discount from a queue an hour later would
   * apply it to a bill somebody has already paid.
   *
   * Answers with the bill the API returned rather than a bare `true`, because
   * one of the five says something the caller cannot work out for itself: a
   * split by money comes back carrying its whole family, and the number of
   * bills a table is now settling is the number the server made, not the number
   * the sheet asked for. `null` is the refusal, and every caller reads it as
   * one.
   */
  async function act(action: BillAction, payload: Record<string, unknown>): Promise<Bill | null> {
    if (bill === null || busy) return null;

    setBusy(true);
    setFailed(null);
    setAsked(false);

    try {
      const response = await fetch('/api/pos/bill/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, bill_id: bill.id, ...payload }),
      });

      const body = (await response.json().catch(() => null)) as {
        data?: Bill;
        payable?: PosPayable;
        message?: string;
        code?: string;
        /** The request the gate raised when it refused. See BillController::gate(). */
        approvalId?: number | null;
      } | null;

      if (!response.ok || body?.data === undefined) {
        setFailed(body?.message ?? m.lineFailed);

        /*
         * A refusal a manager can lift, told apart from one nobody can.
         *
         * The API's own code says which: `pos.approval_required` means the
         * action is legal and this person may not do it alone, and that is the
         * only case where offering the manager button is honest. Offering it on
         * "this bill is closed" would send a waiter to find a manager who then
         * cannot help either.
         */
        if (body?.code === 'pos.approval_required') {
          setNeedsManager({ action, payload, approvalId: body.approvalId ?? null });
        }

        flash.problem(body?.message ?? m.lineFailed);

        return null;
      }

      setBill(body.data);
      setPayable(body.payable ?? null);

      return body.data;
    } catch {
      setFailed(m.offlineHeld);
      flash.problem(m.offlineHeld);

      return null;
    } finally {
      setBusy(false);
    }
  }

  /**
   * What the till says after a bill has come apart.
   *
   * Shared by all three buttons on the split sheet because the answer to all
   * three is the same question — how many bills is this table settling now —
   * and only the server can answer it. The count is read off `split`, the
   * family the API minted; the sheet's own `ways` is what was *asked* for, and
   * a screen that reported that would be reporting an intention as an outcome.
   *
   * A split by dish carries no family: it moves lines onto exactly one new
   * bill, so the answer is always two — the bill that was split and the one
   * that took the dishes. Two is a fact about the endpoint there, not a guess.
   *
   * `null` is the refusal, and it deliberately does nothing: `act()` has
   * already put the API's own sentence in the banner and said it out loud, and
   * the sheet stays open on the picks the waiter made so they can fix it.
   */
  function splitLanded(done: Bill | null) {
    if (done === null) return;

    setMoving(null);
    setOutcome(m.moveDone);
    flash(fill(word(POS_COPY.splitDone), { n: String(done.split?.length ?? 2) }));
  }

  /**
   * Raise the request and wait, for the manager who is somewhere else.
   *
   * The fallback door, and it is only reached when the refusal named no
   * approval: `ApprovalGate` raises the request itself when it refuses, so the
   * usual case already has an id and goes to the keypad below instead. When it
   * does not, this puts one in the queue — the manager answers from their own
   * phone or console against `POST /pos/approvals/{id}/decide`, on their own
   * token, and the answer arrives on the realtime channel.
   *
   * The manager who *is* standing at the till is the other door and no longer
   * a promise: `POST /pos/approvals/{id}/pin` takes four digits typed on this
   * tablet, checks `pos.approve` against the person whose PIN it was, and
   * refuses if that person is the one who asked. See `approval-sheet.tsx`.
   */
  async function askManager(reason: string) {
    if (bill === null || needsManager === null) return;

    const { action } = needsManager;

    try {
      await fetch('/api/pos/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action === 'discount' ? 'discount' : 'void_line',
          reason,
          subject_type: 'bill',
          subject_id: bill.id,
        }),
      });

      setAsked(true);
      setNeedsManager(null);
      flash(m.askedManager);
    } catch {
      setFailed(m.lineFailed);
      flash.problem(m.lineFailed);
    }
  }

  /**
   * Send it, and let the kitchen start.
   *
   * The one call in this screen that another human acts on. Everything else can
   * be undone with a tap; a docket on the pass has a cook reading it within
   * seconds, so the button says where the food is going rather than "OK".
   *
   * Re-sending an edited bill is normal — a guest orders dessert after the mains
   * — and the API updates the existing docket rather than adding a second one to
   * the pass. So the button stays live after the first send.
   */
  async function send() {
    if (bill === null || sending) return;

    const sendable = bill.lines.filter((line) => line.status !== 'cancelled');

    if (sendable.length === 0) {
      setFailed(m.sendEmpty);
      flash.problem(m.sendEmpty);

      return;
    }

    setSending(true);
    setFailed(null);

    const localId = crypto.randomUUID();

    try {
      const response = await fetch(`/api/pos/send?bill=${bill.id}`, {
        method: 'POST',
        headers: { 'X-Pos-Local-Id': localId },
      });
      const body = (await response.json().catch(() => null)) as {
        data?: Bill;
        payable?: PosPayable;
        message?: string;
      } | null;

      if (!response.ok || body?.data === undefined) {
        setFailed(body?.message ?? m.sendFailed);
        flash.problem(body?.message ?? m.sendFailed);

        return;
      }

      setPayable(body.payable ?? null);

      /*
       * The count, not the word "sent" — `dc.html:17441`.
       *
       * A waiter who fired four plates and reads "4 pozitsiya oshxonaga
       * yuborildi" has confirmation that the docket the kitchen is holding is
       * the docket they meant. Portions rather than lines, because two of the
       * same dish is what the cook has to make twice.
       */
      flash(
        fill(word(POS_COPY.sendDone), {
          n: String(sendable.reduce((count, line) => count + line.quantity, 0)),
        }),
      );

      /*
       * The kitchen's progress is cleared, not kept.
       *
       * A re-send rewrites the docket, so whatever the cook had done to the old
       * one is no longer what is in front of them. Keeping an amber chip across a
       * re-send would tell the waiter the kitchen had accepted an order it has
       * only just been handed.
       */
      setKitchen((current) => ({ ...current, [bill.id]: {} }));
      setBill(body.data);
    } catch {
      /*
       * The router is down, not the API — and a send is the one action a
       * waiter has already promised out loud. It was dropped here: the tap
       * failed, the message said so, and the order stayed unsent while the
       * guest waited for food nobody had been told about.
       *
       * Queued now, with the id this attempt already carried, so the replay is
       * the same action rather than a second docket. `catch` and not the
       * `!response.ok` branch above, deliberately — a refusal that reached the
       * server is an answer, and queueing it would replay a write the API has
       * already declined.
       */
      if (terminal !== null) {
        enqueue(terminal, 'bill.send', { bill_id: bill.id }, localId);
        setFailed(m.offlineHeld);
        flash(word(POS_COPY.sendQueued));
      } else {
        setFailed(m.sendFailed);
        flash.problem(m.sendFailed);
      }
    } finally {
      setSending(false);
    }
  }

  /**
   * What happened after the money.
   *
   * A settled bill takes the waiter back to the floor: the table is done, and
   * leaving a paid bill on screen is how a second guest gets charged for the first
   * one's meal. A PART payment leaves it open on purpose — a deposit, one guest of
   * four paying early — and says what is left, because the alternative is a cashier
   * who thinks the settlement failed and takes the whole amount again.
   */
  function settled(result: Settlement) {
    setPaying(false);

    if (!result.settled) {
      const partial = m.payPartial.replace(
        '{sum}',
        money(Math.max(0, result.due - result.applied)),
      );

      setOutcome(partial);
      flash(partial);

      // Re-read so the ticket shows what has been paid against it.
      void reload();

      return;
    }

    /*
     * What happened to the receipt, said out loud.
     *
     * The design ends a sale with the fiscal acknowledgement and the till ended
     * it with the change. Nothing here claims a fiscal sign — `TenderService`
     * does not register one yet, so claiming one would be the single most
     * expensive lie this screen could tell — but a cashier is told the receipt
     * is queued and that the window is twenty-four hours, which is the true
     * state and the one they can answer a tax inspector with.
     */
    const closed = `${result.change > 0 ? m.payChangeDue.replace('{sum}', money(result.change)) : m.payDone} · ${m.fiscalQueuedNote}`;

    setOutcome(closed);

    /*
     * The design ends a sale with a toast and the till ended it with a green
     * block on a screen the cashier is about to leave — `dc.html:17491`. Both:
     * the block is what stays behind while they count out change, the toast is
     * what tells them the drawer took it.
     */
    flash(closed);

    /*
     * The change stays on screen after the bill is cleared.
     *
     * It is the last thing the cashier needs and the first thing that would be lost
     * by navigating away — a waiter who has closed the screen and cannot remember
     * whether they handed back 3 000 or 5 000 has no way to find out.
     */
    setBill(null);
    setPayable(null);
    setKitchen({});
  }

  /** Re-read the bill after a part payment, so the ticket agrees with the drawer. */
  async function reload() {
    if (bill === null) return;

    try {
      const response = await fetch(`/api/pos/bill?bill=${bill.id}`, { cache: 'no-store' });

      if (!response.ok) return;

      const body = (await response.json()) as { data?: Bill; payable?: PosPayable };

      if (body.data !== undefined) setBill(body.data);
      setPayable(body.payable ?? null);
    } catch {
      // The bill is still on screen with what it had. A part payment that has been
      // recorded is not undone by a failed re-read, and saying nothing is better
      // than an error about a request the cashier did not make.
    }
  }

  /*
   * The stranded-shift badge, built once and rendered by whichever header is on
   * screen.
   *
   * Null when the till is not paired: the queue is scoped to a terminal code
   * (see `pos-queue.ts`), and a queue with no terminal to belong to would be
   * replayed under whichever till this tablet is paired to next — a night's
   * sales attributed to the wrong drawer.
   */
  const syncBadge =
    terminal === null ? undefined : (
      <SyncPanel
        terminal={terminal}
        m={m as unknown as Parameters<typeof SyncPanel>[0]['m']}
        open={syncOpen}
        onOpenChange={setSyncOpen}
        onBillChanged={(billId) => {
          // A drain touched a bill. If it is the one on screen, reread it rather
          // than leaving a cashier looking at a total that has moved underneath.
          if (bill !== null && bill.id === billId) void reload();
        }}
      />
    );

  /*
   * The kitchen answering back.
   *
   * `branch.{id}.orders` is the floor's channel, deliberately not the kitchen's:
   * a pass sees every line of every docket and a waiter needs to know when one of
   * theirs moved. Both events on it are moves, which is all this screen draws.
   *
   * Subscribed for the whole shift rather than per bill. A waiter opens and
   * closes forty bills in an evening, and re-authorising a channel on each one is
   * forty round trips to be told the same thing — so the filter is on the
   * message, by order id, and the socket is left alone.
   */
  /*
   * Fifteen seconds while the socket is down. What the till learns from the
   * refresh is the server side of this screen — open bills, the 86 sheet, the
   * floor — not the cart, which is client state and stays exactly as typed.
   */
  usePollWhileOffline(realtimeConfig, 15_000);

  useEffect(() => {
    if (branchId === null) return;

    const echo = realtime(realtimeConfig);

    if (echo === null) return;

    const room = `branch.${branchId}.orders`;

    echo.private(room).listen('.kitchen.ticket.moved', (event: TicketMovedEvent) => {
      // Recorded whichever bill it belongs to. Most of what arrives on a room's
      // channel is somebody else's table, and it is still this waiter's business
      // if they walk back to it in five minutes.
      setKitchen((current) => ({
        ...current,
        [event.order_id]: { ...current[event.order_id], [event.station]: event.status },
      }));
    });

    /*
     * 86, from the kitchen, while the waiter is mid-order.
     *
     * The plan's own test for this feature: a chef marks Manti on the wall screen
     * and two waiters watch the tile go dashed without touching anything. Nothing
     * is refetched — the message names the dish and says which way — so a stop
     * costs one frame on every tablet rather than one request from each.
     *
     * The tile going dashed is not the enforcement. A line for a stopped dish is
     * refused by the API, which is what covers the tablet that was asleep, the
     * offline queue draining later, and the aggregator that never had a tile.
     */
    const stoplist = echo.private(`branch.${branchId}.stoplist`);

    stoplist.listen('.menu.dish.stopped', (event: { dish_id: number }) => {
      setStopped((current) => new Set(current).add(event.dish_id));
    });

    stoplist.listen('.menu.dish.resumed', (event: { dish_id: number }) => {
      setStopped((current) => {
        const next = new Set(current);

        next.delete(event.dish_id);

        return next;
      });
    });

    return () => {
      // Left, not disconnected: the connection is shared, and a second screen
      // on this tablet may still be using it.
      echo.leave(room);
      echo.leave(`branch.${branchId}.stoplist`);
    };
  }, [branchId, realtimeConfig]);

  /* ---- the floor, and what 1–9 reaches on it ---- */

  /*
   * The zones this branch actually has, in the order the API returned tables.
   *
   * Derived rather than fetched: `GET /tables/tables` already carries each
   * table's hall, and a second request for the hall list would be a round trip
   * a waiter waits through to draw four chips.
   */
  const zones = tables.reduce<{ key: string; label: string }[]>((list, table) => {
    const key = zoneKey(table);

    if (key !== '' && !list.some((entry) => entry.key === key)) {
      list.push({ key, label: table.zone.name ?? `#${key}` });
    }

    return list;
  }, []);

  const shownTables = zone === 'all' ? tables : tables.filter((table) => zoneKey(table) === zone);

  /*
   * The lines on the tab in front of the waiter.
   *
   * Computed before the keyboard rather than beside the ticket, because `+` and
   * `−` reach the last of them and the listener is bound up here. `[]` when no
   * bill is open, which is the honest answer and what the empty-ticket flash
   * keys on.
   */
  const onThisBill =
    bill === null
      ? []
      : bill.lines.filter((line) => line.bill_no === billNo && line.status !== 'cancelled');

  /*
   * How many of the four tabs actually hold something.
   *
   * Only used to decide whether the table has been split, which is the one
   * condition under which the design shows `pMultiNote` — a note about "the
   * other bills" over a table with no other bills is noise on the screen a
   * cashier reads while a guest waits.
   */
  const billsInUse =
    bill === null
      ? 0
      : new Set(
          bill.lines.filter((line) => line.status !== 'cancelled').map((line) => line.bill_no),
        ).size;

  /*
   * The keyboard, bound — `FOUNDATIONS §11` and `dc.html:11049–11070`.
   *
   * A till in this market is a tablet with a keypad beside it, and the design
   * lists nine shortcuts. Four of them were bound and the sheet listed all
   * nine, which is worse than binding none: a waiter who reads "1 – 9 · pick a
   * table" and presses 3 learns that the printed list lies, and stops trusting
   * the rest of it.
   *
   * The five that were missing are the fast ones — the digits, `+`, `−` and the
   * pass. Every one of them reaches a control that is already on screen, which
   * is the design's own mechanism: its handler literally clicks
   * `[data-kbdtable]`, `[data-kbdcat]`, `[data-kbdinc]`, `[data-kbddec]`. Doing
   * the same work twice, once for the finger and once for the key, is how the
   * two drift apart.
   *
   * Two rules keep it out of the way. Nothing fires while a text field has
   * focus — a waiter typing a guest's name must be able to type `p` — and
   * nothing fires while an overlay is open, because the overlay has its own
   * keys and stealing Enter from a keypad would confirm a payment somebody was
   * still reading.
   */
  const keys = useRef<{
    bill: Bill | null;
    sending: boolean;
    payable: PosPayable | null;
    /** What `+` and `−` reach — the last of these is the line they act on. */
    onThisBill: BillLine[];
    /** What the digits reach on the floor, after the zone filter. */
    tables: PosTable[];
    /** What the digits reach once a bill is open. */
    sections: PosSection[];
    send: () => Promise<void>;
    open: (table: PosTable) => Promise<void>;
    repeat: (line: BillLine) => Promise<void>;
  }>({
    bill,
    sending,
    payable,
    onThisBill,
    tables: shownTables,
    sections,
    send: () => Promise.resolve(),
    open: () => Promise.resolve(),
    repeat: () => Promise.resolve(),
  });

  useEffect(() => {
    const typing = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;

      return (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;

      if (event.key === '?') {
        event.preventDefault();
        setShortcuts(true);

        return;
      }

      if (event.key === 'Escape') {
        setShortcuts(false);
        setOffPremise(null);
        setDiscounting(false);
        setMoving(null);
        setVoiding(null);

        return;
      }

      /*
       * The rest need a quiet screen.
       *
       * Every overlay, not just the four that write: the shortcuts sheet and
       * the off-premise form count too. Pressing `3` over an open sheet used to
       * reach past it and open table 3 underneath — the waiter closed the sheet
       * and found a bill they had not meant to start.
       */
      const state = keys.current;

      if (
        asking !== null ||
        paying ||
        discounting ||
        moving !== null ||
        voiding !== null ||
        shortcuts ||
        syncOpen ||
        diagnosing ||
        offPremise !== null
      ) {
        return;
      }

      /* The pass, without walking to it. Global rather than per-bill: a waiter
         checking whether table 6 is plated has usually just closed one. */
      if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        router.push('/kitchen');

        return;
      }

      /*
       * 1–9 — the floor first, the menu once a bill is open.
       *
       * The design's own precedence (`dc.html:11053`): it looks for table tiles
       * and falls back to category tiles, which is the same thing said in DOM
       * terms, because only one of the two is ever on screen.
       */
      if (/^[1-9]$/.test(event.key)) {
        const at = Number(event.key) - 1;

        if (state.bill === null) {
          const table = state.tables[at];

          if (table !== undefined) {
            event.preventDefault();
            void state.open(table);
          }

          return;
        }

        const section = state.sections[at];

        if (section !== undefined) {
          event.preventDefault();
          setSectionId(section.id);
        }

        return;
      }

      if (state.bill === null) return;

      if (event.key === 'Enter' && !state.sending) {
        event.preventDefault();
        /* Through the ref, so the listener binds once — re-binding on every
           render is how a keypress lands between remove and add. */
        void state.send();

        return;
      }

      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();

        /* The button is disabled on an empty ticket and the key must agree with
           it — otherwise `P` opens a payment sheet quoting a total nobody
           ordered. `dc.html:17445` says the same thing in a flash. */
        if (state.payable === null || state.onThisBill.length === 0) {
          flash.problem(word(POS_COPY.payNothing));

          return;
        }

        setPaying(true);

        return;
      }

      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        setBill(null);

        return;
      }

      /*
       * `+` and `−` act on the last line, which is the line the waiter has just
       * rung up — the one a guest amends while it is still in their mouth.
       *
       * `+` repeats it with its modifiers rather than editing a quantity,
       * because that is the only write the API offers and the honest one: a
       * second portion is a second thing to cook. `−` opens the void prompt,
       * because the ledger needs a reason before food leaves a bill.
       */
      const last = state.onThisBill[state.onThisBill.length - 1];

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();

        if (last === undefined) {
          flash.problem(word(POS_COPY.ticketEmpty));

          return;
        }

        void state.repeat(last);

        return;
      }

      if (event.key === '-' || event.key === 'Backspace') {
        if (last === undefined) return;

        event.preventDefault();
        setVoiding(last);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    asking,
    paying,
    discounting,
    moving,
    voiding,
    shortcuts,
    syncOpen,
    diagnosing,
    offPremise,
    router,
    word,
  ]);

  useEffect(() => {
    keys.current = {
      bill,
      sending,
      payable,
      onThisBill,
      tables: shownTables,
      sections,
      send,
      open,
      repeat,
    };
  });

  if (bill === null) {
    return (
      <div className="flex h-dvh flex-col">
        <OrderHeader
          m={m}
          shell={shell}
          who={who}
          terminal={terminal}
          sync={syncBadge}
          onShortcuts={() => setShortcuts(true)}
          onLock={() => void lock()}
        />

        <OfflineBanner onSeeQueue={() => setSyncOpen(true)} />

        <div data-scroll className="min-h-0 flex-1 p-6">
          <div className="mx-auto max-w-[900px]">
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight">
              {m.pick}
            </h2>
            <p className="text-fg-muted text-md mt-2">{m.pickSub}</p>

            {failed !== null ? (
              <p
                role="alert"
                className="bg-danger-50 text-danger-700 mt-5 rounded-[12px] px-4 py-3 text-sm font-medium"
              >
                {failed}
              </p>
            ) : null}

            {/*
             * The change, still on screen after the bill has gone.
             *
             * It is the last thing the cashier needs and the first thing that would
             * be lost by clearing the ticket — somebody who has closed the screen
             * and cannot remember whether they handed back 3 000 or 5 000 has no way
             * to find out. It stays until they open the next table.
             */}
            {outcome !== null ? (
              <p
                role="status"
                className="bg-success-50 text-success-700 mt-5 rounded-[12px] px-4 py-3 text-base font-semibold"
              >
                {outcome}
              </p>
            ) : null}

            {/*
             * The legend, and it is not decoration.
             *
             * Every tile used to be drawn identically, so a waiter walking up
             * to this screen could not tell a free table from one another
             * waiter had already seated. That is the mistake this whole screen
             * exists to prevent: two orders opened on table 12 is one guest
             * charged for another's meal.
             */}
            {/*
             * The zone rail — `specs/01-os.md §5.19`.
             *
             * A dining room is not one grid. A waiter working the terrace wants
             * the terrace, and on a floor of forty tables scanning past the
             * hall to find table T4 is the difference between walking to a
             * table and hunting for one. The counts beside each zone are what
             * make it worth the row: "Terrassa 3/8" is the answer to the only
             * question a host has when they look at this screen.
             *
             * Drawn only when there is more than one zone. A filter with a
             * single option is furniture, and a restaurant with one room should
             * not be given a control that does nothing.
             */}
            {zones.length > 1 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {[{ key: 'all', label: m.floorAllZones }, ...zones].map((entry) => {
                  const inZone =
                    entry.key === 'all'
                      ? tables
                      : tables.filter((table) => zoneKey(table) === entry.key);

                  return (
                    <button
                      key={entry.key}
                      type="button"
                      aria-pressed={zone === entry.key}
                      onClick={() => setZone(entry.key)}
                      className={`flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                        zone === entry.key
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-border bg-surface text-fg-muted'
                      }`}
                    >
                      {entry.label}
                      <span data-num className="text-fg-subtle text-xs">
                        {inZone.filter((table) => table.status !== 'free').length}/{inZone.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-4">
              {(['free', 'seated', 'to_pay'] as const).map((state) => (
                <span key={state} className="flex items-center gap-2 text-xs font-medium">
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-full ${
                      state === 'free'
                        ? 'bg-success-500'
                        : state === 'seated'
                          ? 'bg-brand-500'
                          : 'bg-warning-500'
                    }`}
                  />
                  {m[`floor_${state}` as 'floor_free']}
                </span>
              ))}

              <span className="text-fg-subtle ml-auto text-xs">
                {m.floorBusy
                  .replace('{busy}', String(shownTables.filter((t) => t.status !== 'free').length))
                  .replace('{total}', String(shownTables.length))}
              </span>
            </div>

            <div className="mt-3 grid [grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-3">
              {shownTables.map((table) => {
                const free = table.status === 'free';
                const paying = table.status === 'to_pay' || table.status === 'awaiting_payment';

                return (
                  <button
                    key={table.id}
                    type="button"
                    disabled={opening}
                    onClick={() => void open(table)}
                    className={`flex min-h-[104px] flex-col items-start rounded-md border-2 p-4 text-left disabled:opacity-50 ${
                      paying
                        ? 'border-warning-500 bg-warning-50'
                        : free
                          ? 'bg-surface border-border'
                          : 'border-brand-200 bg-brand-50'
                    }`}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span
                        data-num
                        className="font-display text-2xl leading-none font-bold tracking-tight"
                      >
                        {table.label}
                      </span>

                      <span
                        aria-hidden
                        className={`mt-1 size-2.5 flex-none rounded-full ${
                          paying ? 'bg-warning-500' : free ? 'bg-success-500' : 'bg-brand-500'
                        }`}
                      />
                    </span>

                    <span data-num className="text-fg-subtle mt-1.5 text-xs">
                      {table.seats} {common.seats}
                    </span>

                    {/*
                     * The state in words as well as in colour — `CLAUDE.md`
                     * rule 9. This screen is read in a dining room lit for
                     * atmosphere by somebody walking, and amber against blue at
                     * 11px is not a distinction to ask of anyone.
                     */}
                    <span
                      className={`text-2xs mt-auto font-semibold ${
                        paying ? 'text-warning-700' : free ? 'text-success-700' : 'text-brand-700'
                      }`}
                    >
                      {paying ? m.floor_to_pay : free ? m.floor_free : m.floor_seated}
                    </span>
                  </button>
                );
              })}

              {/*
               * The two off-premise doors, beside the tables rather than in
               * place of one. `specs/01-os.md §5.19` asks for a channel step;
               * the till offered a single "takeaway" tile and no delivery at
               * all, so an order for a courier had to be rung up as a
               * collection and the fee added by hand.
               */}
              {(['takeaway', 'delivery'] as const).map((channel) => (
                <button
                  key={channel}
                  type="button"
                  disabled={opening}
                  onClick={() => setOffPremise(channel)}
                  className="bg-bg-muted flex min-h-[104px] flex-col items-start rounded-md border border-dashed p-4 text-left disabled:opacity-50"
                >
                  <span className="font-display text-lg leading-tight font-semibold">
                    {opening
                      ? m.openingBill
                      : channel === 'takeaway'
                        ? m.takeaway
                        : m.deliveryChannel}
                  </span>
                  <span className="text-fg-subtle mt-1.5 text-xs leading-normal">
                    {channel === 'takeaway' ? m.takeawaySub : m.deliverySub}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {shortcuts ? (
          <ShortcutsSheet
            title={m.shortcuts}
            closeLabel={m.cancel}
            groups={tillShortcuts(m)}
            onClose={() => setShortcuts(false)}
          />
        ) : null}

        {offPremise === null ? null : (
          <GuestSheet
            m={m}
            channel={offPremise}
            busy={opening}
            onClose={() => setOffPremise(null)}
            onOpen={(details) => {
              setOffPremise(null);
              void open(null, { channel: offPremise, ...details });
            }}
          />
        )}
      </div>
    );
  }

  const section = sections.find((entry) => entry.id === sectionId) ?? sections[0];
  // Which tint the section's monogram tiles take — see `TILE_TINTS`.
  const sectionIndex = Math.max(
    0,
    sections.findIndex((entry) => entry.id === section?.id),
  );
  const seats = Array.from(new Set([1, ...bill.lines.map((line) => line.seat_no), seat])).sort(
    (a, b) => a - b,
  );

  /* ---- the work ---- */

  return (
    <div className="flex h-dvh flex-col">
      <OrderHeader
        m={m}
        shell={shell}
        who={who}
        terminal={terminal}
        where={bill.table_label ?? m.takeaway}
        covers={bill.guests_count}
        coversLabel={m.covers}
        onBack={() => setBill(null)}
        sync={syncBadge}
        onShortcuts={() => setShortcuts(true)}
        onLock={() => void lock()}
      />

      <OfflineBanner onSeeQueue={() => setSyncOpen(true)} />

      <div
        data-pos
        className="grid min-h-0 flex-1 [grid-template-columns:172px_minmax(0,1fr)_392px]"
      >
        {/* ---- sections ---- */}
        <nav className="border-border bg-surface flex min-h-0 flex-col overflow-y-auto border-r">
          {sections.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSectionId(entry.id)}
              aria-current={entry.id === section?.id}
              className={`flex min-h-[72px] flex-col items-center justify-center px-2 py-3 ${
                entry.id === section?.id ? 'bg-brand-50 text-brand-700' : ''
              }`}
            >
              <span className="text-xs leading-tight font-semibold">{entry.title}</span>
              <span data-num className="text-fg-subtle text-2xs mt-1">
                {entry.dishes.length}
              </span>
            </button>
          ))}
        </nav>

        {/* ---- dishes ---- */}
        <div data-scroll className="min-w-0 p-4">
          {section === undefined ? (
            <p className="text-fg-subtle text-sm">{m.menuUnavailable}</p>
          ) : section.dishes.length === 0 ? (
            <p className="text-fg-subtle text-sm">{m.menuEmpty}</p>
          ) : (
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(178px,100%),1fr))] gap-3">
              {section.dishes.map((dish) => {
                const off = stopped.has(dish.id);

                return (
                  <button
                    key={dish.id}
                    type="button"
                    disabled={busy || off}
                    onClick={() => void tap(dish)}
                    /*
                     * Dashed and struck through, not hidden and not merely faded.
                     *
                     * Dashed is the design's own mark for it, and it carries the
                     * meaning on its own: a waiter reading at arm's length while
                     * holding a tray sees the border broken before they read the
                     * word. `disabled:opacity-50` alone would make a stopped tile
                     * look like every other momentarily-busy tile on the screen.
                     */
                    /*
                     * 132px, not 88 — the design's own height, and the extra
                     * 44 is what the SKU, the station and the description sit
                     * in. A tile that carries only a name and a price makes a
                     * waiter open the modifier sheet to find out which of the
                     * two similarly-named dishes this is, and on a busy night
                     * they guess instead.
                     */
                    className={`flex min-h-[132px] flex-col items-start rounded-[12px] p-3 text-left ${
                      off
                        ? 'bg-bg-muted border-border border border-dashed opacity-70'
                        : 'bg-surface border disabled:opacity-50'
                    }`}
                  >
                    {/*
                     * The design's header row (`dc.html:6534-6537`): a 34px
                     * monogram square on the left, a caps tag on the right.
                     * The square is where the photograph goes when there is
                     * one — the owner's call, against the Zim-Zim till the
                     * restaurant used before: a waiter recognises plov by the
                     * plate long before they have read "Osh, to'y". 44px
                     * rather than 34, because a photograph needs ten more
                     * pixels than two letters do to be recognised at arm's
                     * length, and `thumb` (160px) is crisp there at 3×.
                     *
                     * No photograph → the design's own monogram: two letters
                     * of the name on a tint chosen by section, so tiles in one
                     * section share a colour and the eye can find a section
                     * by its tint while scrolling.
                     */}
                    <span className="mb-2 flex w-full items-center gap-2.5">
                      <DishPhoto
                        image={dishImageFrom(dish.image, dish.image_url)}
                        alt=""
                        sizes="44px"
                        className={`size-11 flex-none rounded-[9px] ${off ? 'grayscale' : ''}`}
                        fallback={
                          <span
                            aria-hidden
                            className={`font-display grid size-11 flex-none place-items-center rounded-[9px] text-[13px] font-bold tracking-[-.01em] ${
                              TILE_TINTS[sectionIndex % TILE_TINTS.length]
                            }`}
                          >
                            {monogram(dish.title)}
                          </span>
                        }
                      />

                      {/* The SKU, which is what a printed menu and a stock
                          sheet both key on — and what a waiter reads out when
                          the kitchen asks "which lagman". */}
                      <span
                        data-num
                        className="text-fg-subtle bg-bg-muted ml-auto rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                      >
                        {dish.sku}
                      </span>
                    </span>

                    <span
                      className={`text-md min-w-0 leading-snug font-semibold ${
                        off ? 'text-fg-subtle line-through' : ''
                      }`}
                    >
                      {dish.title}
                    </span>

                    {dish.description === null ? null : (
                      <span className="text-fg-subtle mt-1 line-clamp-2 text-xs leading-normal">
                        {dish.description}
                      </span>
                    )}

                    <span className="mt-auto flex w-full items-end justify-between gap-2">
                      {off ? (
                        <span className="text-warning-700 text-2xs font-semibold">{m.stopped}</span>
                      ) : (
                        <span data-num className="text-fg text-base font-semibold">
                          {money(dish.price_tiyin)}
                        </span>
                      )}

                      {dish.station === null ? null : (
                        <span className="text-fg-subtle text-2xs">{dish.station}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- the ticket ---- */}
        <aside className="border-border bg-surface flex min-h-0 flex-col border-l">
          <header className="border-divider flex-none border-b px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-md tracking-snug leading-tight font-semibold">
                  {bill.table_label ?? m.takeaway}
                </div>
                {/* `dc.html:17411` — how many lines, and whether the kitchen has
                    them. The bill number moved into the tab strip below, where
                    the design keeps the "which of the four" question. */}
                <div data-num className="text-fg-subtle mt-0.5 text-xs">
                  {fill(
                    word(
                      onThisBill.length === 0 || bill.status === 'draft'
                        ? POS_COPY.cartMetaDraft
                        : POS_COPY.cartMetaSent,
                    ),
                    { n: String(onThisBill.length) },
                  )}
                </div>
              </div>

              {/*
               * Where the food is, without walking to the pass.
               *
               * The one thing on this screen that changes without the waiter
               * touching it, and the reason the socket exists: a cook two rooms
               * away presses "Qabul qildim" and this goes amber.
               */}
              <div className="flex flex-none items-center gap-3">
                <FireChip m={m} sent={bill.status !== 'draft'} at={slowest(kitchen[bill.id])} />

                {/* `dc.html:6569` — back to the floor from inside the ticket,
                    which is where a waiter realises they opened Table 7. */}
                <button
                  type="button"
                  onClick={() => setBill(null)}
                  className="text-fg-brand flex-none text-xs font-medium"
                >
                  {word(POS_COPY.cartChange)}
                </button>
              </div>
            </div>

            {/*
             * Four bills, always four tabs.
             *
             * Not "as many as are in use", because the tap that creates the
             * second bill IS the tab: a waiter splitting a table reaches for
             * "Hisob 2" and expects it to be there, not to have to make it.
             */}
            <div className="bg-bg-muted mt-3 flex gap-[3px] rounded-[11px] p-[3px]">
              {BILLS.map((n) => {
                const count = bill.lines.filter(
                  (line) => line.bill_no === n && line.status !== 'cancelled',
                ).length;
                const on = n === billNo;

                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBillNo(n)}
                    aria-pressed={on}
                    className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold ${
                      on ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
                    }`}
                  >
                    {n}

                    {/*
                     * The count is a badge, not a `· 3` after the number —
                     * `dc.html:6555`. Two numbers side by side in the same type
                     * read as one number, and "2 · 3" on a segmented control is
                     * the bill a waiter opens by mistake.
                     */}
                    {count > 0 ? (
                      <span
                        data-num
                        className={`grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                          on ? 'bg-brand-500 text-white' : 'bg-surface text-fg-muted'
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Which guest the next tap belongs to — Q4's whole point. */}
            <div className="mt-2 flex flex-wrap gap-1">
              {seats.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSeat(n)}
                  className={`h-9 min-w-[44px] rounded-[8px] px-2.5 text-xs font-semibold ${
                    n === seat ? 'bg-fg text-surface' : 'bg-bg-muted text-fg-muted'
                  }`}
                >
                  {n}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSeat(Math.max(...seats) + 1)}
                aria-label={m.addSeat}
                title={m.addSeat}
                className="bg-bg-muted text-fg-muted h-9 min-w-[44px] rounded-[8px] px-2.5 text-xs font-semibold"
              >
                +
              </button>
            </div>
          </header>

          {failed !== null ? (
            <p
              role="alert"
              className="bg-danger-50 text-danger-700 mx-4 mt-3 rounded-[10px] px-3 py-2 text-xs font-medium"
            >
              {failed}
            </p>
          ) : null}

          {onThisBill.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
              {/* `dc.html:6597` — an outlined trolley, at the disabled weight.
                  An empty panel with only words on it reads as a screen that
                  failed to load; the glyph says the panel is fine and empty. */}
              <span className="border-border text-fg-disabled mb-4 grid h-11 w-11 place-items-center rounded-md border">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 5h2l2.2 10.4a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.3L20 8H6.4" />
                  <circle cx="10" cy="20" r="1" />
                  <circle cx="17" cy="20" r="1" />
                </svg>
              </span>

              <div className="text-sm font-semibold">{word(POS_COPY.cartEmptyT)}</div>
              <p className="text-fg-subtle mt-1.5 text-xs leading-normal">
                {word(POS_COPY.cartEmptyB)}
              </p>
            </div>
          ) : (
            <div data-scroll className="min-h-0 flex-1 px-4 py-3">
              {onThisBill.map((line) => (
                <div key={line.id} className="border-divider border-b py-3 last:border-0">
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug font-semibold">{line.title}</div>

                      {line.modifiers.length > 0 ? (
                        <div className="text-fg-subtle mt-1 text-xs">
                          {line.modifiers.map((modifier) => modifier.title).join(' · ')}
                        </div>
                      ) : null}

                      <div data-num className="text-fg-subtle text-2xs mt-1">
                        {m.seat} {line.seat_no}
                      </div>
                    </div>

                    <div data-num className="text-right text-sm font-semibold tabular-nums">
                      {money(line.total_price)}
                      <div className="text-fg-subtle text-2xs font-normal">×{line.quantity}</div>
                    </div>
                  </div>

                  {/*
                   * The three controls the cart had none of.
                   *
                   * `+` adds the same dish again rather than editing a
                   * quantity, because that is the only write the API offers and
                   * because it is also the honest one: a second portion is a
                   * second line the kitchen has to cook, and it may be priced
                   * differently if a rule changed since the first.
                   *
                   * 44px targets, which is the floor on this screen — a waiter
                   * is doing this one-handed while holding a tray.
                   */}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVoiding(line)}
                      disabled={busy}
                      aria-label={m.remove}
                      title={m.remove}
                      className="text-danger-600 h-11 min-w-[44px] rounded-[8px] border px-3 text-sm font-semibold disabled:opacity-40"
                    >
                      −
                    </button>

                    <button
                      type="button"
                      onClick={() => void repeat(line)}
                      disabled={busy}
                      aria-label={m.increase}
                      title={m.increase}
                      className="bg-bg-muted text-fg-muted h-11 min-w-[44px] rounded-[8px] px-3 text-sm font-semibold disabled:opacity-40"
                    >
                      +
                    </button>

                    {/* Already cooked, so the void needs a reason and a manager. */}
                    {line.status !== 'draft' && line.status !== 'new' ? (
                      <span className="bg-warning-50 text-warning-700 text-2xs rounded-pill ml-auto self-center px-2.5 py-1 font-semibold">
                        {m.sent}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/*
           * The totals, exactly as the API returned them.
           *
           * No arithmetic in this block on purpose — not even a subtraction.
           * The whole point of the server owning the money is that this panel
           * cannot disagree with the receipt.
           */}
          <footer className="border-border flex-none border-t px-5 pt-4 pb-[18px]">
            {/* Subtotal, then what the venue adds, then what it takes off —
                `dc.html:6624`. The order is the arithmetic read downwards, so a
                guest following along with the receipt never sees a figure move
                the wrong way. */}
            <Row label={m.subtotal} value={money(bill.subtotal)} />

            {/*
             * The rate, when the till was allowed to read it.
             *
             * `console.pos.service` still reads "Xizmat haqi 10%" as a constant
             * and this deliberately does not use it: a printed rate that
             * disagrees with the figure beside it is the one thing that makes a
             * guest distrust a till. So the percentage comes from the same
             * `service_charge_percent` the server computed the amount from, and
             * when that could not be read the label simply omits it.
             */}
            {bill.service_charge > 0 ? (
              <Row
                label={
                  rates === null ? m.payService : pos('serviceRate', { percent: rates.service })
                }
                value={money(bill.service_charge)}
              />
            ) : null}

            {bill.delivery_fee > 0 ? (
              <Row label={m.deliveryFee} value={money(bill.delivery_fee)} />
            ) : null}

            {bill.discount_total > 0 ? (
              <Row label={m.discount} value={`− ${money(bill.discount_total)}`} />
            ) : null}

            <div className="border-divider mt-2 flex items-baseline justify-between border-t pt-3 pb-4">
              <span className="text-md font-semibold">{m.total}</span>
              <span data-num className="font-display text-2xl font-semibold tracking-tight">
                {money(bill.total)}{' '}
                <span className="text-fg-subtle text-sm font-normal">{m.som}</span>
              </span>
            </div>

            {/* Inside the total, never added to it — see BillTotals. */}
            {bill.vat_included > 0 ? (
              <div className="text-fg-subtle text-2xs mt-1 flex justify-between">
                <span>
                  {rates === null ? m.vatIncluded : pos('vatRate', { percent: rates.vat })}
                </span>
                <span data-num>{money(bill.vat_included)}</span>
              </div>
            ) : null}

            {/*
             * 56px, the tallest target on the screen, and the only one another
             * person acts on. Everything else here can be undone with a tap; a
             * cook starts cooking on the far side of this one, which is why it
             * says where the food is going rather than "OK".
             *
             * It stays live after the first send. A guest ordering dessert after
             * the mains is the normal case, and the API rewrites the docket in
             * place rather than putting a second one on the pass.
             */}
            {/*
             * Discount · split · transfer, above the two big buttons.
             *
             * Smaller and quieter than Send and Pay because they are rarer and
             * because two of them cost money. They are still 44px — this is a
             * tablet — and they are drawn as text rather than icons, because a
             * waiter who taps the wrong one here has moved somebody's bill to
             * the wrong table.
             */}
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDiscounting(true)}
                disabled={busy || onThisBill.length === 0}
                className="flex h-11 flex-1 items-center justify-center gap-[7px] rounded-md border text-sm font-medium disabled:opacity-40"
              >
                {/*
                 * A padlock when this person cannot apply one alone —
                 * `dc.html:6630`, drawn on `role.perms.discount === 2`, which is
                 * this build's ceiling of zero: every percentage they pick opens
                 * an approval instead of a discount. Saying so on the button is
                 * what stops a waiter promising the guest 10% at the table.
                 */}
                {discountCeiling === 0 ? (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--warning-600)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
                    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                  </svg>
                ) : null}
                {m.discount}
              </button>
              <button
                type="button"
                onClick={() => setMoving('split')}
                disabled={busy || onThisBill.length < 2}
                className="h-11 flex-1 rounded-md border text-sm font-medium disabled:opacity-40"
              >
                {m.split}
              </button>
              <button
                type="button"
                onClick={() => setMoving('transfer')}
                disabled={busy || onThisBill.length === 0}
                className="h-11 flex-1 rounded-md border text-sm font-medium disabled:opacity-40"
              >
                {m.transfer}
              </button>
            </div>

            {/*
             * The refusal, and the one thing that can lift it. Under the
             * buttons rather than in a toast, because a waiter needs it while
             * they decide what to tell the guest.
             */}
            {needsManager !== null ? (
              <div className="border-warning-500/30 bg-warning-50 mt-3 rounded-md border px-3.5 py-3">
                <p className="text-warning-700 text-xs leading-normal">{m.needsApproval}</p>
                <button
                  type="button"
                  /*
                   * One button, two doors, and the API decides which.
                   *
                   * When the refusal named the request it raised, the manager
                   * can settle it here on four digits — which is what actually
                   * happens in a restaurant, forty times a shift. When it did
                   * not, the only honest thing left is to put it in the queue
                   * and wait for somebody's phone.
                   */
                  onClick={() =>
                    needsManager.approvalId === null
                      ? void askManager(String(needsManager.payload.reason ?? m.discount))
                      : setApproving({
                          approvalId: needsManager.approvalId,
                          action: needsManager.action,
                          payload: needsManager.payload,
                        })
                  }
                  className="bg-warning-500 mt-2.5 h-10 w-full rounded-md text-xs font-semibold text-white"
                >
                  {m.askManager}
                </button>
              </div>
            ) : null}

            {asked ? (
              <p className="border-brand-500/30 bg-brand-50 text-brand-700 mt-3 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
                {m.askedManager}
              </p>
            ) : null}

            {/*
             * 52px, the tallest target on the screen, and the only one another
             * person acts on. Everything else here can be undone with a tap; a
             * cook starts cooking on the far side of this one, which is why it
             * says where the food is going rather than "OK".
             *
             * It stays live after the first send. A guest ordering dessert after
             * the mains is the normal case, and the API rewrites the docket in
             * place rather than putting a second one on the pass — so the label
             * changes to say exactly that (`dc.html:17415`).
             */}
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || onThisBill.length === 0}
              className="bg-brand-500 text-md flex h-[52px] w-full items-center justify-center gap-2.5 rounded-md font-semibold text-white disabled:opacity-45"
            >
              {sending ? m.sending : bill.status === 'draft' ? m.send : word(POS_COPY.sendAgain)}
            </button>

            {/*
             * Stacked under Send at full width, not beside it — `dc.html:6634`.
             *
             * Side by side they were two equal buttons a thumb chooses between
             * on a busy night; stacked, the order of the shift is the order of
             * the column. Pay is the neutral outline the design gives it rather
             * than a second brand-coloured control competing for the same
             * glance.
             *
             * Paying needs the server's figure, so the button waits for it.
             * `payable` arrives on every bill response; until it does there is no
             * honest amount to put in front of a guest, and a sheet opened without
             * one would have to invent the rounding itself. Disabled rather than
             * hidden — a cashier looking for the pay button must be able to see
             * that it exists and is not ready yet.
             */}
            <button
              type="button"
              onClick={() => setPaying(true)}
              disabled={payable === null || onThisBill.length === 0 || bill.lines.length === 0}
              className="border-border-strong text-md mt-2 flex h-12 w-full items-center justify-center rounded-md border font-semibold disabled:opacity-45"
            >
              {fill(word(POS_COPY.payBill), { n: String(billNo) })}
            </button>

            {/* `dc.html:6636` — only when another bill on this table is still
                open, because that is the only time it tells anybody anything. */}
            {billsInUse > 1 ? (
              <p className="text-2xs text-fg-subtle mt-[9px] text-center leading-normal">
                {word(POS_COPY.multiBillNote)}
              </p>
            ) : null}
          </footer>
        </aside>
      </div>

      {/*
       * The 38px health strip — `specs/01-os.md`. Printer, live link, network,
       * fiscal module and the offline queue, plus the terminal id, the version
       * and the clock a cashier reads out to support.
       *
       * At the foot rather than the top: it is the thing you look at when
       * something has gone wrong, and the top of a till belongs to the table
       * you are serving.
       */}
      <HealthStrip
        terminal={terminal}
        labels={{
          net: m.hNet,
          netUp: m.hNetUp,
          netDown: m.hNetDown,
          link: m.hLink,
          linkUp: m.hLinkUp,
          linkDown: m.hLinkDown,
          printer: m.hPrinter,
          printerUp: m.hPrinterUp,
          fiscal: m.hFiscal,
          /* No `fiscalUp` — the strip takes that sentence from the design
             instead (`tlFiscalOk`), because the catalogue's «Fiskal modul
             ulangan» does not say the half that matters: synced with soliq.uz. */
          queued: m.hQueued,
        }}
        onSeeQueue={() => setSyncOpen(true)}
        onDiagnosing={setDiagnosing}
      />

      {shortcuts ? (
        <ShortcutsSheet
          title={m.shortcuts}
          closeLabel={m.cancel}
          groups={tillShortcuts(m)}
          onClose={() => setShortcuts(false)}
        />
      ) : null}

      {discounting && bill !== null ? (
        <DiscountSheet
          m={m}
          /*
           * This person's ceiling at this till, from the session.
           *
           * It was a hard-coded 5 — the cashier's row in
           * `docs/PLAN-POS-FIRST.md` §P9 — beside a TODO asking for the number
           * the API had been sending all along, in
           * `TerminalSessionResource.user.discount_ceiling`. The consequence
           * was not cosmetic: a waiter was shown four chips the server would
           * refuse, and a manager entitled to 20% was shown one.
           */
          ceiling={discountCeiling}
          busy={busy}
          onClose={() => setDiscounting(false)}
          onApply={(percent, reason) => {
            void act('discount', { percent, reason }).then((ok) => {
              if (ok) {
                setDiscounting(false);
                setOutcome(m.toastDiscount);
                flash(m.toastDiscount);
              }
            });
          }}
        />
      ) : null}

      {moving === 'split' && bill !== null ? (
        <SplitSheet
          m={m}
          lines={onThisBill}
          guests={bill.guests_count}
          total={bill.total}
          money={money}
          busy={busy}
          onClose={() => setMoving(null)}
          /*
           * All three buttons are the same write, and the body says which.
           *
           * `POST /pos/bills/{id}/split` takes exactly one of `line_ids`,
           * `ways` or `amount_tiyin` — two of them together is a 422, because a
           * till that sent two has a bug and guessing which it meant would carve
           * up money in front of a table. All three go through `act()` like
           * every other bill write, so one route handler adds the shift token,
           * the tenant and the pair of idempotency keys, and one tap is one
           * request: `act()` refuses while `busy` and the sheet's confirm is
           * disabled with it. On this endpoint that guard is the difference
           * between four bills and eight.
           *
           * A refusal — `pos.bill_refused`, whose `error.detail` is the
           * sentence the sheet shows — leaves the sheet open with the picks
           * intact. An empty bill, a bill already split, a share somebody is
           * trying to split again, an amount that is not strictly inside the
           * total: all of them are things the waiter can fix on the sheet that
           * is still in front of them.
           */
          onSplitLines={(lineIds) => {
            void act('split', { line_ids: lineIds }).then(splitLanded);
          }}
          onSplitEvenly={(ways) => {
            void act('split', { ways }).then(splitLanded);
          }}
          onSplitAmount={(tiyin) => {
            void act('split', { amount_tiyin: tiyin }).then(splitLanded);
          }}
        />
      ) : null}

      {moving !== null && moving !== 'split' && bill !== null ? (
        <MoveSheet
          m={m}
          kind={moving}
          tables={tables.map((table) => ({ id: table.id, label: table.label }))}
          otherBills={BILLS.filter((no) => no !== billNo).map((no) => ({
            id: no,
            label: m.billTab.replace('{n}', String(no)),
          }))}
          busy={busy}
          onClose={() => setMoving(null)}
          onMerge={(targetBillId) => {
            void act('merge', { target_bill_id: targetBillId }).then((ok) => {
              if (ok) {
                setMoving(null);
                setOutcome(m.moveDone);
                flash(m.moveDone);
              }
            });
          }}
          onTransfer={(tableId) => {
            void act('transfer', { table_id: tableId }).then((ok) => {
              if (ok) {
                setMoving(null);
                setOutcome(m.moveDone);
                flash(m.moveDone);
              }
            });
          }}
        />
      ) : null}

      {voiding !== null ? (
        <VoidSheet
          m={m}
          line={voiding}
          fired={voiding.status !== 'draft' && voiding.status !== 'new'}
          money={money}
          busy={busy}
          onClose={() => setVoiding(null)}
          onVoid={(reason) => {
            void act('void-line', { line_id: voiding.id, reason }).then((ok) => {
              if (ok) {
                setVoiding(null);
                flash(m.moveDone);
              }
            });
          }}
        />
      ) : null}

      {/*
       * The manager, at the till.
       *
       * Opened only when the refusal named the request it raised, because the
       * keypad answers *that* request and nothing else — a sheet with no id
       * behind it could only approve "something". On four accepted digits the
       * refused action is replayed with the same body plus the id, which is the
       * one shape the gate lets through: `BillController::gate()` refuses again
       * when `approval_id` is absent, however signed the approval is.
       *
       * Closing without answering is not a refusal. The request is already in
       * the queue and the manager's phone has already been told, so the till
       * says so and carries on waiting.
       */}
      {approving !== null ? (
        <ApprovalSheet
          m={m}
          approvalId={approving.approvalId}
          onClose={() => {
            setApproving(null);
            setAsked(true);
          }}
          onApproved={() => {
            const { action, payload, approvalId } = approving;

            setApproving(null);

            void act(action, { ...payload, approval_id: approvalId }).then((ok) => {
              if (!ok) return;

              // Whatever sheet was still open behind the refusal — the
              // discount chips, the void prompt — is now answering about
              // something that has happened.
              setNeedsManager(null);
              setDiscounting(false);
              setMoving(null);
              setVoiding(null);

              const done = action === 'discount' ? m.toastDiscount : m.moveDone;

              setOutcome(done);
              flash(done);
            });
          }}
        />
      ) : null}

      {paying && payable !== null ? (
        <PaySheet
          payable={payable}
          bill={{
            id: bill.id,
            customerId: bill.customer_id,
            subtotal: bill.subtotal,
            discount: bill.discount_total,
            service: bill.service_charge,
            delivery: bill.delivery_fee,
            vat: bill.vat_included,
            total: bill.total,
          }}
          billNumber={String(bill.id)}
          rates={rates}
          onSettled={settled}
          onClose={() => setPaying(false)}
          /* Both close the drawer first: a split changes the figure it was
             quoting, and a discount changes it too. Leaving it open behind the
             sheet would leave a stale total on screen. */
          onSplit={() => {
            setPaying(false);
            setMoving('split');
          }}
          onDiscount={() => {
            setPaying(false);
            setDiscounting(true);
          }}
        />
      ) : null}

      {asking !== null ? (
        <ModifierSheet
          dish={asking.dish}
          questions={asking.questions}
          busy={busy}
          onCancel={() => setAsking(null)}
          onConfirm={(choiceIds, note) => void add(asking.dish, choiceIds, note)}
        />
      ) : null}
    </div>
  );
}

/**
 * How far the kitchen has got, in four words and a colour.
 *
 * Colour carries it, because this is read at a glance from arm's length while
 * carrying something: grey is not sent, brand is with the kitchen, amber is
 * being cooked, green is on the pass. The word is there for the reader who is
 * not sure of the colours yet, and for anyone who cannot tell these two greens
 * apart — which is why the state is never colour alone.
 */
function FireChip({
  m,
  sent,
  at,
}: {
  m: Messages['console']['pos'];
  sent: boolean;
  at: string | null;
}) {
  if (!sent) {
    return (
      <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold">
        {m.fireNotSent}
      </span>
    );
  }

  const { label, tone } = fireLook(m, at);

  return (
    <span className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function fireLook(
  m: Messages['console']['pos'],
  at: string | null,
): { label: string; tone: string } {
  switch (at) {
    case 'accepted':
      return { label: m.fireAccepted, tone: 'bg-warning-50 text-warning-700' };
    case 'cooking':
    case 'recalled':
      return { label: m.fireCooking, tone: 'bg-warning-50 text-warning-700' };
    case 'ready':
      return { label: m.fireReady, tone: 'bg-success-50 text-success-700' };
    case 'served':
      return { label: m.fireServed, tone: 'bg-bg-muted text-fg-muted' };
    default:
      // Sent, and either nothing has moved yet or the kitchen said `new`. Both
      // mean the same thing to a waiter: it is theirs now.
      return { label: m.fireSent, tone: 'bg-brand-50 text-brand-700' };
  }
}

function Row({ label, value }: { label: string; value: string }) {
  /* 4px above and below — `dc.html:6625`. At 2px the four rows read as one
     paragraph and a guest cannot follow the arithmetic down the column. */
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span data-num className="tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * Light or dark, from the till's own header — `dc.html:6414`.
 *
 * The design puts a 44px moon beside the kitchen button and the lock, and it is
 * not a preference control: a tablet clamped to a terrace rail at two in the
 * afternoon and the same tablet at eleven at night are two different screens,
 * and the person who has to change it is the one standing at it. The console
 * has the same toggle in its settings, three taps away and behind a login.
 */
/**
 * The amber strip under the header, while the router is down — `dc.html:6421`.
 *
 * The till already had two places that mention the network: a chip in the 38px
 * strip at the very bottom, and a badge that only appears once something is
 * actually queued. Neither is where a waiter is looking when they press Send,
 * and neither says the sentence that matters — *keep going, it is being saved*.
 *
 * So this is not a duplicate warning, it is the one that arrives in time. It
 * names what still works, because the reflex on losing the network is to stop
 * taking orders, and on this system that is the wrong thing to do.
 *
 * `navigator.onLine` is a weak signal — a captive portal reports online — and
 * that is fine here: this strip is an explanation, not a gate. Nothing is
 * blocked by it and nothing depends on it being right.
 */
function OfflineBanner({ onSeeQueue }: { onSeeQueue: () => void }) {
  const locale = useLocale();

  const online = useSyncExternalStore(
    (onChange: () => void) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);

      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
    /* The server cannot know, and guessing "offline" would flash an amber bar
       across every first paint. */
    () => true,
  );

  if (online) return null;

  return (
    <div className="bg-warning-50 flex flex-none items-center gap-3.5 border-b border-[rgba(247,144,9,.28)] px-5 py-[11px]">
      <span aria-hidden className="bg-warning-500 size-[9px] flex-none rounded-full" />

      <span className="text-warning-700 min-w-0 flex-1 text-sm font-semibold">
        {say(locale, POS_COPY.offT)}
      </span>

      {/* Dropped below 1120px rather than wrapped — the design's own rule
          (`dc.html:140`). The headline and the button carry the meaning; this
          is the reassurance, and a reassurance that pushes the button off a
          1024px tablet costs more than it gives. */}
      <span data-strip-opt="1" className="text-warning-600 text-xs">
        {say(locale, POS_COPY.offSub)}
      </span>

      <button
        type="button"
        onClick={onSeeQueue}
        className="bg-surface text-warning-700 h-8 flex-none rounded-md border border-[rgba(247,144,9,.4)] px-3 text-xs font-semibold"
      >
        {say(locale, POS_COPY.offSee)}
      </button>
    </div>
  );
}

function ThemeButton({ toLight, toDark }: { toLight: string; toDark: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  /* The label names where the tap goes, not where the screen is. "Qorong'i" on
     a dark screen is a button that appears to do nothing. */
  const label = dark ? toLight : toDark;

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      aria-pressed={dark}
      className="border-border text-fg-muted grid h-11 w-11 place-items-center rounded-md border"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    </button>
  );
}

function OrderHeader({
  m,
  shell,
  who,
  terminal,
  where,
  covers,
  coversLabel,
  onBack,
  sync,
  onShortcuts,
  onLock,
}: {
  m: Messages['console']['pos'];
  shell: Pick<Messages['console']['shell'], 'light' | 'dark'>;
  who: string | null;
  terminal: string | null;
  where?: string;
  covers?: number | null;
  coversLabel?: string;
  onBack?: () => void;
  /**
   * The stranded-shift badge, when there is one.
   *
   * A slot rather than the panel itself, because this header is rendered twice
   * — over the table picker and over a bill — and the queue belongs to the till
   * rather than to either screen. Passing it in keeps one badge with one count
   * instead of two that can disagree.
   */
  sync?: ReactNode;
  /** Opens the shortcuts sheet. */
  onShortcuts?: () => void;
  /** Drops whoever is signed in and leaves the tablet paired. */
  onLock?: () => void;
}) {
  const locale = useLocale();

  return (
    <header className="border-border bg-surface flex h-16 flex-none items-center gap-4 border-b px-5">
      {onBack !== undefined ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={say(locale, POS_COPY.posBack)}
          title={say(locale, POS_COPY.posBack)}
          className="border-border text-fg-muted flex h-11 w-11 items-center justify-center rounded-md border"
        >
          {/* The design's own chevron (`dc.html:6389`), not a `‹` — a glyph
              renders at whatever weight the font decides and sat a pixel high
              in the button on every tablet we looked at. */}
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      ) : null}

      <div className="min-w-0">
        <div className="font-display tracking-snug text-lg leading-tight font-semibold">
          {where ?? terminal ?? m.heading}
        </div>
        <div data-num className="text-fg-subtle mt-0.5 text-xs">
          {where !== undefined && covers ? `${covers} ${coversLabel}` : (who ?? m.sub)}
        </div>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5">
        {sync}

        {/*
         * The controls the design puts here, in its order — `dc.html:6404`:
         * the queue, the theme, the pass, then the two that end a turn at the
         * till.
         *
         * The theme toggle is here because a tablet on a terrace at midday and
         * the same tablet at midnight are different screens.
         */}
        <ThemeButton toLight={shell.light} toDark={shell.dark} />

        {/*
         * Not in the design's header, and kept anyway.
         *
         * The design opens the shortcut sheet with the `?` key (`dc.html:10992`)
         * and puts the button in the console's sidebar, which this surface does
         * not have — and a till is a tablet, where there is no key to press. A
         * sheet with no way in is a sheet nobody opens.
         */}
        <button
          type="button"
          onClick={onShortcuts}
          aria-label={m.shortcuts}
          title={m.shortcuts}
          className="border-border grid h-11 w-11 place-items-center rounded-md border text-sm font-semibold"
        >
          ?
        </button>

        {/* A named button, not an icon — `dc.html:6407`. The pass is somewhere a
            waiter goes on purpose, and it is the one control up here that is not
            about this tablet. */}
        <a
          href="/kitchen"
          className="border-border bg-surface flex h-11 items-center rounded-md border px-4 text-sm font-semibold"
        >
          {m.kitchenView}
        </a>

        {/*
         * Lock and switch-user are two buttons, and that is the whole point.
         *
         * The till shipped with one control — a padlock carrying the cashier's
         * name — which meant the two things a person does at the end of their
         * turn had a single door: leaving the till unattended, and handing it to
         * the next person. The design separates them (`dc.html:6408` and
         * `:6411`) because they leave the drawer in different states, and
         * because the second one is pressed twenty times a night on a shared
         * terminal while the first is pressed once.
         *
         * Lock is icon-only and reddens under the pointer: it is the destructive
         * end of the pair — everything on screen goes away and a PIN is needed
         * to come back.
         */}
        <button
          type="button"
          onClick={onLock}
          aria-label={m.lock}
          title={m.lock}
          className="border-border text-fg-muted hover:text-danger-600 grid h-11 w-11 place-items-center rounded-md border"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="4" y="10.5" width="16" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
        </button>

        {/*
         * Who is standing here, and the way to change it.
         *
         * The name is the label rather than a decoration: on a shared terminal
         * the question this answers — "am I about to ring this up as myself?" —
         * is asked before every discount and every void, both of which are
         * traced back to whoever the header names.
         */}
        <a
          href="/pos/who"
          className="border-border flex h-11 items-center gap-2.5 rounded-md border pr-1.5 pl-3.5"
        >
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm leading-tight font-semibold">
              {who ?? m.whoTitle}
            </span>
            <span className="text-2xs text-fg-subtle block">{m.whoTitle}</span>
          </span>

          <span
            aria-hidden
            className="bg-brand-100 text-brand-700 grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-semibold"
          >
            {initials(who)}
          </span>
        </a>
      </div>
    </header>
  );
}

/**
 * Two letters for the avatar — `dc.html:11900` (`posUserInit`).
 *
 * Two words at most, because a third initial makes the circle a rectangle at
 * 8px of type; and the first letter of each rather than the first two of the
 * name, so that Jasur Toshev and Jasur Tursunov are not the same badge.
 */
function initials(name: string | null): string {
  if (name === null) return '';

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

/** A table's zone as a string key — `''` when the API sent no hall at all. */
function zoneKey(table: PosTable): string {
  return table.zone.id === null ? '' : String(table.zone.id);
}

/** The ids on the 86 sheet as the server last drew it. */
function stoppedIn(sections: readonly PosSection[]): ReadonlySet<number> {
  return new Set(
    sections.flatMap((entry) => entry.dishes.filter((d) => d.is_stopped).map((d) => d.id)),
  );
}

/**
 * The monogram tints — `dc.html:13204-13205`, the design's five pairs, cycled
 * by section. Light ground, dark letters, in the same hue: a tile's colour is
 * a section's colour, never a dish's own, so the eye can find "Salads" while
 * scrolling without reading a single name.
 */
const TILE_TINTS = [
  'bg-brand-50 text-brand-700',
  'bg-warning-50 text-warning-700',
  'bg-accent-50 text-accent-700',
  'bg-success-50 text-success-700',
  'bg-bg-muted text-fg-muted',
] as const;

/**
 * Two letters of the dish's name — `dc.html:13203`, the design's own rule:
 * letters only, Latin or Cyrillic, so "Osh, to'y" is `OS` and "Лағмон" is `ЛА`
 * rather than a comma or a space.
 */
function monogram(title: string): string {
  return title
    .replace(/[^A-Za-z\u0400-\u04FF']/g, '')
    .slice(0, 2)
    .toUpperCase();
}

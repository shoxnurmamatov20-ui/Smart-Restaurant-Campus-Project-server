'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';

import type { Messages } from '@/i18n';
import { evenShare, fill, guestShares, POS_COPY, say, SPLIT_WAYS } from './pos-copy';

/**
 * The four sheets a waiter opens on an existing bill.
 *
 * Discount, split, move (merge · transfer) and the void prompt. Kept out of
 * `order-screen.tsx` because that file is already the biggest thing in this
 * app, and because all of them are the same shape: a sheet over the cart, a
 * reason, and one call.
 *
 * **Every one of them takes a reason, and none of them will submit without it.**
 * That is not politeness. A discount, a void and a transfer are the three
 * entries the loss-prevention screen is built out of, and a row there reading
 * "−48 000, Jasur T." with no sentence beside it tells a manager nothing at all.
 * The server enforces the same rule (`DiscountRequest` requires three
 * characters); asking here means a waiter finds out before the guest is waiting.
 */
type PosCopy = Messages['console']['pos'];

const SHEET = 'fixed inset-0 z-[220] flex items-end justify-center sm:items-center';
const PANEL =
  'bg-surface-raised w-full max-w-[420px] rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl';

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      data-fade
      className={SHEET}
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      {/* `data-sheet` behind `data-fade`: the design's single overlay motion,
          200ms, up fourteen pixels. `motion.css` carries the reduced-motion
          escape with it. */}
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        className={PANEL}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ReasonField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-fg-subtle mb-1.5 block text-xs">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-bg-subtle border-border h-12 w-full rounded-md border px-3.5 text-sm"
        autoFocus
      />
    </label>
  );
}

/**
 * A discount, as a percentage of the bill.
 *
 * Percentages rather than a free amount, because that is what a manager
 * authorises and what the ceiling is written in — "20%" is a rule, "up to
 * 42 000 so'm" is arithmetic somebody has to do at a table. The server accepts
 * either; this screen only ever sends the percentage.
 *
 * The ceiling is drawn but not enforced here. A client that hid the 20% chip
 * from a waiter would be a client deciding permission, and the answer would be
 * wrong the moment the terminal's settings changed. Above the line, the server
 * refuses and the screen offers to ask a manager — which is the design's
 * behaviour and, unlike a hidden button, tells the waiter why.
 */
export function DiscountSheet({
  m,
  ceiling,
  busy,
  onClose,
  onApply,
}: {
  m: PosCopy;
  /** What this role may do unaided, as a percentage. Drawn, never enforced. */
  ceiling: number;
  busy: boolean;
  onClose: () => void;
  onApply: (percent: number, reason: string) => void;
}) {
  const [percent, setPercent] = useState(5);
  const [reason, setReason] = useState('');

  const STEPS = [5, 10, 15, 20, 50, 100];

  return (
    <Backdrop onClose={onClose}>
      <h3 className="font-display text-lg font-semibold tracking-tight">{m.discount}</h3>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setPercent(step)}
            data-num
            className={`h-14 rounded-md border text-lg font-semibold ${
              percent === step ? 'border-brand-500 bg-brand-50 text-brand-700' : 'bg-surface'
            }`}
          >
            {step}%
            {step > ceiling ? (
              <span className="text-warning-700 mt-0.5 block text-[10px] font-medium">
                {m.needsApproval}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <ReasonField value={reason} onChange={setReason} label={m.reason} />

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-md border text-sm font-semibold"
        >
          {m.cancel}
        </button>
        <button
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => onApply(percent, reason.trim())}
          className="bg-brand-500 h-12 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-45"
        >
          {m.apply}
        </button>
      </div>
    </Backdrop>
  );
}

export type MoveKind = 'split' | 'merge' | 'transfer';

/** How a bill comes apart — `Smart Restaurant OS.dc.html:17294`. */
export type SplitMode = 'guest' | 'item' | 'amount';

/**
 * Splitting a bill, three ways.
 *
 * The design gives this sheet a segmented control and three bodies
 * (`dc.html:8611–8646`), and the till had built one of them: by item. The other
 * two are not variations on it, they are different questions a table asks —
 *
 *   **By guest.** Four people, one bill, everybody pays a quarter. Nobody is
 *   claiming dishes; they are dividing a number. The share is floored to the
 *   nearest thousand so'm because that is the smallest note anybody carries,
 *   and the remainder lands on the last bill rather than being spread as tiyin
 *   across four receipts that then do not add up.
 *
 *   **By item.** One of them is leaving early and these two dishes are theirs.
 *
 *   **By amount.** "Put fifty thousand on a separate bill" — a company card
 *   covering part of the table, a deposit already taken. There is no line to
 *   tick and no head to divide by; there is a figure.
 *
 * A waiter who opened the wrong one changes it with a tap and loses nothing:
 * the mode switch clears the picks and the amount, which is the design's own
 * behaviour (`splitMode` sets `splitPick: []` and `splitAmt: ""`).
 *
 * **All three write.** `POST /pos/bills/{id}/split` takes exactly one of
 * `line_ids`, `ways` or `amount_tiyin` — see `MoveBillRequest` — and answers
 * 201 with the whole family in payment order. The two figures this sheet shows
 * are a preview of a division the server owns (`App\Support\Orders\BillSplit`,
 * mirrored by `evenShare`/`guestShares`), so what a guest is quoted here and
 * what lands on their receipt are the same arithmetic run twice.
 */
export function SplitSheet({
  m,
  lines,
  guests,
  total,
  money,
  busy,
  onClose,
  onSplitLines,
  onSplitEvenly,
  onSplitAmount,
}: {
  m: PosCopy;
  lines: readonly {
    id: number;
    title: string;
    quantity: number;
    total_price: number;
    seat_no: number;
  }[];
  /** Covers on the bill, as the API counted them. The stepper starts here. */
  guests: number;
  /** What the bill comes to, in tiyin — the API's figure, never recomputed. */
  total: number;
  money: (tiyin: number) => string;
  busy: boolean;
  onClose: () => void;
  onSplitLines: (lineIds: number[]) => void;
  onSplitEvenly: (ways: number) => void;
  onSplitAmount: (tiyin: number) => void;
}) {
  const locale = useLocale();
  const word = (phrase: Parameters<typeof say>[1]) => say(locale, phrase);

  const [mode, setMode] = useState<SplitMode>('guest');
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [amount, setAmount] = useState('');
  const [ways, setWays] = useState(() =>
    Math.min(SPLIT_WAYS.max, Math.max(SPLIT_WAYS.min, guests)),
  );

  /*
   * Digits only, and read as so'm.
   *
   * The design's own parse — `parseInt(String(splitAmt).replace(/\D/g, ""), 10)`
   * — so a cashier can type "150 000" with the space they would write it with.
   * Multiplied into tiyin here and nowhere else: the field is the one place on
   * this screen where a human types money, and `CLAUDE.md` rule 1 says the
   * money that leaves this component is an integer count of tiyin.
   */
  const typedTiyin = (Number.parseInt(amount.replace(/\D/g, ''), 10) || 0) * 100;

  const share = evenShare(total, ways);
  const shares = guestShares(total, ways);
  const pickedTotal = lines
    .filter((line) => picked.has(line.id))
    .reduce((sum, line) => sum + line.total_price, 0);

  /*
   * The two figures the sheet exists to show, before anything is committed.
   *
   * A waiter reading two numbers can tell a guest what they owe; a waiter
   * reading a list of ticks cannot.
   *
   * In guest mode the design writes `billB = total - per * (n - 1)`, which is
   * the *last* head's share rather than what the other heads owe together — it
   * reads correctly for a two-way split and understates every wider one. The
   * per-head list below it, which is the part a cashier actually reads out, is
   * self-consistent, so this follows the list: the second card is the
   * complement of the first and the two always add up to the bill.
   */
  const billA =
    mode === 'guest' ? shares[0] : mode === 'item' ? pickedTotal : Math.min(typedTiyin, total);
  const billB = total - billA;

  const ready =
    mode === 'guest'
      ? ways > 1
      : mode === 'item'
        ? picked.size > 0 && pickedTotal < total
        : typedTiyin > 0 && typedTiyin < total;

  const note =
    mode === 'guest'
      ? fill(word(POS_COPY.splitGuestNote), { sum: money(share) })
      : mode === 'item'
        ? word(picked.size > 0 ? POS_COPY.splitItemNote : POS_COPY.splitItemEmptyNote)
        : word(POS_COPY.splitAmountNote);

  function submit() {
    if (!ready) {
      /* The design refuses with a sentence rather than a greyed button that
         says nothing — dc.html:17324. The button is grey too; this is what
         tells a waiter which of the three rules they are on the wrong side of. */
      flash.problem(
        word(
          mode === 'item'
            ? POS_COPY.splitPickALine
            : mode === 'amount'
              ? POS_COPY.splitAmountRange
              : POS_COPY.splitOneGuest,
        ),
      );

      return;
    }

    if (mode === 'item') onSplitLines([...picked]);
    else if (mode === 'guest') onSplitEvenly(ways);
    else onSplitAmount(typedTiyin);
  }

  const MODES: readonly { key: SplitMode; label: string }[] = [
    { key: 'guest', label: word(POS_COPY.splitByGuest) },
    { key: 'item', label: word(POS_COPY.splitByItem) },
    { key: 'amount', label: word(POS_COPY.splitByAmount) },
  ];

  return (
    <Backdrop onClose={onClose}>
      <h3 className="font-display text-lg font-semibold tracking-tight">{m.split}</h3>

      {/* The design's segmented control: 3px padding, 34px cells, the active
          one lifted onto the surface rather than tinted. */}
      <div className="bg-bg-muted mt-4 mb-[18px] flex gap-[3px] rounded-md p-[3px]">
        {MODES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            data-seg
            aria-pressed={mode === entry.key}
            onClick={() => {
              setMode(entry.key);
              /* Switching mode drops the other mode's answer — the design's
                 own `splitPick: [], splitAmt: ""`. Carrying a tick list into
                 an amount split would leave a figure on screen that no longer
                 came from anything the waiter can see. */
              setPicked(new Set());
              setAmount('');
            }}
            className={`h-[34px] flex-1 rounded-[8px] border-0 text-sm font-semibold ${
              mode === entry.key ? 'bg-surface text-fg' : 'text-fg-muted bg-transparent'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {mode === 'guest' ? (
        <>
          {/*
           * How many ways. Two at the floor and twelve at the ceiling — the
           * guest app's own stepper, and the two surfaces settle the same bill.
           */}
          <div className="border-border mb-1 flex items-center justify-between rounded-md border px-3 py-2.5">
            <button
              type="button"
              onClick={() => setWays((n) => Math.max(SPLIT_WAYS.min, n - 1))}
              disabled={ways <= SPLIT_WAYS.min}
              aria-label={m.decrease}
              className="text-fg-muted h-11 min-w-[44px] rounded-[8px] border text-lg font-semibold disabled:opacity-40"
            >
              −
            </button>

            <span className="text-center">
              <span data-num className="font-display block text-2xl font-bold">
                {ways}
              </span>
              <span className="text-fg-subtle text-2xs block">{word(POS_COPY.splitWays)}</span>
            </span>

            <button
              type="button"
              onClick={() => setWays((n) => Math.min(SPLIT_WAYS.max, n + 1))}
              disabled={ways >= SPLIT_WAYS.max}
              aria-label={m.increase}
              className="text-fg-muted h-11 min-w-[44px] rounded-[8px] border text-lg font-semibold disabled:opacity-40"
            >
              +
            </button>
          </div>

          <ul data-scroll className="max-h-[34vh] overflow-y-auto">
            {shares.map((amountTiyin, index) => (
              <li
                key={index}
                className="border-divider flex items-baseline justify-between border-b py-3 last:border-0"
              >
                <span className="text-sm font-medium">
                  {fill(word(POS_COPY.splitGuestN), { n: String(index + 1) })}
                </span>
                <span data-num className="font-display text-md font-semibold">
                  {money(amountTiyin)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {mode === 'item' ? (
        <ul data-scroll className="max-h-[40vh] overflow-y-auto">
          {lines.map((line) => {
            const on = picked.has(line.id);

            return (
              <li key={line.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (on) next.delete(line.id);
                      else next.add(line.id);
                      return next;
                    })
                  }
                  className={`mb-1 flex min-h-[44px] w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left ${
                    on ? 'bg-brand-50' : ''
                  }`}
                >
                  <span
                    className={`grid size-5 flex-none place-items-center rounded-[6px] border-[1.5px] text-[11px] font-bold text-white ${
                      on ? 'border-brand-500 bg-brand-500' : 'border-border-strong'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>

                  {/* The count leads in brand, as the design draws it: a waiter
                      moving "two of the three plovs" reads the number first. */}
                  <span
                    data-num
                    className="text-brand-600 w-[30px] flex-none text-sm font-semibold"
                  >
                    {line.quantity} ×
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{line.title}</span>
                    <span data-num className="text-fg-subtle text-2xs mt-0.5 block">
                      {line.seat_no > 0 ? `${m.seat} ${line.seat_no}` : word(POS_COPY.splitShared)}
                    </span>
                  </span>

                  <span data-num className="flex-none text-sm font-semibold">
                    {money(line.total_price)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {mode === 'amount' ? (
        <label className="block">
          <span className="text-fg-muted mb-[7px] block text-xs font-semibold">
            {word(POS_COPY.splitAmountLabel)}
          </span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            placeholder="150 000"
            autoFocus
            className="border-border-strong bg-surface font-display h-[46px] w-full rounded-md border px-3.5 text-lg font-semibold"
          />
        </label>
      ) : null}

      <p className="text-fg-subtle mt-[14px] mb-[18px] text-xs leading-normal">{note}</p>

      {/*
       * The two bills, side by side. A 1px grid on the divider colour, which is
       * how the design draws every paired figure on this surface.
       */}
      <div className="bg-divider border-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border">
        <div className="bg-surface px-4 py-[15px]">
          <div className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">
            {mode === 'guest' ? word(POS_COPY.splitGuestOne) : word(POS_COPY.splitBillOne)}
          </div>
          <div data-num className="font-display mt-[5px] text-2xl font-bold tracking-tight">
            {money(billA)}
          </div>
        </div>
        <div className="bg-surface px-4 py-[15px]">
          <div className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">
            {mode === 'guest'
              ? fill(word(POS_COPY.splitGuestRest), { n: String(ways - 1) })
              : word(POS_COPY.splitBillTwo)}
          </div>
          <div data-num className="font-display mt-[5px] text-2xl font-bold tracking-tight">
            {money(billB)}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className={`mt-[18px] flex h-[50px] w-full items-center justify-center rounded-md text-base font-semibold text-white disabled:opacity-45 ${
          ready ? 'bg-brand-500' : 'bg-n-300'
        }`}
      >
        {word(POS_COPY.splitConfirm)}
      </button>

      <p className="text-fg-subtle mt-[11px] text-xs leading-normal">
        {word(POS_COPY.splitFootnote)}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="text-fg-muted mt-3 h-11 w-full rounded-md border text-sm font-semibold"
      >
        {m.cancel}
      </button>
    </Backdrop>
  );
}

/**
 * Merging and moving a bill.
 *
 * One sheet with two modes because the question behind them is one question —
 * "where is this table sitting now" — and because a waiter who opened Merge and
 * meant Transfer should not have to close anything. Splitting used to live here
 * too; it has its own panel above, because the design gives it three modes and
 * a preview and none of that fits beside a grid of table numbers.
 */
export function MoveSheet({
  m,
  kind,
  tables,
  otherBills,
  busy,
  onClose,
  onMerge,
  onTransfer,
}: {
  m: PosCopy;
  kind: Exclude<MoveKind, 'split'>;
  tables: readonly { id: number; label: string }[];
  /** The other open bills on this table, for a merge. */
  otherBills: readonly { id: number; label: string }[];
  busy: boolean;
  onClose: () => void;
  onMerge: (targetBillId: number) => void;
  onTransfer: (tableId: number) => void;
}) {
  const [target, setTarget] = useState<number | null>(null);

  const title = kind === 'merge' ? m.merge : m.transfer;
  const options = kind === 'merge' ? otherBills : tables;

  return (
    <Backdrop onClose={onClose}>
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>

      <p className="text-fg-subtle mt-1.5 text-xs leading-normal">
        {kind === 'merge' ? m.mergeSub : m.transferSub}
      </p>

      <div data-scroll className="mt-3.5 grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto">
        {options.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTarget(entry.id)}
            className={`h-14 rounded-md border text-sm font-semibold ${
              target === entry.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'bg-surface'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {options.length === 0 ? <p className="text-fg-subtle mt-3 text-xs">{m.moveNowhere}</p> : null}

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-md border text-sm font-semibold"
        >
          {m.cancel}
        </button>
        <button
          type="button"
          disabled={busy || target === null}
          onClick={() => {
            if (target === null) return;

            if (kind === 'merge') onMerge(target);
            else onTransfer(target);
          }}
          className="bg-brand-500 h-12 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-45"
        >
          {title}
        </button>
      </div>
    </Backdrop>
  );
}

/**
 * Removing a line, with the reason the ledger needs.
 *
 * A line the kitchen has not seen is a correction; a line already fired is food
 * that was cooked and thrown away, and the sheet says which of the two this is
 * before anybody taps. The server decides whether it needs a manager — the
 * screen only reports what it answered.
 */
export function VoidSheet({
  m,
  line,
  fired,
  money,
  busy,
  onClose,
  onVoid,
}: {
  m: PosCopy;
  line: { id: number; title: string; total_price: number };
  /** Whether the kitchen has already been told about it. */
  fired: boolean;
  money: (tiyin: number) => string;
  busy: boolean;
  onClose: () => void;
  onVoid: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Backdrop onClose={onClose}>
      <h3 className="font-display text-lg font-semibold tracking-tight">{m.remove}</h3>

      <div className="bg-bg-subtle mt-3.5 flex items-baseline justify-between rounded-md px-3.5 py-3">
        <span className="text-sm font-medium">{line.title}</span>
        <span data-num className="text-sm font-semibold">
          {money(line.total_price)}
        </span>
      </div>

      {fired ? (
        <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-3 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
          {m.voidFired}
        </p>
      ) : null}

      <ReasonField value={reason} onChange={setReason} label={m.reason} />

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-md border text-sm font-semibold"
        >
          {m.cancel}
        </button>
        <button
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => onVoid(reason.trim())}
          className="bg-danger-500 h-12 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-45"
        >
          {m.remove}
        </button>
      </div>
    </Backdrop>
  );
}

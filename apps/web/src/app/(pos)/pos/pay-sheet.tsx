'use client';

import { useEffect, useState } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';

import type { BillRates } from './rates-server';
import { formatTiyinAmount } from '@restaurant/utils';
import { flash } from '@restaurant/ui';

import type { Messages } from '@/i18n';
import { POS_TENDER_METHODS, type PosPayable, type PosTenderMethod } from '@/lib/pos-tenders';
import { POS_COPY, say } from './pos-copy';

/**
 * Taking the money.
 *
 * The last screen between a guest and the door, and the one where every rule this
 * till is built on has to hold at once.
 *
 * **The server owns the money, and here that is not a preference.** Every figure on
 * this screen — what cash settles the bill for, what rounding moved, what is still
 * owed, what change is due — comes back from `POST .../tender-quote`, re-asked
 * whenever the split changes. This component does no money arithmetic at all.
 *
 * That is stricter than it first looks, and it is stricter because the looser
 * version was wrong. The sheet used to round the bill total itself while the
 * settlement rounded the cash REMAINDER. For a cash-only sale those are the same
 * number, which is why it read as correct. Split a bill with a card amount that is
 * not a round figure and they diverge: the screen tells the cashier the guest is
 * square, the server records a part payment, and the table walks out owing money
 * nobody knows about.
 *
 * **A tip is not a discount.** It rides on top of what was handed over and never
 * reduces the bill (DECISIONS Q6). It has its own field for that reason: a cashier
 * who could only enter one number would be typing the total plus the tip into a
 * field the API reads as payment, and the guest would be charged for their own
 * generosity.
 *
 * **The failure that matters is not a refusal.** A refused settlement is safe — the
 * API said no and nothing moved. The dangerous one is a request that never came
 * back, because the money may or may not be recorded, and the honest answer is to
 * tell the cashier to look at the bill rather than to take payment twice. That is
 * what `payUnknown` says, and it is deliberately not phrased as a failure.
 */
type Line = {
  method: PosTenderMethod;
  /** What the guest handed over on this method, in tiyin. Empty while typing. */
  amount: string;
  /** The part of it they meant as a tip. */
  tip: string;
  /** The card authorisation code, for the methods that have one. */
  reference: string;
};

/**
 * What the server says this settlement comes to.
 *
 * Every figure on the screen below comes from here. The sheet does not round, does
 * not subtract and does not decide whether the bill is covered — because the two
 * implementations would then have to agree forever, and they already failed to
 * once: the screen rounded the bill total while the settlement rounded the cash
 * remainder. For a cash-only sale those are the same number, which is why it looked
 * right for as long as nobody split a bill with an odd card amount.
 */
type Quote = {
  due: number;
  applied: number;
  /** What cash settles it for, rounded — the figure a cashier reads out loud. */
  cash_to_collect: number;
  /** Signed (DECISIONS Q7). */
  rounding: number;
  tips: number;
  change: number;
  settled: boolean;
  remaining: number;
};

export type Settlement = {
  settled: boolean;
  change: number;
  rounding: number;
  tips: number;
  applied: number;
  due: number;
  bill: { status: string; number: string };
};

export function PaySheet({
  payable,
  bill,
  billNumber,
  onSettled,
  onClose,
  onSplit,
  onDiscount,
  rates = null,
}: {
  payable: PosPayable;
  /**
   * The bill's own figures, for the breakdown above the total.
   *
   * Passed in rather than re-fetched, and never recomputed here: every number
   * on this drawer comes down from the API, because a till that could work out
   * a total could disagree with the receipt — in front of a guest, with money
   * already on the counter.
   */
  bill: {
    id: number;
    customerId: number | null;
    subtotal: number;
    discount: number;
    service: number;
    delivery: number;
    vat: number;
    total: number;
  };
  billNumber: string;
  /**
   * The venue's own VAT and service rates — `fetchBillRates()`, handed down.
   *
   * Only the two labels use them. `console.pos.payService` and `vatIncluded`
   * are the rate-free forms and remain the answer when the till may not read
   * settings, which is the ordinary case for a cashier: a printed rate a
   * cashier reads off this screen that the restaurant is not on is worse than
   * no rate at all, because a guest will be told it.
   */
  rates?: BillRates | null;
  /** Handed the settlement so the order screen can close or stay open. */
  onSettled: (result: Settlement) => void;
  onClose: () => void;
  /**
   * The two doors the design puts *inside* the payment drawer — `dc.html:8305`.
   *
   * Both are things a guest asks for at the moment of paying and not before:
   * "can we split this" and "we have a card". Reaching them meant closing the
   * drawer, finding a 44px button in the ticket footer, and opening it again —
   * with a queue at the counter. They close this drawer and open the other
   * sheet, because a split changes the figure this drawer is quoting and the
   * drawer must not survive it.
   */
  onSplit: () => void;
  onDiscount: () => void;
}) {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  /* The formatter, for the two labels that take a number — see `order-screen`
     for why both readers over one namespace. */
  const pos = useTranslations('console.pos');
  const locale = useLocale() as 'uz' | 'ru' | 'en';

  const money = (tiyin: number) => formatTiyinAmount(tiyin, locale);

  /*
   * Opens on cash, pre-filled with the rounded figure.
   *
   * The overwhelmingly common settlement is one guest paying the whole bill in
   * cash, and pre-filling it means that case is two taps: open, confirm. A cashier
   * who has to type 45 000 forty times a shift will eventually type 4 500.
   */
  const [lines, setLines] = useState<Line[]>([
    { method: 'cash', amount: String(payable.cash_total), tip: '', reference: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /*
   * Whose tab it is, read once the cashier reaches for one.
   *
   * The bill carries only `customer_id`; the name and the balance come from
   * `GET /crm/customers/{id}` through this app's own handler. Read lazily
   * rather than with the bill, because the overwhelming majority of settlements
   * never touch a tab and this is a request per bill that would be wasted.
   */
  const [customer, setCustomer] = useState<{ id: number; name: string; balance: number } | null>(
    null,
  );

  /*
   * Whether a tab charge can actually be taken.
   *
   * `TenderService` charges `credit` against the bill's customer, so a bill with
   * nobody on it cannot carry one — the settlement would be a meal recorded as
   * sold with no line to collect against. The drawer says so and offers the
   * lookup rather than letting the cashier press a button that 422s.
   */
  const onAccount = lines.some((line) => line.method === 'credit');
  const creditBlocked = onAccount && bill.customerId === null;

  useEffect(() => {
    if (!onAccount || bill.customerId === null || customer !== null) return;

    let live = true;

    void fetch(`/api/pos/customer?id=${bill.customerId}`)
      .then((response) => response.json())
      .then((body: { data?: { id: number; name: string; balance: number } | null }) => {
        if (live && body.data != null) setCustomer(body.data);
      })
      .catch(() => {
        /* A name that did not load is a name the drawer simply does not print.
           The tab itself is the server's to accept or refuse. */
      });

    return () => {
      live = false;
    };
  }, [onAccount, bill.customerId, customer]);

  /*
   * The server's answer for what is currently typed in.
   *
   * One piece of state holding both halves, because they arrive together and are
   * only ever meaningful together: a quote with a refusal beside it would let the
   * screen show a figure for a split the API has just said it will not accept.
   *
   * Null until the first answer comes back, and null again whenever one fails — a
   * screen showing a stale figure while the cashier changes the split is worse than
   * one showing none, because the stale one looks authoritative.
   */
  const [answered, setAnswered] = useState<{ quote: Quote | null; refused: string | null } | null>(
    null,
  );

  const tiyin = (value: string) => {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const payload = lines.map((line) => ({
    method: line.method,
    amount: tiyin(line.amount),
    tip: tiyin(line.tip),
    reference: line.reference.trim() === '' ? null : line.reference.trim(),
  }));

  /*
   * Re-quoted whenever the split changes, keyed on what was actually sent.
   *
   * The key is why this is an effect rather than a call in the change handler: a
   * cashier holding a key down produces a dozen renders, and keying on the payload
   * collapses them into one request per distinct state. `cancelled` drops a late
   * answer to an older split — arriving out of order it would quote a figure for
   * something the cashier has already changed, which is the one way a screen like
   * this lies convincingly.
   */
  const asked = JSON.stringify(payload.filter((line) => line.amount > 0));

  useEffect(() => {
    const tenders = JSON.parse(asked) as typeof payload;

    /*
     * Nothing typed yet, so nothing to ask and — deliberately — no state written.
     *
     * Clearing it here instead would be a synchronous `setState` inside an effect,
     * which renders once with the old answer before correcting itself and is what
     * `react-hooks/set-state-in-effect` exists to catch. The empty case is derived
     * below instead, from the same value this effect keys on, so the two cannot
     * disagree.
     */
    if (tenders.length === 0) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/pos/tender?bill=${billNumber}&quote=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenders }),
        });

        if (cancelled) return;

        if (!response.ok) {
          setAnswered(null);

          return;
        }

        const body = (await response.json()) as { data?: Quote | null; refused?: string | null };

        if (cancelled) return;

        setAnswered({ quote: body.data ?? null, refused: body.refused ?? null });
      } catch {
        if (!cancelled) setAnswered(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asked, billNumber]);

  /*
   * What the screen actually reads, derived rather than stored.
   *
   * `asked` is the payload the effect sent; when it is empty there is no answer to
   * show, whatever the last one happened to be. Deriving it here means clearing the
   * fields never leaves a figure from a previous split on screen for a frame.
   */
  const nothingTyped = asked === '[]';
  const quote = nothingTyped ? null : (answered?.quote ?? null);
  const refused = nothingTyped ? null : (answered?.refused ?? null);

  const hasCash = lines.some((line) => line.method === 'cash');

  function update(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
    setFailed(null);
  }

  async function submit() {
    if (busy) return;

    const tenders = payload.filter((line) => line.amount > 0);

    if (tenders.length === 0) {
      setFailed(m.payFailed);
      flash.problem(m.payFailed);

      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      const response = await fetch(`/api/pos/tender?bill=${billNumber}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenders }),
      });

      const body = (await response.json().catch(() => null)) as {
        data?: Settlement;
        message?: string;
        error?: string;
      } | null;

      if (response.status === 502) {
        // The one case that must not read as a failure. See the class note.
        setFailed(m.payUnknown);
        flash.problem(m.payUnknown);

        return;
      }

      if (!response.ok || body?.data === undefined) {
        setFailed(body?.message ?? m.payFailed);
        flash.problem(body?.message ?? m.payFailed);

        return;
      }

      /* The settled toast belongs to the screen behind this one — it survives
         the sheet closing, and `order-screen.tsx` knows whether the change is
         owed. */
      onSettled(body.data);
    } catch {
      setFailed(m.payUnknown);
      flash.problem(m.payUnknown);
    } finally {
      setBusy(false);
    }
  }

  return (
    /*
     * A right-hand drawer, not a centred modal.
     *
     * `specs/01-os.md §5.15` draws it full height at 480px and the reason is
     * the geometry of the till: the cart is on the right and the guest is
     * paying for what is in it, so the sheet opens over the cart and leaves the
     * menu visible. A centred 560px box covers both columns and hides the
     * thing the number refers to.
     */
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        data-scrim
        aria-label={m.payCancel}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <section
        data-sheet
        className="bg-surface border-border relative flex h-full w-full max-w-[480px] flex-col border-l"
      >
        <header className="border-divider flex flex-none items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-display tracking-snug text-xl leading-tight font-semibold">
              {m.payTitle}
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-fg-muted text-sm">{hasCash ? m.payRounded : m.payDue}</span>
              {/*
               * The quote's figure while there is one, the bill's total before the
               * first answer arrives. The fallback is the un-rounded total on
               * purpose: it is the one number that is true regardless of the split,
               * so a screen that has not heard back yet is vague rather than wrong.
               */}
              <span data-num className="font-display text-2xl font-bold tabular-nums">
                {money(quote === null ? payable.total : quote.cash_to_collect)}
              </span>
            </div>

            {/*
             * The rounding, named. A cashier who sees 45 000 where the bill said
             * 45 240 and has no explanation on screen assumes the till is wrong —
             * and tells the guest so.
             */}
            {quote !== null && quote.rounding !== 0 ? (
              <div className="text-fg-subtle text-2xs mt-1">
                {money(quote.due)} · {quote.rounding > 0 ? '+' : '−'}
                {money(Math.abs(quote.rounding))}{' '}
                {m.payRoundingNote.replace('{step}', money(payable.cash_rounding_step))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border-border flex h-11 w-11 flex-none items-center justify-center rounded-md border text-lg"
          >
            ×
          </button>
        </header>

        {failed !== null ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 mx-5 mt-3 rounded-[10px] px-3 py-2.5 text-sm font-medium"
          >
            {failed}
          </p>
        ) : null}

        <div data-scroll className="min-h-0 flex-1 px-5 py-4">
          {/*
           * What the total is made of — `specs/01-os.md §5.24`.
           *
           * The drawer opened straight onto the split with one figure at the
           * top, so a guest asking "why is it 284 000?" got a cashier reading
           * the paper bill instead of the screen in front of them. VAT is
           * *included* in the price and is shown as such, never added: the line
           * says what is already inside the total. Rows worth nothing are not
           * drawn — a bill with no delivery fee should not have a delivery row.
           */}
          <dl className="border-border bg-bg-subtle mb-4 rounded-md border px-3.5 py-3">
            {(
              [
                [m.paySubtotal, bill.subtotal, false],
                [m.payDiscount, -bill.discount, false],
                [
                  rates === null ? m.payService : pos('serviceRate', { percent: rates.service }),
                  bill.service,
                  false,
                ],
                [m.payDelivery, bill.delivery, false],
                /*
                 * The rate when the till was allowed to read it, and none when
                 * it was not — never `payVat`, which prints a constant "12%".
                 * The amount is always the server's; the percentage beside it
                 * has to come from the same setting it was computed from, or a
                 * cashier reads a rate off this screen that the restaurant is
                 * not on and tells a guest.
                 */
                [
                  rates === null ? m.vatIncluded : pos('vatRate', { percent: rates.vat }),
                  bill.vat,
                  true,
                ],
              ] as const
            )
              .filter(([, amount]) => amount !== 0)
              .map(([label, amount, muted]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 py-0.5">
                  <dt className={`text-xs ${muted ? 'text-fg-subtle' : 'text-fg-muted'}`}>
                    {label}
                  </dt>
                  <dd data-num className={`text-xs ${muted ? 'text-fg-subtle' : 'font-semibold'}`}>
                    {amount < 0 ? '−' : ''}
                    {money(Math.abs(amount))}
                  </dd>
                </div>
              ))}

            <div className="border-divider mt-1.5 flex items-baseline justify-between gap-3 border-t pt-2">
              <dt className="text-sm font-semibold">{m.payDue}</dt>
              <dd data-num className="font-display text-md font-bold">
                {money(bill.total)}
              </dd>
            </div>
          </dl>

          {/*
           * Whose tab, when one of the lines is a tab.
           *
           * The phone number is the platform's only identity key
           * (`people.phone_e164`), so it is what the lookup takes. A refusal
           * comes back as "no such customer" rather than an error, because the
           * common case is a guest who has never been given an account and the
           * cashier needs to hear that, not "500".
           */}
          {onAccount ? (
            <div className="border-border mb-4 rounded-md border px-3.5 py-3">
              {bill.customerId === null ? (
                /*
                 * A tab needs a customer, and this drawer cannot give the bill
                 * one.
                 *
                 * `TenderService` charges `credit` against `guestFor($bill)`,
                 * and a customer is attached when the bill is **opened** —
                 * `OpenBillRequest` takes `customer_id`, and nothing on the API
                 * moves one onto a bill that is already open. So the drawer
                 * says where the customer is chosen instead of offering a
                 * search box that would find somebody and then be unable to use
                 * them. That is the difference between a control that is
                 * unavailable and one that lies.
                 */
                <p className="text-warning-700 text-sm leading-normal font-medium">
                  {m.payAccountNeeded}
                </p>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{customer?.name ?? m.payAccountOn}</span>
                  {customer === null ? null : (
                    <span data-num className="text-fg-muted text-xs">
                      {money(customer.balance)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {lines.map((line, index) => (
            <div key={index} className="border-divider mb-4 border-b pb-4 last:mb-0 last:border-0">
              {/* 44px targets, because this is a tablet held in one hand. */}
              {/*
               * A 2-up grid of 64px tiles, each with a sub-line — the design's,
               * and worth the vertical space it costs. The chips this replaces
               * were nine 44px pills of pure brand names, and "Humo" beside
               * "Uzum" tells a cashier nothing about which one the guest is
               * holding. The sub-line names the thing in their hand: a card, a
               * phone, a company account.
               */}
              <div className="grid grid-cols-2 gap-2">
                {POS_TENDER_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => update(index, { method: method.id })}
                    /*
                     * Tinted and outlined, not filled — `dc.html:13259`, where
                     * the picked method is `brand-50` behind `brand-700` on a
                     * `brand-500` border. A solid brand fill puts the loudest
                     * colour on the drawer twice: once here and once on Take
                     * payment, and the eye goes to whichever is larger rather
                     * than to the one that finishes the sale.
                     */
                    className={`flex h-16 flex-col items-start justify-center rounded-md border px-3.5 text-left ${
                      line.method === method.id
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-border bg-surface text-fg'
                    }`}
                  >
                    <span className="text-sm font-semibold">
                      {method.label === null ? method.brand : m[method.label]}
                    </span>
                    <span className="text-2xs text-fg-subtle mt-0.5">
                      {m[`hint_${method.id}` as 'methodCash'] ?? ''}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-fg-muted text-2xs block font-semibold">
                    {m.payReceived}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.amount}
                    onChange={(event) =>
                      update(index, { amount: event.target.value.replace(/[^\d]/g, '') })
                    }
                    data-num
                    className="border-border mt-1 h-12 w-full rounded-md border px-3 text-right text-base font-semibold tabular-nums"
                  />
                </label>

                <label className="block">
                  <span className="text-fg-muted text-2xs block font-semibold">{m.payTip}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.tip}
                    onChange={(event) =>
                      update(index, { tip: event.target.value.replace(/[^\d]/g, '') })
                    }
                    data-num
                    className="border-border mt-1 h-12 w-full rounded-md border px-3 text-right text-base font-semibold tabular-nums"
                  />
                </label>
              </div>

              {/* Only where there is a code to keep. A cash sale has no reference,
                  and an empty field beside one invites a cashier to invent one. */}
              {line.method !== 'cash' && line.method !== 'corporate' ? (
                <label className="mt-3 block">
                  <span className="text-fg-muted text-2xs block font-semibold">
                    {m.payReference}
                  </span>
                  <input
                    type="text"
                    value={line.reference}
                    onChange={(event) => update(index, { reference: event.target.value })}
                    className="border-border mt-1 h-11 w-full rounded-md border px-3 text-sm"
                  />
                </label>
              ) : null}

              {lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                  className="text-fg-subtle mt-2.5 h-9 text-xs font-semibold underline"
                >
                  {m.payRemove}
                </button>
              ) : null}
            </div>
          ))}

          {/*
           * A split, up to the six the API accepts. Four guests with four cards is a
           * real table, and a till that could only take one method would send the
           * cashier to run the same bill four times.
           */}
          {lines.length < 6 ? (
            <button
              type="button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    method: 'uzcard',
                    // Pre-filled with what the SERVER says is left, so a split does
                    // not start from a number this screen worked out.
                    amount: String(quote?.remaining ?? ''),
                    tip: '',
                    reference: '',
                  },
                ])
              }
              className="border-border h-11 w-full rounded-md border border-dashed text-sm font-semibold"
            >
              {m.payAdd}
            </button>
          ) : null}

          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onSplit}
              className="text-fg-muted h-11 flex-1 rounded-md border text-sm font-medium disabled:opacity-45"
            >
              {say(locale, POS_COPY.paySplitByGuest)}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDiscount}
              className="text-fg-muted h-11 flex-1 rounded-md border text-sm font-medium disabled:opacity-45"
            >
              {say(locale, POS_COPY.payApplyDiscount)}
            </button>
          </div>
        </div>

        <footer className="border-border flex-none border-t px-[26px] pt-[18px] pb-[22px]">
          {/*
           * The refusal, in the API's own words and in normal type.
           *
           * "Bitta hisobda faqat bitta naqd to'lov bo'ladi" is something a cashier
           * mid-entry needs to read and act on, not an alarm. A screen full of red
           * for a half-typed split teaches them to ignore red.
           */}
          {refused !== null ? (
            <p className="text-warning-700 mb-2.5 text-xs font-medium">{refused}</p>
          ) : null}

          <div className="flex items-baseline justify-between text-sm">
            <span className="text-fg-muted">
              {quote !== null && quote.remaining > 0 ? m.payRemaining : m.payChange}
            </span>
            <span
              data-num
              className={`font-display text-xl font-bold tabular-nums ${
                quote !== null && quote.remaining > 0 ? 'text-warning-700' : ''
              }`}
            >
              {money(quote === null ? 0 : quote.remaining > 0 ? quote.remaining : quote.change)}
            </span>
          </div>

          {/*
           * Disabled until the server has quoted something it would accept.
           *
           * Not merely until an amount is typed: a split the API refuses would fail
           * on submission anyway, and refusing it here means the cashier finds out
           * while they are still looking at the fields rather than after they have
           * taken the money.
           */}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || quote === null || refused !== null || creditBlocked}
            className="bg-brand-500 mt-3.5 flex h-14 w-full items-center justify-center rounded-md text-base font-semibold text-white disabled:opacity-45"
          >
            {busy ? m.payWorking : m.paySubmit}
          </button>

          {/*
           * The way out that is not the ✕ in the corner.
           *
           * A cashier who has opened this drawer by mistake, mid-service, with a
           * guest waiting, should not have to find a 44px glyph at the top of a
           * full-height panel. The design puts a second exit under the primary
           * action for exactly that.
           */}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-fg-muted mt-2 h-11 w-full text-sm font-medium disabled:opacity-45"
          >
            {say(locale, POS_COPY.payKeepOpen)}
          </button>
        </footer>
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { flash } from '@restaurant/ui';

import {
  billTotals,
  cashRoundingDelta,
  percentOf,
  roundedForCash,
} from '@restaurant/surfaces/money';

import { promoDiscount, useCart } from '../../cart-store';
import { listAddresses, placeOrder, readProfile, type Address } from '../../customer-client';
import { copy, PAY, SHARED } from '@restaurant/surfaces/customer/copy';
import {
  CASH_ROUNDING,
  FREE_DELIVERY_OVER,
  PAYMENT_RAILS,
  SAVED_ADDRESSES,
  say,
  TIP_STEPS,
  type Lang,
} from '@restaurant/surfaces/customer/data';
import { placeOrderPayloadFrom } from '@restaurant/surfaces/customer/order';
import { Money } from '../../money';
import { isOnlineRail, leaveForProvider, openInvoice } from './pay-online';

/**
 * Payment.
 *
 * Three things are decided here and each is a different kind of number:
 *
 *   · the **bill**, which `billTotals()` alone computes — same call, same
 *     inputs as the cart screen, so the figure cannot change between the two
 *     screens without the basket changing;
 *   · the **tip**, which is not part of the bill at all. It goes to the courier
 *     and never enters the restaurant's revenue, so it is added after the total
 *     rather than inside it. Folding it in would put a courier's tip into a
 *     Z report and onto a VAT return, which is somebody's tax problem;
 *   · the **rounding**, which exists only when the rail is cash. It is shown as
 *     its own line and never quietly folded into the total — a guest handed a
 *     figure 400 so'm off the one they just read is owed the sentence
 *     explaining it.
 */
export function PayBoard({
  lang,
  signedIn = false,
}: {
  lang: Lang;
  /** Whether anybody holds a customer session on this device — see `page.tsx`. */
  signedIn?: boolean;
}) {
  const t = copy(PAY, lang);
  const s = copy(SHARED, lang);
  const cart = useCart();
  const router = useRouter();

  const [railId, setRailId] = useState(PAYMENT_RAILS[0]!.id);
  const [addressId, setAddressId] = useState(
    (SAVED_ADDRESSES.find((address) => address.primary) ?? SAVED_ADDRESSES[0])?.id ?? '',
  );
  const [tipPercent, setTipPercent] = useState(0);
  const [placing, setPlacing] = useState(false);

  /*
   * Who is ordering, and where to.
   *
   * Null until the profile answers, and null forever for a guest who is not
   * signed in — which is a supported way to order here, so the screen falls
   * back to the fixture addresses and says where real ones come from. What it
   * must NOT do is send a fixture address to a courier, so `place()` refuses
   * when the live list is empty and the channel is delivery.
   */
  const [me, setMe] = useState<{ name: string; phone: string } | null>(null);
  const [addresses, setAddresses] = useState<readonly Address[] | null>(null);

  useEffect(() => {
    // Nobody signed in: the profile call would answer 401, and a guest may
    // order without an account. The fixture addresses stand in, and `place()`
    // still refuses to send one to a courier.
    if (!signedIn) return;

    let live = true;

    void (async () => {
      const profile = await readProfile(lang);

      if (!live || !profile.ok) return;

      setMe({ name: profile.data.name ?? '', phone: profile.data.phone });

      const book = await listAddresses(lang);

      if (!live || !book.ok) return;

      setAddresses(book.data);
      setAddressId((current) =>
        book.data.some((address) => String(address.id) === current)
          ? current
          : String((book.data.find((address) => address.is_default) ?? book.data[0])?.id ?? ''),
      );
    })();

    return () => {
      live = false;
    };
  }, [lang, signedIn]);

  const delivering = cart.channel === 'delivery';
  const branch = cart.venues.find((venue) => venue.id === cart.branchId) ?? cart.venues[0] ?? null;
  const rail = PAYMENT_RAILS.find((option) => option.id === railId) ?? PAYMENT_RAILS[0]!;

  const bill = billTotals({
    subtotal: cart.subtotal,
    channel: delivering ? 'delivery' : 'takeaway',
    discount: promoDiscount(cart.promo, cart.subtotal),
    /*
     * The venue's own fee, from `GET /api/v1/public/branches`, not the
     * fixture's flat 12 000. The server recomputes it on the order from the
     * same setting, so the figure a guest reads here is the one they are
     * charged — the drift `pricing.ts` warns about, closed at its last seam.
     */
    deliveryFee: delivering && cart.subtotal < FREE_DELIVERY_OVER ? (branch?.deliveryFee ?? 0) : 0,
  });

  /*
   * The tip is a percentage of the food, taken **before** the discount and
   * never on the delivery fee, then rounded to a whole 1 000 so'm.
   *
   * All three parts are the design's — `tipVal = round(sub * pct / 100 / 1000)
   * * 1000`, where `sub` is the pre-discount subtotal. Two of them had drifted:
   * the base was the discounted line, so a 20% promo quietly cut the courier's
   * tip although the ride was the same distance; and the figure was exact, so a
   * 10% tip on 154 000 offered somebody 15 400 so'm — a number nobody carries
   * and no card terminal is being asked for here, since this is cash into a
   * courier's hand.
   *
   * The rounding step is the cash denomination, which is why it reuses
   * `CASH_ROUNDING` rather than declaring a second thousand.
   */
  const tipExact = delivering ? percentOf(bill.subtotal, tipPercent) : 0;
  const tip = Math.round(tipExact / CASH_ROUNDING) * CASH_ROUNDING;

  const payable = bill.total + tip;
  const rounding = rail.isCash ? cashRoundingDelta(payable) : 0;
  const charged = rail.isCash ? roundedForCash(payable) : payable;

  /*
   * An empty basket cannot be paid for, and arriving here with one means a back
   * button after an order was placed. Sent away from an effect rather than
   * during the render: navigating while rendering updates the router mid-tree,
   * which React refuses in development and behaves unpredictably about in
   * production. The empty frame it costs is one paint of nothing.
   */
  const empty = cart.resolved.length === 0;

  useEffect(() => {
    if (empty) router.replace('/customer/cart');
  }, [empty, router]);

  if (empty) return null;

  /*
   * Why this basket cannot be sent, in one sentence, before it is tried.
   *
   * Four reasons and they are checked in the order a guest can act on: a demo
   * catalogue is nothing they can fix, a missing phone means signing in, a
   * missing address means picking one. Rendered under the button rather than
   * flashed after a tap — a disabled button with no reason beside it is the
   * one thing worse than a button that fails.
   */
  const address = (addresses ?? []).find((option) => String(option.id) === addressId) ?? null;
  const blocked = !cart.orderable
    ? t.sampleMenu
    : me === null
      ? t.phoneNeeded
      : delivering && address === null
        ? t.addressNeeded
        : null;

  /**
   * Turn the basket into a bill, and take the guest to whatever comes next.
   *
   * Nothing that is money goes up: the body carries ids, quantities and the
   * promo WORD, and the server prices all of it — including re-pricing the
   * code, which is why `data.promo` can come back null on a code the cart drew
   * a discount for. That is not a failure and does not stop the order; it is
   * said out loud, because a guest who saw −15% and is charged full price is
   * owed the sentence.
   *
   * Then one of two endings. A cash or card-at-the-door order is already on a
   * pass — the API fired it inside the same transaction — so the tracking
   * screen is the next thing. An online one is NOT: it waits at `draft` with
   * `payment_state = 'pending'`, no docket anywhere, until a provider says the
   * money landed. So the browser is handed to the provider, and comes back to
   * the tracking screen through the return URL.
   */
  async function place(): Promise<void> {
    if (me === null) return;

    const payload = placeOrderPayloadFrom({
      channel: cart.channel,
      branchId: cart.branchId,
      lines: cart.resolved.map((entry) => entry.line),
      name: me.name === '' ? me.phone : me.name,
      phone: me.phone,
      address: address?.full_line ?? null,
      addressNote: address?.note ?? null,
      promoCode: cart.promo?.code ?? null,
      railId,
      source: 'web',
    });

    if (payload === null) {
      flash.problem(t.sampleMenu);

      return;
    }

    setPlacing(true);

    const answer = await placeOrder(lang, payload);

    if (!answer.ok) {
      setPlacing(false);
      flash.problem(answer.message ?? t.rejected);

      return;
    }

    const order = answer.data;

    // The basket is spent either way. Held on to, a guest who lands back here
    // from a provider would order the same dinner twice.
    cart.markPlaced(order.number, me.phone);
    cart.clear();

    if (cart.promo !== null && order.promo === null) {
      flash.problem(t.promoNotApplied);
    }

    if (isOnlineRail(railId)) {
      const { invoice, reason } = await openInvoice({
        orderId: order.id,
        orderNumber: order.number,
        railId,
        returnUrl: `${window.location.origin}/customer/order?n=${encodeURIComponent(order.number)}`,
      });

      if (invoice !== null) {
        leaveForProvider(invoice);

        return;
      }

      /*
       * The rail refused and the order still exists, unpaid and uncooked. The
       * guest is sent to tracking rather than left on a dead checkout: the
       * screen there reads `payment.state` and can offer the rail again, which
       * is the only place that retry belongs now that the basket is gone.
       */
      flash.problem(reason ?? t.rejected);
    }

    flash(`${t.accepted} · №${order.number}`);
    router.push(`/customer/order?n=${encodeURIComponent(order.number)}`);
  }

  return (
    <>
      <main className="flex-1 pb-6">
        <header
          className="px-[var(--phone-gutter)] pt-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            className="text-fg-muted -ml-1 flex h-[var(--tap-min)] items-center gap-1 text-sm font-semibold"
          >
            ← {s.back}
          </button>

          <h1 className="font-display mt-1 text-2xl leading-tight font-semibold tracking-tight">
            {t.heading}
          </h1>
        </header>

        {/* ------------------------------------------------- where it goes */}
        <section className="mt-4 px-[var(--phone-gutter)]">
          <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
            {delivering ? t.addressHeading : t.pickupHeading}
          </h2>

          {delivering ? (
            <>
              <div className="mt-2 flex flex-col gap-2">
                {/*
                 * The guest's own address book when they are signed in, and the
                 * design's samples when they are not.
                 *
                 * Both are drawn, and only one can be ordered to: `place()`
                 * refuses a delivery with no live address rather than sending a
                 * courier to "Chilonzor 9" out of a fixture. Drawing nothing for
                 * a signed-out guest would be a checkout with an empty section
                 * and no explanation.
                 */}
                {(addresses ?? []).map((option) => (
                  <Choice
                    key={option.id}
                    name="address"
                    checked={String(option.id) === addressId}
                    onSelect={() => setAddressId(String(option.id))}
                    title={option.label}
                    note={option.full_line}
                  />
                ))}

                {addresses === null || addresses.length === 0
                  ? SAVED_ADDRESSES.map((option) => (
                      <Choice
                        key={option.id}
                        name="address"
                        checked={option.id === addressId}
                        onSelect={() => setAddressId(option.id)}
                        title={say(option.label, lang)}
                        note={say(option.line, lang)}
                      />
                    ))
                  : null}
              </div>

              {/*
               * Where addresses come from. `GAPS.md §4.2 Y3`: the design has no
               * address book on this screen — no add, no map picker — so this
               * points at the one that exists rather than offering a control
               * that does nothing. Signed out, it says what signing in buys.
               */}
              <Link
                href="/customer/profile"
                className="text-fg-subtle mt-2 block text-left text-xs underline"
              >
                {addresses === null ? t.signInForAddresses : t.addressesInProfile}
              </Link>
            </>
          ) : (
            <>
              <div className="mt-2 flex flex-col gap-2">
                {cart.venues.map((option) => (
                  <Choice
                    key={option.id}
                    name="branch"
                    checked={option.id === cart.branchId}
                    onSelect={() => cart.setBranch(option.id)}
                    title={option.name}
                    note={option.address}
                  />
                ))}
              </div>

              <p className="text-fg-subtle mt-2 text-xs">{t.pickupNote}</p>
            </>
          )}
        </section>

        {/* --------------------------------------------------------- rail */}
        <section className="mt-5 px-[var(--phone-gutter)]">
          <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
            {t.methodHeading}
          </h2>

          <div className="mt-2 flex flex-col gap-2">
            {PAYMENT_RAILS.map((option) => (
              <Choice
                key={option.id}
                name="rail"
                checked={option.id === railId}
                onSelect={() => setRailId(option.id)}
                /* Cash is a word, and a word is translated: the label used to be
                   a plain string carrying `'Naqd · Наличными · Cash'`, printed
                   verbatim on the screen a guest pays from. */
                title={say(option.label, lang)}
                note={say(option.note, lang)}
                tag={option.tag}
              />
            ))}
          </div>

          {rail.isCash ? (
            <p className="text-fg-subtle mt-2 text-xs leading-normal">{t.cashRounding}</p>
          ) : null}
        </section>

        {/* ---------------------------------------------------------- tip */}
        {delivering ? (
          <section className="mt-5 px-[var(--phone-gutter)]">
            <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
              {t.tipHeading}
            </h2>

            <div role="radiogroup" aria-label={t.tipHeading} className="mt-2 flex gap-1.5">
              {TIP_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  role="radio"
                  aria-checked={step === tipPercent}
                  onClick={() => setTipPercent(step)}
                  className={`rounded-pill h-[var(--tap-min)] flex-1 text-sm font-semibold ${
                    step === tipPercent ? 'bg-acc text-white' : 'bg-bg-muted text-fg-muted'
                  }`}
                >
                  {step === 0 ? t.tipNone : `${step}%`}
                </button>
              ))}
            </div>

            <p className="text-fg-subtle mt-2 text-xs leading-normal">{t.tipNote}</p>
          </section>
        ) : null}

        {/* ------------------------------------------------------- totals */}
        <dl className="mt-5 flex flex-col gap-2 px-[var(--phone-gutter)] text-sm">
          <Row label={s.items}>
            <Money tiyin={bill.subtotal} lang={lang} />
          </Row>

          {bill.discount > 0 ? (
            <Row label={s.discount}>
              <span className="text-acc text-sm font-semibold">
                −<Money tiyin={bill.discount} lang={lang} className="text-acc" />
              </span>
            </Row>
          ) : null}

          <Row label={delivering ? s.delivery : s.pickup}>
            {bill.deliveryFee === 0 ? (
              <span className="text-fg-subtle text-sm font-semibold">{s.free}</span>
            ) : (
              <Money tiyin={bill.deliveryFee} lang={lang} />
            )}
          </Row>

          {/*
           * Four rows, always four. The design's `payTotals` has no conditional
           * member and prints "—" for a tip of nothing — a row that appears only
           * once a chip is tapped is a row nobody knew they could have.
           */}
          {delivering ? (
            <Row label={t.tipHeading}>
              {tip > 0 ? (
                <Money tiyin={tip} lang={lang} />
              ) : (
                <span className="text-fg-subtle text-sm font-semibold">—</span>
              )}
            </Row>
          ) : null}

          {rounding !== 0 ? (
            <Row label={t.rounding}>
              <span data-num className="text-sm font-semibold">
                {rounding > 0 ? '+' : '−'}
                <Money tiyin={Math.abs(rounding)} lang={lang} className="inline" />
              </span>
            </Row>
          ) : null}

          <div className="border-divider mt-1 flex items-baseline justify-between border-t pt-3">
            <dt className="text-md font-semibold">{t.toPay}</dt>
            <dd>
              <Money tiyin={charged} lang={lang} className="text-lg" />
            </dd>
          </div>

          <p className="text-fg-subtle mt-0.5 text-xs leading-normal">{t.placeNote}</p>
        </dl>
      </main>

      <div className="cx-bar">
        {blocked === null ? null : (
          /*
           * The reason, and where it can be fixed.
           *
           * "You need a phone number" with nothing to press is a dead end on
           * the last screen of a checkout. The other two reasons have no action
           * behind them — a demo catalogue and an empty address book are not
           * things a guest can solve from here — so only this one is a link.
           */
          <p className="text-fg-subtle mb-2 text-center text-xs leading-normal">
            {me === null && cart.orderable ? (
              <Link href="/customer/sign-in" className="underline">
                {blocked}
              </Link>
            ) : (
              blocked
            )}
          </p>
        )}

        <button
          type="button"
          disabled={placing || blocked !== null}
          onClick={() => void place()}
          className="bg-acc flex h-[var(--tap-lg)] w-full items-center justify-center gap-2 rounded-md px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          <span>{placing ? t.placing : t.place}</span>
          <Money tiyin={charged} lang={lang} className="text-base text-white" />
        </button>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One selectable row — an address, a branch, a payment rail.
 *
 * A real `<input type="radio">` under a label rather than a `<div>` with an
 * `onClick`: a radio group is arrow-navigable, announces "2 of 5", and is the
 * one thing a guest paying by phone with a screen reader has to be able to work.
 */
function Choice({
  name,
  checked,
  onSelect,
  title,
  note,
  tag,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  note: string;
  tag?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 ${
        checked ? 'border-acc bg-acc-soft' : 'border-border bg-surface'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-acc h-4 w-4 flex-none"
      />

      {tag !== undefined ? (
        <span className="bg-bg-muted text-fg-muted grid h-8 w-9 flex-none place-items-center rounded-sm text-xs font-bold">
          {tag}
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="text-fg-subtle block truncate text-xs">{note}</span>
      </span>
    </label>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import {
  billTotals,
  CASH_ROUNDING_TIYIN,
  cashRoundingDelta,
  roundedForCash,
  VAT_PERCENT,
} from '@restaurant/surfaces/money';
import { cartSubtotal, clearCart, setQuantity, useCart } from '@/lib/guest-cart';

import type { GuestLocale } from '@restaurant/surfaces/guest/menu-data';
import { dishImageFrom } from '@restaurant/surfaces/media/image';
/*
 * The provider leg, borrowed rather than rewritten.
 *
 * `(customer)/customer/pay/pay-online.ts` already owns which rail ids mean
 * "leave for somebody else's app", the two calls that open an invoice, and the
 * `sessionStorage` token that survives Payme returning to whatever address the
 * merchant cabinet was configured with. A second copy on this surface would be
 * a second list of providers to forget to update — the same reason
 * `locale-bridge.ts` re-exports the guest catalogue instead of restating it.
 */
import {
  isOnlineRail,
  leaveForProvider,
  openInvoice,
} from '../../../../(customer)/customer/pay/pay-online';
import { fill, som } from '../../../locale-bridge';
import { placeOrder, placedAtOf } from '../../../placed-order';
import { checkSitePromo, lastFour, placeSiteOrder } from '../../../site-client';
import { SitePhoto } from '../../../site-photo';
import {
  CARD_SCHEMES,
  PAYMENT_RAILS,
  say,
  type CartVenue,
  type SiteLocale,
} from '../../../venue-data';

/**
 * The basket and the checkout, on one screen — `dc.html:320-458`.
 *
 * The money is `lib/pricing.ts`, a transcription of the server's
 * `App\Support\Orders\BillTotals` kept honest by a test whose expected values
 * were produced by running the PHP. Nothing here invents a rule: **VAT is
 * inside the price and is only ever displayed**, service is a dine-in charge
 * and is never added to a delivery or a collection, and the cash figure rounds
 * to the nearest thousand so'm because that is what a courier can make change
 * for.
 *
 * Four things the build was missing against the file, and each of them is a
 * question the kitchen otherwise has to telephone the guest to ask:
 *
 *   · **which branch** a collection order is collected from (`dc.html:383-397`),
 *     with the minutes each one needs — the segmented control offered "pickup"
 *     and then asked nothing;
 *   · **when** they want it (`dc.html:398-407`) — five choices, of which
 *     "as soon as possible" is only the first;
 *   · **which rail** (`dc.html:1046-1051`) — four of them. The build had two,
 *     and the card button was labelled `Click · Payme · Uzcard`: three separate
 *     companies behind one control;
 *   · **the flat number** (`dc.html:369-372`), which is the difference between
 *     a courier at the door and a courier in a courtyard.
 *
 * The rounding line still appears only on the cash rail and only when it moves
 * the number. A permanent "rounding: 0" is noise, and a guest paying by card
 * who sees a rounding line will ask about it.
 *
 * ---------------------------------------------------------------------------
 * Every figure on this screen is a quote until the server answers
 *
 * `POST /api/v1/public/orders` re-prices the whole basket inside its own
 * transaction — line by line through `App\Contracts\Menu\MenuCatalog`, the
 * discount through `App\Contracts\Crm\Promotions`, the delivery fee off the
 * branch's own setting — and refuses to read a price from this request at all.
 * So what leaves here is ids, quantities and words; what comes back is the
 * bill, and the bill is what `placed-order.ts` records. The arithmetic above is
 * still worth doing, because a guest has to see a total before they agree to
 * one, but it is a preview of the server's answer rather than the answer.
 */
type Mode = 'delivery' | 'pickup';

/** What a code turned out to be worth, as the server priced it. */
type Applied = {
  code: string;
  /** Tiyin off the food line. The only figure the summary may subtract. */
  discount: number;
  /** The rate, when there is one — `promoOk` prints it and a fixed sum has none. */
  percent: number | null;
};

export function CartScreen({
  restaurant,
  locale,
  copy,
  venues,
  slotInstants,
  channels,
  deliveryFee,
  freeFrom,
}: {
  restaurant: string;
  locale: GuestLocale;
  copy: Record<string, string>;
  /** The venues, live or off the fixtures — see `CartVenue`. Never empty. */
  venues: readonly CartVenue[];
  /**
   * Venue → sitting label → the moment it means, as an ISO instant with the
   * venue's own offset.
   *
   * Resolved on the server for the reason the sittings themselves are: a label
   * turned into a time in the browser would use the READER's clock. Empty for a
   * fixture render, where there is no venue id to order against anyway.
   */
  slotInstants: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Which doors this website offers — `settings.site.channels`.
   *
   * A restaurant that delivers but takes delivery orders by telephone only is a
   * real arrangement, and drawing a button that leads to a refusal is worse
   * than not drawing it. Both when the restaurant has never decided, which is
   * what the API's default answers.
   */
  channels: readonly string[];
  /** Tiyin, before the free-delivery threshold applies. */
  deliveryFee: number;
  freeFrom: number;
}) {
  const cart = useCart(restaurant);
  const router = useRouter();

  /*
   * The doors this site actually offers, in the design's own order.
   *
   * Never empty: `fetchOrderingRules` defaults to both, because a restaurant
   * that has never opened the settings screen has not switched anything off.
   */
  const offered = (['delivery', 'pickup'] as const).filter((entry) =>
    channels.includes(entry === 'pickup' ? 'pickup' : 'delivery'),
  );

  const [mode, setMode] = useState<Mode>(offered[0] ?? 'delivery');
  const [rail, setRail] = useState<string>(PAYMENT_RAILS[0]!.id);
  const [branch, setBranch] = useState(venues[0]?.id ?? '');
  const [when, setWhen] = useState('asap');
  const [address, setAddress] = useState('');
  const [flat, setFlat] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [promo, setPromo] = useState('');
  const [applied, setApplied] = useState<Applied | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /* Set the instant the order is written, so emptying the basket underneath
     this screen does not flash "your basket is empty" on the way to tracking. */
  const [sent, setSent] = useState(false);

  const money = (tiyin: number) => som(tiyin, locale);
  const subtotal = cartSubtotal(cart);

  /* Only the venues that can actually take this order. A branch with
     `delivery.enabled` off will cook for somebody who walks in and has no rider
     to send, so offering it under "delivery" is a guest waiting for a courier
     nobody dispatched; every open venue can be collected from. */
  const pickable = venues.filter((entry) => mode === 'pickup' || entry.delivers);
  const chosenBranch = pickable.find((entry) => entry.id === branch) ?? pickable[0] ?? venues[0]!;

  /*
   * Collection is never charged for, and delivery stops being charged for at
   * the threshold the hero, the FAQ and the delivery card all quote.
   *
   * The venue's own fee where one was published — a city-centre café charges
   * nothing within two streets and a suburb charges for the petrol, and it is
   * `branches.settings['delivery.fee_tiyin']` that the server bills from. The
   * design's flat figure is the fallback, and the *threshold* stays the
   * design's either way: `GET /api/v1/public/branches` publishes no
   * `free_delivery_over_tiyin`, so this screen cannot know a venue's own.
   */
  const fullFee = chosenBranch.deliveryFee ?? deliveryFee;
  const fee = mode === 'pickup' || subtotal >= freeFrom ? 0 : fullFee;

  const totals = billTotals({
    subtotal,
    /*
     * Off-premise, both of them. Service is a dine-in charge — the design says
     * so and `chargesService()` enforces it — so a delivery order that added
     * ten per cent would be overcharging by exactly the service rate.
     */
    channel: mode === 'pickup' ? 'takeaway' : 'delivery',
    discount: applied?.discount ?? 0,
    deliveryFee: fee,
  });

  const cash = PAYMENT_RAILS.find((entry) => entry.id === rail)?.isCash === true;
  const payableNow = cash ? roundedForCash(totals.total) : totals.total;
  const rounding = cash ? cashRoundingDelta(totals.total) : 0;

  /*
   * Which venue is cooking it, and why the chooser is drawn for delivery too.
   *
   * The design puts it under "pickup" alone, on the assumption that the
   * restaurant routes a delivery itself. `PublicOrderController::branchOrFail()`
   * deliberately does not: with two or more active venues and no `branch_id` it
   * refuses, because "the first one" is a guess rather than a choice and an
   * order that silently landed in Termiz is forty minutes of somebody's evening.
   *
   * So the control appears exactly when there is a choice to make. A
   * single-venue restaurant — which is most of them — sees the design unchanged
   * and sends no id at all; a chain is asked, once, in the section that already
   * asks how they want it.
   */
  const mustChooseBranch = venues.length > 1;

  if (sent) {
    return (
      <main className="site-wrap py-20 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{copy.placed}</h1>
        <a
          href={`/r/${encodeURIComponent(restaurant)}/track`}
          className="bg-acc mt-6 inline-flex h-12 items-center rounded-md px-6 text-sm font-semibold text-white"
        >
          {copy.track}
        </a>
      </main>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <main className="site-wrap py-20 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{copy.empty}</h1>
        <p className="text-fg-muted mt-2 text-sm leading-normal">{copy.emptySub}</p>
        <a
          href={`/r/${encodeURIComponent(restaurant)}/menu`}
          className="bg-acc mt-6 inline-flex h-12 items-center rounded-md px-6 text-sm font-semibold text-white"
        >
          {copy.addMore}
        </a>
      </main>
    );
  }

  return (
    <main className="site-wrap py-8 pb-20">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{copy.title}</h1>
      <p className="text-fg-muted mt-2 text-[15px]">
        {fill(copy.sub, {
          count: cart.lines.length,
          mode: mode === 'pickup' ? copy.pickup : copy.delivery,
        })}
      </p>

      <div className="mt-6 grid items-start gap-7 lg:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="grid gap-4">
          {/* ------------------------------------------------------- lines */}
          <section className="border-border bg-surface rounded-lg border px-5 py-2">
            <ul>
              {cart.lines.map((line) => (
                <li key={line.key} className="border-divider flex items-center gap-4 border-b py-4">
                  {/* 64px — `dc.html:341-343`. Carried into the basket with the
                      line so the checkout never re-fetches the menu to draw it.
                      One address, the 160px `thumb` — `lineImageFrom` — wrapped
                      back into a one-size photograph for the shared `<img>`. */}
                  {(line.image ?? null) === null ? null : (
                    <span className="bg-bg-muted border-border size-16 flex-none overflow-hidden rounded-md border">
                      <SitePhoto
                        image={dishImageFrom(null, line.image)}
                        alt={line.name}
                        sizes="64px"
                        className="!rounded-md"
                      />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-bold tracking-tight">{line.name}</p>
                    {line.options.length > 0 ? (
                      <p className="text-fg-subtle mt-0.5 text-[13px]">
                        {line.options.join(' · ')}
                      </p>
                    ) : null}
                    {line.note !== '' ? (
                      <p className="text-fg-subtle mt-0.5 text-[13px] italic">{line.note}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-none items-center gap-2.5">
                    <Step
                      label="−"
                      onClick={() => setQuantity(restaurant, line.key, line.quantity - 1)}
                    />
                    <span data-num className="font-display w-6 text-center text-[15px] font-bold">
                      {line.quantity}
                    </span>
                    <Step
                      label="+"
                      onClick={() => setQuantity(restaurant, line.key, line.quantity + 1)}
                    />
                  </div>

                  <span
                    data-num
                    className="font-display w-26 flex-none text-right text-base font-bold"
                  >
                    {money(line.unitPrice * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <a
              href={`/r/${encodeURIComponent(restaurant)}/menu`}
              className="text-acc flex h-12 items-center text-sm font-semibold"
            >
              + {copy.addMore}
            </a>
          </section>

          {/* --------------------------------------------------------- how */}
          <section className="border-border bg-surface rounded-lg border px-6 py-5.5">
            <h2 className="font-display text-lg font-bold tracking-tight">{copy.how}</h2>

            {/* One door rather than two when the restaurant offers one. The
                toggle is still drawn, because a single chip that says
                "Olib ketish" answers the question the heading asks. */}
            <div className="bg-bg-muted mt-3.5 flex w-fit gap-0.5 rounded-md p-0.5">
              {offered.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={mode === entry}
                  onClick={() => setMode(entry)}
                  className={`h-9.5 rounded-[8px] px-5 text-sm font-semibold ${
                    mode === entry ? 'bg-surface text-fg shadow-xs' : 'text-fg-subtle'
                  }`}
                >
                  {entry === 'delivery' ? copy.delivery : copy.pickup}
                </button>
              ))}
            </div>

            {/*
             * Which kitchen — drawn for both modes, and only for a chain.
             *
             * `dc.html:383-397` puts it under collection alone. The server needs
             * it either way once a restaurant has two venues: see
             * `mustChooseBranch` above. The ready time is per branch because it
             * is — Sergeli needs thirty minutes and Chilonzor twenty — and it is
             * only worth printing beside a collection, where the guest is the
             * one doing the arriving.
             */}
            {mustChooseBranch ? (
              <div className="mt-4.5 grid gap-2.5">
                {pickable.map((entry) => (
                  <Option
                    key={entry.id}
                    on={entry.id === chosenBranch.id}
                    onClick={() => setBranch(entry.id)}
                    title={entry.name}
                    sub={say(entry.address, locale as SiteLocale)}
                    aside={
                      mode === 'pickup' && entry.pickupMinutes !== null
                        ? fill(copy.readyIn, { minutes: entry.pickupMinutes })
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : null}

            {mode === 'delivery' ? (
              <>
                <div className="mt-4.5 grid gap-3 sm:[grid-template-columns:minmax(0,1fr)_150px]">
                  <Field label={copy.address}>
                    <input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      autoComplete="street-address"
                      className="border-border-strong bg-surface h-11 w-full rounded-md border px-3.5 text-sm"
                    />
                  </Field>

                  {/* The flat number, which the design gives its own 150px
                      column. A courier who has the street and not the flat is a
                      courier in a courtyard telephoning the restaurant. */}
                  <Field label={copy.flat}>
                    <input
                      value={flat}
                      onChange={(event) => setFlat(event.target.value)}
                      data-num
                      className="border-border-strong bg-surface h-11 w-full rounded-md border px-3.5 text-sm"
                    />
                  </Field>
                </div>

                {/*
                 * How far off free delivery they are — `dc.html:374-377`.
                 *
                 * Green once it is free, accent while it is not, and the second
                 * form says the remaining sum rather than only the threshold:
                 * "add 22 000 more" is an offer, "free above 150 000" is a rule.
                 */}
                <p
                  data-num
                  className={`mt-3.5 flex items-start gap-2.5 rounded-md px-4 py-3 text-[13px] leading-normal font-medium ${
                    fee === 0 ? 'bg-success-50 text-success-700' : 'bg-acc-soft text-acc-dark'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 size-1.5 flex-none rounded-full ${
                      fee === 0 ? 'bg-success-500' : 'bg-acc'
                    }`}
                  />
                  {fee === 0
                    ? fill(copy.feeFree, { amount: money(freeFrom) })
                    : fill(copy.feePaid, {
                        fee: money(fee),
                        left: money(freeFrom - subtotal),
                      })}
                </p>
              </>
            ) : (
              /* A collection order with one venue still says how long it takes
                 to be ready — that is the whole content of this half of the
                 design's card, and a chain has already read it on its own row. */
              <p data-num className="text-fg-muted mt-4.5 text-sm">
                {chosenBranch.name}
                {chosenBranch.pickupMinutes === null
                  ? ''
                  : ` · ${fill(copy.readyIn, { minutes: chosenBranch.pickupMinutes })}`}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/*
               * When — `dc.html:398-407`. Five choices, of which "as soon as
               * possible" is only the first: a guest ordering at eleven for a
               * one o'clock lunch had no way to say so, and the kitchen had no
               * way to hear it.
               *
               * The sittings are this venue's own opening hours, resolved on the
               * server against its own clock — see `fetchCheckoutVenues`. A
               * kitchen that shuts at ten no longer offers half past eight to a
               * guest reading the page at nine, and one that has closed for the
               * day offers "as soon as possible" alone rather than four sittings
               * nobody will cook.
               */}
              <Field label={copy.when}>
                <select
                  value={when}
                  onChange={(event) => setWhen(event.target.value)}
                  className="border-border-strong bg-surface h-11 w-full rounded-md border px-3 text-sm"
                >
                  {/* The window is quoted only when the venue published one.
                      `35–50` used to be written onto every live branch, which is
                      a promise about how long a stranger waits for their food. */}
                  <option value="asap">
                    {chosenBranch.deliveryEta === null
                      ? copy.asapPlain
                      : fill(copy.asap, { range: chosenBranch.deliveryEta })}
                  </option>
                  {chosenBranch.slots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </Field>

              {/*
               * The name, which the design does not ask for and the kitchen
               * cannot do without.
               *
               * `dc.html:1181-1184` collects an address, a flat, a time and a
               * telephone — the four things a courier needs to arrive. But
               * `PublicOrderRequest` requires `customer.name` as well, and it is
               * right to: a docket that says only "+998 90 …" is a rider at a
               * door with nobody to ask for, and every other channel on this
               * platform has a name against the bill. So one more field, in the
               * grid the design already draws, labelled from the catalogue's own
               * `site.book.name` rather than a fifth spelling of the word.
               */}
              <Field label={copy.name}>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  className="border-border-strong bg-surface h-11 w-full rounded-md border px-3.5 text-sm"
                />
              </Field>

              <Field label={copy.phone}>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  data-num
                  className="border-border-strong bg-surface h-11 w-full rounded-md border px-3.5 text-sm"
                />
              </Field>
            </div>
          </section>

          {/* ----------------------------------------------------- payment */}
          <section className="border-border bg-surface rounded-lg border px-6 py-5.5">
            <h2 className="font-display text-lg font-bold tracking-tight">{copy.payment}</h2>

            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
              {PAYMENT_RAILS.map((entry) => (
                <Option
                  key={entry.id}
                  on={entry.id === rail}
                  onClick={() => setRail(entry.id)}
                  title={entry.brand ?? (entry.isCash ? copy.cash : copy.card)}
                  sub={
                    entry.id === 'card'
                      ? CARD_SCHEMES
                      : entry.id === 'click'
                        ? copy.clickSub
                        : entry.id === 'payme'
                          ? copy.paymeSub
                          : fill(copy.cashSub, { step: CASH_ROUNDING_TIYIN / 100 })
                  }
                  compact
                />
              ))}
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------- summary */}
        <aside className="border-border bg-surface rounded-lg border p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold tracking-tight">{copy.summary}</h2>

          <div className="mt-4 flex gap-2.5">
            <input
              value={promo}
              onChange={(event) => {
                setPromo(event.target.value.toUpperCase());
                setPromoError(null);
              }}
              placeholder={copy.promo}
              className="border-border-strong bg-surface h-10.5 min-w-0 flex-1 rounded-md border px-3.5 font-mono text-sm uppercase"
            />
            <button
              type="button"
              onClick={() => {
                /*
                 * The server prices it, and it prices it twice.
                 *
                 * `POST /api/v1/public/promo-codes/check` is a check rather than
                 * a redemption: nothing is spent and nothing is written, because
                 * a cart asks on every attempt and an endpoint that consumed a
                 * campaign's budget per keystroke would empty it before anybody
                 * ordered. The figure it answers with is what the summary shows;
                 * the code as a *string* is what reaches `POST /public/orders`,
                 * which re-prices it against the basket the server itself built.
                 *
                 * That double check is the whole design. A discount a client can
                 * name is a hundred per cent discount, and the first person to
                 * open the network tab finds out.
                 *
                 * The handler is the customer app's own — it forwards the guest
                 * cookie when there is one, which is what lets a personal
                 * loyalty coupon be recognised as well as a campaign code. A
                 * stranger with no account still gets the campaign half.
                 */
                const typed = promo.trim().toUpperCase();

                if (typed === '') return;

                void checkSitePromo(typed, subtotal, locale).then((answer) => {
                  if (answer.ok) {
                    const priced: Applied = {
                      code: answer.data.code,
                      discount: answer.data.discount_tiyin,
                      percent: answer.data.kind === 'percent' ? answer.data.value : null,
                    };

                    setApplied(priced);
                    setPromoError(null);
                    flash(promoLine(priced, copy, money));

                    return;
                  }

                  /* The API's own sentence where it sent one — "the basket is
                     under this campaign's floor" and "that code has expired" are
                     different things to do next, and the catalogue already tells
                     them apart in three languages. */
                  const said = answer.message ?? fill(copy.promoBad, { code: typed });

                  setApplied(null);
                  setPromoError(said);
                  flash.problem(said);
                });
              }}
              className="border-border-strong bg-surface h-10.5 flex-none rounded-md border px-4 text-[13px] font-semibold"
            >
              {copy.promoApply}
            </button>
          </div>

          {applied !== null ? (
            <p className="text-success-700 mt-2 text-xs font-semibold">
              {promoLine(applied, copy, money)}
            </p>
          ) : null}
          {promoError !== null ? (
            <p className="text-danger-600 mt-2 text-xs font-semibold">{promoError}</p>
          ) : null}

          <dl className="border-divider mt-5 grid gap-2.5 border-t pt-4 text-sm">
            <Row label={copy.items} value={money(totals.subtotal)} />

            {totals.discount > 0 ? (
              <Row
                label={fill(copy.discount, { code: applied?.code ?? '' })}
                value={`−${money(totals.discount)}`}
                tone="good"
              />
            ) : null}

            <Row
              label={mode === 'pickup' ? copy.pickup : copy.delivery}
              value={fee === 0 ? copy.free : money(fee)}
              tone={fee === 0 ? 'good' : 'plain'}
            />

            {/* Only on the cash rail, and only when it moves the number. */}
            {rounding !== 0 ? (
              <Row
                label={copy.rounding}
                value={`${rounding > 0 ? '+' : '−'}${money(Math.abs(rounding))}`}
              />
            ) : null}

            <div className="flex items-baseline justify-between gap-3 pt-1">
              <dt className="font-display text-[22px] font-bold tracking-tight">{copy.total}</dt>
              <dd data-num className="font-display flex-none text-[22px] font-bold">
                {money(payableNow)}
              </dd>
            </div>
          </dl>

          {/* Inside the total, never added to it — and the cash sentence is
              appended rather than given its own line, exactly as the design
              writes it. */}
          <p data-num className="text-fg-subtle mt-3 text-xs leading-relaxed">
            {fill(copy.vatNote, { percent: VAT_PERCENT, amount: money(totals.vatIncluded) })}
            {cash ? ` · ${fill(copy.cashNote, { amount: money(payableNow) })}` : ''}
          </p>

          <button
            type="button"
            disabled={placing}
            onClick={() => {
              if (placing) return;

              setPlacing(true);
              setRefused(null);

              /*
               * The basket goes to the kitchen, and the bill comes back.
               *
               * Everything money-shaped is absent from what leaves here.
               * `PublicOrderRequest` declares no price, no discount and no fee —
               * "a client that can name its own price is a client that can name
               * zero" — so the body is dish ids, option ids, quantities and the
               * four things only the guest knows. The answer carries the number,
               * the clock and the totals the server computed, and those are what
               * `placeOrder` records for the tracking screen.
               *
               * `placeOrderPayloadFrom` refuses to build a body it knows will be
               * rejected — a dish id that is not a number, which is what a
               * basket filled against the fixture menu carries, or a delivery
               * with no address. That refusal arrives *before* the guest's tap
               * turns into a 422, which is the difference between a sentence
               * this screen can print and one the API has to explain.
               */
              const destination =
                mode === 'pickup'
                  ? `${chosenBranch.name} · ${say(chosenBranch.address, locale as SiteLocale)}`
                  : [address, flat].filter((part) => part.trim() !== '').join(', ');

              void placeSiteOrder(
                {
                  channel: mode === 'pickup' ? 'takeaway' : 'delivery',
                  /* Only a real venue can be named. `apiId` is null on the
                     fixture list, and the payload builder drops anything that is
                     not a positive integer — at which point the server picks for
                     a single-venue restaurant and refuses for a chain, which is
                     the honest failure rather than a guess. */
                  branchId: chosenBranch.apiId === null ? '' : String(chosenBranch.apiId),
                  lines: cart.lines.map((line) => ({
                    dishId: line.dishId,
                    modifierIds: line.modifierIds ?? [],
                    quantity: line.quantity,
                    note: line.note,
                  })),
                  name,
                  phone,
                  address: mode === 'delivery' ? address : null,
                  addressNote: mode === 'delivery' ? flat : null,
                  promoCode: applied?.code ?? null,
                  railId: rail,
                  source: 'web',
                  /*
                   * The sitting, as a time rather than as a sentence.
                   *
                   * `orders.scheduled_for` is a real column now and
                   * `PublicOrderRequest` declares it, so the answer a guest gave
                   * is stored where a kitchen list can sort by it. The note is
                   * kept beside it and is deliberately not dropped: it is what
                   * the person who rings the guest back reads, in the words the
                   * guest was shown.
                   *
                   * `asap` says nothing worth writing down and sends neither.
                   * A sitting the server could not date — a fixture render, a
                   * venue whose clock did not resolve — sends the note alone,
                   * which is exactly what this did before the column existed.
                   */
                  scheduledFor:
                    when === 'asap' ? null : (slotInstants[chosenBranch.id]?.[when] ?? null),
                  note: when === 'asap' ? null : `${copy.when}: ${when}`,
                },
                locale,
              ).then((answer) => {
                if (!answer.ok) {
                  setPlacing(false);

                  /* The API's own code and its own sentence: "manti hozir
                     mavjud emas", "this basket is under the venue's minimum",
                     "three orders are already open on this number". Flattening
                     them to "order failed" leaves somebody pressing the same
                     button. `not_orderable` is ours and means the basket was
                     built against a sample menu. */
                  const said = answer.message ?? copy.offline;

                  setRefused(said);
                  flash.problem(said);

                  return;
                }

                const bill = answer.data;

                placeOrder(restaurant, {
                  number: bill.number,
                  placedAt: placedAtOf(bill.placed_at),
                  /* Half of the tracking credential. Four digits and never the
                     whole number — this is `localStorage` on a device that gets
                     lent and lost. */
                  phoneLastFour: lastFour(phone),
                  mode,
                  rail,
                  when,
                  destination,
                  lines: cart.lines.map((line) => ({
                    name: line.name,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                  })),
                  /* The server's figures, not this screen's. The summary above
                     is a quote; the bill is what was agreed, and a receipt that
                     disagreed with it would be the drift `pricing.ts` warns
                     about arriving at the worst possible moment. */
                  total: bill.total,
                  vatIncluded: bill.vat_included,
                });

                setSent(true);
                clearCart(restaurant);
                flash(copy.placed);

                /*
                 * Click and Payme are a redirect, not a rail this page settles.
                 *
                 * An order on one of them is written `payment_state: pending`
                 * and — this is the part that matters — **is not fired to the
                 * kitchen**: `PublicOrderController` only calls `send()` when
                 * the money is not owed to a provider, so a guest who picked
                 * Payme and was sent to the tracking screen would watch a bill
                 * nobody was cooking. So the invoice is opened against the bill
                 * that just came back, and the browser leaves for the bank.
                 *
                 * The same two calls the customer app makes, from the same
                 * module: the amount is read off the bill server-side and would
                 * be ignored if sent, and `return_url` brings the guest back to
                 * their own order rather than to a provider's receipt page.
                 *
                 * A refusal here is not an order that failed — the bill exists —
                 * so it says what the API said and still shows the order, where
                 * a guest can ring the restaurant with a number in their hand.
                 */
                if (!isOnlineRail(rail)) {
                  router.push(`/r/${encodeURIComponent(restaurant)}/track`);

                  return;
                }

                void openInvoice({
                  orderId: bill.id,
                  orderNumber: bill.number,
                  railId: rail,
                  returnUrl: `${window.location.origin}/r/${encodeURIComponent(restaurant)}/track`,
                }).then(({ invoice, reason }) => {
                  if (invoice === null) {
                    if (reason !== null) flash.problem(reason);
                    router.push(`/r/${encodeURIComponent(restaurant)}/track`);

                    return;
                  }

                  leaveForProvider(invoice);
                });
              });
            }}
            className="bg-acc mt-4.5 grid h-13 w-full place-items-center rounded-md text-[15px] font-semibold text-white disabled:opacity-55"
          >
            {copy.place} · {money(payableNow)}
          </button>

          <p className="text-fg-subtle mt-2.5 text-xs leading-relaxed">{copy.placeNote}</p>

          {refused === null ? null : (
            <p role="alert" className="text-danger-600 mt-2.5 text-sm leading-normal">
              {refused}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

/**
 * What a code turned out to be worth, in one line.
 *
 * `site.cart.promoOk` prints a *rate* — "{code} · {percent}% chegirma
 * qo'llanildi" — and a rate is only half of what the server can answer with. A
 * fixed coupon (`kind: 'fixed'`) and a reserved loyalty code have no percentage
 * at all, and deriving one from the discount over the subtotal would be
 * inventing a rate the campaign never had; a basket that then changed would
 * make it change too.
 *
 * So a percentage code gets the design's own sentence and everything else gets
 * the summary's own discount label with the sum beside it — both from the
 * catalogue, neither assembled out of new words.
 */
function promoLine(
  applied: Applied,
  copy: Record<string, string>,
  money: (tiyin: number) => string,
): string {
  return applied.percent === null
    ? `${fill(copy.discount, { code: applied.code })} · −${money(applied.discount)}`
    : fill(copy.promoOk, { code: applied.code, percent: applied.percent });
}

function Row({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'good';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={tone === 'good' ? 'text-success-700 font-semibold' : 'text-fg-muted'}>
        {label}
      </dt>
      <dd
        data-num
        className={`flex-none font-medium ${tone === 'good' ? 'text-success-700 font-semibold' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** A radio row with the design's filled dot rather than a native control. */
function Option({
  on,
  onClick,
  title,
  sub,
  aside,
  compact = false,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  aside?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md border px-4 py-3.5 text-left ${
        on ? 'border-acc bg-acc-soft' : 'border-border bg-surface'
      }`}
    >
      <span
        aria-hidden
        className={`grid size-[19px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] font-bold text-white ${
          on ? 'border-acc bg-acc' : 'border-border-strong'
        }`}
      >
        {on ? '✓' : ''}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={
            compact
              ? 'block text-sm font-semibold'
              : 'font-display block text-[15px] font-bold tracking-tight'
          }
        >
          {title}
        </span>
        <span className="text-fg-subtle mt-0.5 block text-[13px]">{sub}</span>
      </span>

      {aside === undefined ? null : (
        <span data-num className="text-fg-muted flex-none text-[13px] font-semibold">
          {aside}
        </span>
      )}
    </button>
  );
}

function Step({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border-strong bg-surface grid size-8.5 place-items-center rounded-md border text-base font-semibold"
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
    </label>
  );
}

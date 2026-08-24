'use client';

import Link from 'next/link';
import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { billTotals, percentOf } from '@restaurant/surfaces/money';
import { cartSubtotal, clearCart, setQuantity, useCart } from '@/lib/guest-cart';

import { som } from '../../../(guest)/guest-session';
import { MpChrome } from '../../mp-chrome';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import {
  ADDRESSES,
  MARKETPLACE_SERVICE_PERCENT,
  PAY_RAILS,
  say,
  storeById,
  type Lang,
  type PayRail,
  MP_PROMO,
} from '@restaurant/surfaces/mp/data';

/**
 * Screen 3 of 4 — address, payment, promo, and the summary.
 *
 * Three steps down the page rather than three routes, because a guest who
 * changes their mind about the address after choosing a card should not lose
 * the card. On a desktop the summary sticks to the right and every step is
 * visible at once, which is the design's layout and the reason it is not a
 * wizard.
 *
 * **Two service charges, and only one of them applies.** The restaurant's ten
 * per cent is dine-in and `chargesService()` refuses it on a delivery; the
 * three per cent on this screen is the marketplace's own. They are different
 * money to different people and the note under the line says so — a guest who
 * knows the restaurant does not charge service on delivery and sees a "service
 * charge" here concludes they are being charged twice.
 */
/**
 * The one promo code this fixture knows, and what it takes off.
 *
 * `Sayt.dc.html:1288-1296` — a single valid code and three distinct failures
 * around it: empty, unknown, already used. Three messages rather than one is
 * the design's point: "invalid code" for a code the guest already applied sends
 * them looking for a second code that does not exist.
 */
/*
 * From `@restaurant/surfaces`, not declared here: the phone's cart reads the
 * same pair, and a code that worked in one app and not the other would be the
 * first support ticket the marketplace ever got.
 */
const PROMO_CODE = MP_PROMO.code;
const PROMO_DISCOUNT = MP_PROMO.discount;

/**
 * The basket's own id, and what makes a double tap one dinner.
 *
 * A marketplace customer has no tenant, so `Idempotency-Key` cannot be claimed
 * for them — the API's `marketplace.orders` migration explains why. The
 * guarantee is a unique index on `(consumer_id, client_reference)` instead,
 * which means the reference has to belong to the BASKET rather than to the
 * request: a fresh one per attempt is exactly the case the index exists to
 * catch.
 *
 * So it is minted once, stored beside the basket, and survives a reload — a
 * guest whose connection dropped mid-checkout presses the button again and gets
 * their first order back rather than a second dinner. It is read lazily, inside
 * the click, because generating one during render is not pure and React says so.
 *
 * `sessionStorage` rather than `localStorage`: a reference that outlived the tab
 * would attach next week's basket to last week's order.
 */
function basketReference(basket: string): string {
  const key = `srcp.mp.ref.${basket}`;

  try {
    const held = sessionStorage.getItem(key);

    if (held !== null && held !== '') return held;

    const minted = `web-${crypto.randomUUID()}`;

    sessionStorage.setItem(key, minted);

    return minted;
  } catch {
    // A browser with storage blocked still gets to eat; it simply forfeits the
    // replay guarantee, which is what an older client without the field does.
    return `web-${crypto.randomUUID()}`;
  }
}

export function MpCartBoard({ lang, basket }: { lang: Lang; basket: string }) {
  const money = (tiyin: number) => som(tiyin, lang);

  const cart = useCart(basket);
  const [address, setAddress] = useState(ADDRESSES[0]!.key);
  const [rail, setRail] = useState<PayRail>('click');
  const [placed, setPlaced] = useState(false);
  const [promoDraft, setPromoDraft] = useState('');
  const [promoOn, setPromoOn] = useState(false);
  const [sending, setSending] = useState(false);

  /* `mp:osh-xona` → `osh-xona`. The basket knows which merchant it belongs to. */
  const store = storeById(basket.replace(/^mp:/, ''));
  const subtotal = cartSubtotal(cart);
  const fee = store?.deliveryFee ?? 0;

  const totals = billTotals({
    subtotal,
    /* Delivery: the restaurant's own service charge never applies. */
    channel: 'delivery',
    deliveryFee: fee,
  });

  /* The platform's cut, on the food only — never on the courier's fee. */
  const platformService = percentOf(subtotal, MARKETPLACE_SERVICE_PERCENT);
  const discount = promoOn ? PROMO_DISCOUNT : 0;
  const payable = totals.total + platformService - discount;

  if (placed) {
    return (
      <>
        <MpChrome lang={lang} basket={basket} />
        <main className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('placed', lang)}
          </h1>
          <Link
            href="/mp/track"
            data-tap="pay"
            className="bg-brand-500 mt-6 flex items-center rounded-md px-6 text-sm font-semibold text-white"
          >
            {t('track', lang)}
          </Link>
        </main>
      </>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <>
        <MpChrome lang={lang} basket={basket} />
        <main className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('empty', lang)}</h1>
          <p className="text-fg-muted mt-2 text-sm leading-normal">{t('emptySub', lang)}</p>
          <Link
            href="/mp"
            data-tap="pay"
            className="bg-brand-500 mt-6 flex items-center rounded-md px-6 text-sm font-semibold text-white"
          >
            {t('backHome', lang)}
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <MpChrome lang={lang} basket={basket} />

      <main className="mx-auto max-w-[1120px] px-4 pt-5 pb-28 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-5">
            {/* -------------------------------------------------- address */}
            <section className="bg-surface rounded-lg border p-5">
              <h2 className="text-md font-semibold">{t('stepAddress', lang)}</h2>

              <div className="mt-3 flex flex-col gap-2">
                {ADDRESSES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    data-tap
                    onClick={() => setAddress(option.key)}
                    aria-pressed={address === option.key}
                    className={`flex items-center gap-3 rounded-md border px-4 text-left ${
                      address === option.key ? 'border-brand-500 bg-brand-50' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{say(option.label, lang)}</span>
                      <span className="text-fg-subtle block text-xs">
                        {say(option.detail, lang)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <label className="mt-3 block">
                <span className="text-fg-subtle mb-1.5 block text-xs">
                  {t('courierNote', lang)}
                </span>
                <input
                  placeholder={t('courierNotePh', lang)}
                  className="bg-bg-subtle border-border h-12 w-full rounded-md border px-3.5 text-sm"
                />
              </label>
            </section>

            {/* -------------------------------------------------- payment */}
            <section className="bg-surface rounded-lg border p-5">
              <h2 className="text-md font-semibold">{t('stepPayment', lang)}</h2>

              <div className="mt-3 flex flex-col gap-2">
                {PAY_RAILS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-tap
                    onClick={() => setRail(key)}
                    aria-pressed={rail === key}
                    className={`flex items-center rounded-md border px-4 text-left text-sm font-semibold ${
                      rail === key ? 'border-brand-500 bg-brand-50' : ''
                    }`}
                  >
                    {t(`pay_${key}` as 'pay_click', lang)}
                  </button>
                ))}
              </div>
            </section>

            {/* ---------------------------------------------------- promo */}
            <section className="bg-surface rounded-lg border p-5">
              <h2 className="text-md font-semibold">{t('stepPromo', lang)}</h2>

              <div className="mt-3 flex gap-2">
                <input
                  value={promoDraft}
                  onChange={(event) =>
                    /* The design normalises as you type: upper case, letters and
                       digits only, twelve characters. A code typed in lower case
                       that then fails validation reads as the platform's fault. */
                    setPromoDraft(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 12),
                    )
                  }
                  aria-label={t('stepPromo', lang)}
                  className="bg-bg-subtle border-border h-12 flex-1 rounded-md border px-3.5 font-mono text-sm tracking-[.06em]"
                  placeholder={t('promoPh', lang)}
                />
                <button
                  type="button"
                  data-tap
                  onClick={() => {
                    if (promoDraft.trim() === '') {
                      flash.problem(t('promoEmpty', lang));
                      return;
                    }

                    if (promoDraft !== PROMO_CODE) {
                      flash.problem(t('promoUnknown', lang));
                      return;
                    }

                    if (promoOn) {
                      flash.problem(t('promoAlready', lang));
                      return;
                    }

                    /*
                     * A preview, and it says so. The code is checked against
                     * `marketplace.promotions` at checkout — its budget, its
                     * dates and which shop it belongs to — and the total that
                     * comes back is the server's. Applying it here shows the
                     * guest what to expect without a round trip; a client that
                     * could grant its own discount would be a client that could
                     * grant any discount.
                     */
                    setPromoOn(true);
                    flash(t('promoOk', lang));
                  }}
                  className={`rounded-md border px-4 text-sm font-semibold ${
                    promoOn
                      ? 'border-success-500 bg-success-50 text-success-700'
                      : 'border-border-strong'
                  }`}
                >
                  {t(promoOn ? 'promoApplied' : 'promoApply', lang)}
                </button>
              </div>

              <p className="text-fg-subtle mt-2.5 text-xs leading-normal">{t('promoNote', lang)}</p>
            </section>
          </div>

          {/* -------------------------------------------------- summary */}
          <aside>
            <div className="bg-surface sticky top-20 rounded-lg border p-5">
              <h2 className="text-md font-semibold">{t('summary', lang)}</h2>

              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {cart.lines.map((line) => (
                  <li key={line.key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{line.name}</span>

                    <span className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQuantity(basket, line.key, line.quantity - 1)}
                        aria-label="−"
                        className="border-border-strong grid size-8 place-items-center rounded-md border text-xs font-semibold"
                      >
                        −
                      </button>
                      <span data-num className="w-6 text-center text-xs font-bold">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(basket, line.key, line.quantity + 1)}
                        aria-label="+"
                        className="border-border-strong grid size-8 place-items-center rounded-md border text-xs font-semibold"
                      >
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="border-divider mt-4 border-t pt-3 text-sm">
                <Row label={t('items', lang)} value={money(totals.subtotal)} />
                <Row
                  label={t('delivery', lang)}
                  value={fee === 0 ? t('freeDelivery', lang) : money(fee)}
                />
                <Row
                  label={fill(t('service', lang), { percent: MARKETPLACE_SERVICE_PERCENT })}
                  value={money(platformService)}
                />

                <div className="border-divider mt-2 flex items-baseline justify-between border-t pt-3">
                  <dt className="font-semibold">{t('total', lang)}</dt>
                  <dd data-num className="font-display text-xl font-bold">
                    {money(payable)}
                  </dd>
                </div>
              </dl>

              {promoOn ? (
                <div className="text-success-700 flex items-baseline justify-between gap-3 py-1 text-sm font-semibold">
                  <span>{PROMO_CODE}</span>
                  <span data-num>− {money(PROMO_DISCOUNT)}</span>
                </div>
              ) : null}

              {/* Which service charge this is, and which one it is not. */}
              <p className="text-fg-subtle mt-2 text-xs leading-normal">{t('serviceNote', lang)}</p>

              {/*
                Placed for real. `POST /api/mp/orders` is a Node handler rather
                than a call to Laravel: the customer's token is in an httpOnly
                cookie this page cannot read, which is the point of putting it
                there. Nothing about money is sent — the total beside this
                button is a preview, and the server prices the basket from the
                catalogue it can see.
              */}
              <button
                type="button"
                data-tap="pay"
                disabled={sending}
                onClick={() => {
                  if (sending) return;

                  setSending(true);

                  void (async () => {
                    try {
                      const response = await fetch('/api/mp/orders', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          store: basket.replace(/^mp:/, ''),
                          lines: cart.lines.map((line) => ({
                            menu_item_id: Number(line.dishId),
                            quantity: line.quantity,
                            ...(line.note === '' ? {} : { note: line.note }),
                          })),
                          address: say(
                            ADDRESSES.find((option) => option.key === address)?.detail ??
                              ADDRESSES[0]!.detail,
                            lang,
                          ),
                          pay_rail: rail,
                          ...(promoOn ? { promo_code: PROMO_CODE } : {}),
                          client_reference: basketReference(basket),
                        }),
                      });

                      if (!response.ok) {
                        /*
                         * The API's own sentence, in the reader's language. Not
                         * re-worded here: the envelope carries all three, and a
                         * fourth translation of "that dish is sold out" is a
                         * fourth thing to keep in step.
                         */
                        const body = (await response.json().catch(() => null)) as {
                          error?: { message_uz?: string; message_ru?: string; message_en?: string };
                        } | null;

                        flash.problem(
                          (lang === 'ru'
                            ? body?.error?.message_ru
                            : lang === 'en'
                              ? body?.error?.message_en
                              : body?.error?.message_uz) ?? t('placeFailed', lang),
                        );

                        return;
                      }

                      // Cleared only once the server has the order. Clearing
                      // first would lose the basket on a refusal, and the guest
                      // would have to build it again to find out why.
                      clearCart(basket);
                      setPlaced(true);
                      flash(t('placedFlash', lang));
                    } catch {
                      flash.problem(t('placeFailed', lang));
                    } finally {
                      setSending(false);
                    }
                  })();
                }}
                className="bg-brand-500 hover:bg-brand-600 mt-4 w-full rounded-md text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('place', lang)} · {money(payable)}
              </button>

              {/* The shop this basket belongs to, not the mock's. `placeNote`
                  used to name "Osh Xona" verbatim, which on anybody else's
                  order is the demo restaurant's name on their receipt. */}
              <p className="text-fg-subtle mt-2.5 text-xs leading-normal text-pretty">
                {fill(t('placeNote', lang), { store: store?.name ?? '' })}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd data-num className="font-medium">
        {value}
      </dd>
    </div>
  );
}

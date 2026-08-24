'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

import { flash } from '@restaurant/ui';

import { billTotals, cashRoundingDelta, roundedForCash } from '@restaurant/surfaces/money';
import { cartSubtotal, clearCart, setQuantity, useCart } from '@/lib/guest-cart';

import { som } from '../../../(guest)/guest-session';
import { placeSiteOrder } from '../../../(site)/site-client';
import { fill, t } from '@restaurant/surfaces/tg/copy';
import { TgAppBar } from '../../tg-app-bar';
import {
  say,
  TG_DELIVERY,
  TG_POINTS,
  TG_RAILS,
  type Lang,
  type TgRail,
} from '@restaurant/surfaces/tg/data';
import { TgDock } from '../../tg-dock';
import { setMode, useMode } from '../../tg-mode';

/**
 * Screen 2 of 4 — the order and the payment.
 *
 * The money is `lib/pricing`, which is the transcription of the server's
 * `BillTotals` that a test keeps honest against the PHP. Nothing here invents a
 * rule: **VAT is inside the price and only ever displayed**, there is no
 * service charge on a delivery, and the cash total is rounded to the nearest
 * thousand so'm because that is what a courier can make change for.
 *
 * **Points are a discount with a ceiling, and the ceiling is the fix.**
 * `t.loyalWorth` — "1 ball = 1 so'm · hisobning 30% gacha ishlatiladi". The
 * build let a balance swallow the entire food line, which is not a loyalty
 * scheme but a second currency: a 2 840-point guest could have taken a 22 000
 * so'm salad to zero and handed the courier nothing. Thirty per cent of the
 * food line is what the design promises and what this now applies.
 *
 * Three payment rails, and cash is the only one that changes the number. The
 * rounding line appears when it does and never otherwise.
 *
 * ---------------------------------------------------------------------------
 * The button places a real order now, and what it may honestly place
 *
 * `POST /api/v1/public/orders` through this app's own Node handler — the same
 * `placeSiteOrder` the restaurant site's checkout calls, deliberately rather
 * than a second copy of it: `placeOrderPayloadFrom` is where a basket becomes a
 * body, and two of those drift until one screen sends a modifier id the other
 * drops. `source: 'telegram'` is the only difference in the payload, and the
 * server derives the billing lane from it (`intake_channel`) — a client naming
 * that itself would be a client filing its own revenue.
 *
 * Three things this screen cannot honestly claim, so it does not:
 *
 *   **An address.** The design draws no address field here, because the bot
 *   knows where a returning guest lives. Nothing on this page does, so the
 *   order is `pickup` — the honest shape for a basket with nowhere to carry it
 *   — and a guest sitting in delivery mode is offered the switch rather than
 *   charged a courier fee the bill will not have.
 *
 *   **Money inside Telegram.** `TG_RAILS` says "Telegram ichida to'lanadi", and
 *   that is `sendInvoice` and `answerPreCheckoutQuery` through the Bot API,
 *   which needs the token that lives with the aiogram dispatcher in
 *   `apps/telegram-bots` and must never reach a page a guest can open. So the
 *   two in-Telegram rails are drawn and disabled with the reason, and every
 *   order this screen places is settled on collection. Sending them as `online`
 *   instead would park the bill at `draft` — see `PublicOrderController`, "paid
 *   online means not yet cooked" — waiting for a payment nothing will ever
 *   make.
 *
 *   **Who the guest is.** `customer.name` and `customer.phone` are required and
 *   inside Telegram both live in the signed `initData` payload, which needs the
 *   same bot token to verify. The name is prefilled from what the WebView hands
 *   over unverified, because a wrong name is a wrong name and not a wrong
 *   order; the number is asked for, because Telegram does not give it to a
 *   WebView at all and a docket with no number is a counter with nobody to call.
 */
export function TgCartBoard({ lang, basket }: { lang: Lang; basket: string }) {
  const money = (tiyin: number) => som(tiyin, lang);

  const router = useRouter();
  const cart = useCart(basket);
  const mode = useMode();

  /*
   * Cash, not the design's `click`.
   *
   * The drawing opens on the first rail because all three of its rails work.
   * Two of these do not yet — see the note above — and a screen that opens on a
   * control it will refuse is a screen whose main button is dead on arrival.
   */
  const [railId, setRailId] = useState<TgRail['id']>('cash');
  const [usePoints, setUsePoints] = useState(false);
  /*
   * The name Telegram already knows, until the guest types over it.
   *
   * `null` means untouched, which is what lets the suggestion appear without
   * overwriting anything: a guest who cleared the field on purpose gets `''`
   * and keeps it.
   */
  const [typed, setTyped] = useState<string | null>(null);
  /* Called unconditionally — `typed ?? useTelegramName()` would skip the hook
     the moment somebody typed, which is a hook order that changes mid-life. */
  const suggested = useTelegramName();
  const name = typed ?? suggested;
  const [phone, setPhone] = useState('');
  const [placing, setPlacing] = useState(false);
  /** The API's own refusal, in the reader's language, under the button. */
  const [refused, setRefused] = useState<string | null>(null);

  const subtotal = cartSubtotal(cart);
  const fee = mode === 'delivery' ? TG_DELIVERY.fee : 0;

  /*
   * The cap, in tiyin, computed the way `percentOf` would and floored to a
   * whole point: a guest cannot spend a third of a point, and the figure on
   * screen has to be one the ledger can debit exactly.
   */
  const ceiling = Math.floor((subtotal * TG_POINTS.maxSharePercent) / 100);
  const affordable = TG_POINTS.balance * TG_POINTS.worth;
  const spendable = Math.floor(Math.min(ceiling, affordable) / TG_POINTS.worth) * TG_POINTS.worth;

  const discount = usePoints ? spendable : 0;
  const pointsSpent = discount / TG_POINTS.worth;

  const totals = billTotals({
    subtotal,
    /* Delivery and takeaway: no service charge. `chargesService()` enforces it. */
    channel: mode === 'delivery' ? 'delivery' : 'takeaway',
    discount,
    deliveryFee: fee,
  });

  const isCash = railId === 'cash';
  const payable = isCash ? roundedForCash(totals.total) : totals.total;
  const rounding = isCash ? cashRoundingDelta(totals.total) : 0;

  /*
   * What has to be true before this basket can become an order.
   *
   * The delivery fee is the one worth spelling out: in delivery mode the totals
   * above include TG_DELIVERY.fee, and a `pickup` order is billed without it —
   * so placing from that state would show a guest one figure and charge them
   * another, which is the exact failure `pricing.ts` exists to prevent.
   */
  const collecting = mode === 'pickup';
  const knowsGuest = name.trim().length >= 2 && phone.replace(/\D+/g, '').length >= 7;
  /*
   * Points are the same mismatch as the fee, one step further along.
   *
   * `TG_POINTS.balance` is a fixture and no endpoint spends it: the body this
   * screen sends carries no discount at all, because `PublicOrderRequest`
   * refuses one by not declaring it — "a discount a request can set is a
   * hundred percent discount". So a basket with points applied would be shown
   * one total and billed another, and the tick is what has to go, not the
   * arithmetic.
   */
  const canPlace = collecting && isCash && knowsGuest && !usePoints && !placing;

  if (cart.lines.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TgAppBar lang={lang} title={t('cart', lang)} />

        {/*
         * No emoji here, and that is the point: the empty state had a 📝 the
         * design never drew. `FOUNDATIONS §8` allows emoji on this surface
         * because Telegram's own messages use them — not as decoration on our
         * own screens.
         */}
        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight">{t('empty', lang)}</h1>
          <p className="mt-2 text-sm leading-normal" style={{ color: 'var(--tg-hint)' }}>
            {t('emptySub', lang)}
          </p>

          <Link
            href="/tg/menu"
            data-tap="pay"
            data-press
            className="mt-6 flex items-center justify-center rounded-[12px] px-6 text-sm font-semibold"
            style={{ background: 'var(--acc)', color: '#fff' }}
          >
            {t('backToMenu', lang)}
          </Link>
        </main>

        <TgDock lang={lang} basket={basket} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TgAppBar lang={lang} title={t('cart', lang)} />

      <main className="flex-1 px-4 pt-3.5 pb-40">
        {/* Collection only, because there is no address field on this screen —
            see the note at the top of this file. Offered with the switch rather
            than as a rule, so a guest in delivery mode has something to press. */}
        <p
          className="rounded-[12px] px-3.5 py-2.5 text-[11px] leading-normal"
          style={{ background: 'var(--warning-50)', color: 'var(--warning-700)' }}
        >
          {t('pickupOnly', lang)}
          {collecting ? null : (
            <>
              {' '}
              <button
                type="button"
                data-tap
                onClick={() => setMode('pickup')}
                className="font-semibold underline underline-offset-2"
              >
                {t('switchToPickup', lang)}
              </button>
            </>
          )}
        </p>

        {/* --------------------------------------------------------- lines */}
        <ul className="mt-3">
          {cart.lines.map((line) => (
            <li
              key={line.key}
              className="flex items-center gap-3 border-b py-3 last:border-0"
              style={{ borderColor: 'var(--divider)' }}
            >
              <span
                data-num
                className="w-6 flex-none text-base font-bold"
                style={{ color: 'var(--acc)' }}
              >
                {line.quantity}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{line.name}</span>
                <span data-num className="block text-[11px]" style={{ color: 'var(--tg-hint)' }}>
                  {money(line.unitPrice)} × {line.quantity}
                </span>
              </span>

              <span className="flex flex-none items-center gap-1.5">
                <button
                  type="button"
                  data-tap
                  data-press
                  onClick={() => setQuantity(basket, line.key, line.quantity - 1)}
                  aria-label="−"
                  className="grid size-[30px] place-items-center rounded-lg border text-[15px] font-semibold"
                  style={{ borderColor: 'var(--border-strong)', background: 'var(--tg-card)' }}
                >
                  −
                </button>
                <button
                  type="button"
                  data-tap
                  data-press
                  onClick={() => setQuantity(basket, line.key, line.quantity + 1)}
                  aria-label="+"
                  className="grid size-[30px] place-items-center rounded-lg text-base font-semibold"
                  style={{ background: 'var(--acc)', color: '#fff' }}
                >
                  +
                </button>
              </span>

              <span data-num className="w-24 flex-none text-right text-sm font-semibold">
                {money(line.unitPrice * line.quantity)}
              </span>
            </li>
          ))}
        </ul>

        {/* -------------------------------------------------------- points */}
        <button
          type="button"
          data-tap
          data-press
          onClick={() => {
            const next = !usePoints;

            setUsePoints(next);

            if (next && spendable > 0) {
              flash(fill(t('costs', lang), { n: pointsOf(spendable) }) + ' · ' + money(spendable));
            }
          }}
          aria-pressed={usePoints}
          disabled={spendable === 0}
          className="mt-4 flex w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left disabled:opacity-50"
          style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
        >
          <span
            aria-hidden
            className="grid size-5 flex-none place-items-center rounded-[5px] border text-xs text-white"
            style={{
              background: usePoints ? 'var(--acc)' : 'transparent',
              borderColor: usePoints ? 'var(--acc)' : 'var(--border-strong)',
            }}
          >
            {usePoints ? '✓' : ''}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t('usePoints', lang)}</span>
            <span className="block text-[11px]" style={{ color: 'var(--tg-hint)' }}>
              {t('pointsCap', lang)}
            </span>
          </span>

          <span data-num className="flex-none text-xs" style={{ color: 'var(--tg-hint)' }}>
            {TG_POINTS.balance.toLocaleString('ru-RU').replace(/[,\s]/g, ' ')}
          </span>
        </button>

        {/* ------------------------------------------------------- payment */}
        <section
          className="mt-4 rounded-[14px] border px-4 py-3.5"
          style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
        >
          <h2
            className="text-2xs tracking-caps font-bold uppercase"
            style={{ color: 'var(--tg-hint)' }}
          >
            {t('payHow', lang)}
          </h2>

          <div role="radiogroup" aria-label={t('payHow', lang)} className="mt-2.5 grid gap-2">
            {TG_RAILS.map((entry) => {
              const on = entry.id === railId;
              /*
               * Drawn and refused, rather than removed.
               *
               * The design's three rails are what the restaurant will offer, and
               * a chooser that quietly lost two of them would read as a product
               * decision instead of an unfinished one. Disabled with the reason
               * printed under the group.
               */
              const wired = entry.id === 'cash';

              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!wired}
                  data-tap
                  data-press
                  onClick={() => setRailId(entry.id)}
                  className="flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left disabled:opacity-45"
                  style={{
                    background: on ? 'var(--acc-soft)' : 'var(--tg-bg)',
                    borderColor: on ? 'var(--acc)' : 'var(--border)',
                  }}
                >
                  <span
                    aria-hidden
                    className="grid size-[18px] flex-none place-items-center rounded-full border text-[10px] font-extrabold text-white"
                    style={{
                      background: on ? 'var(--acc)' : 'transparent',
                      borderColor: on ? 'var(--acc)' : 'var(--border-strong)',
                    }}
                  >
                    {on ? '✓' : ''}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{say(entry.label, lang)}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--tg-hint)' }}>
                      {say(entry.note, lang)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 text-[11px] leading-normal" style={{ color: 'var(--tg-hint)' }}>
            {t('payOnPickup', lang)}
          </p>
        </section>

        {/* ------------------------------------------------------------ who */}
        <section
          className="mt-4 rounded-[14px] border px-4 py-3.5"
          style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
        >
          <h2
            className="text-2xs tracking-caps font-bold uppercase"
            style={{ color: 'var(--tg-hint)' }}
          >
            {t('yourName', lang)}
          </h2>

          <input
            value={name}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={120}
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-[10px] border px-3.5 text-sm"
            style={{ background: 'var(--tg-bg)', borderColor: 'var(--border-strong)' }}
          />

          <h2
            className="text-2xs tracking-caps mt-3.5 font-bold uppercase"
            style={{ color: 'var(--tg-hint)' }}
          >
            {t('yourPhone', lang)}
          </h2>

          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            maxLength={32}
            autoComplete="tel"
            data-num
            className="mt-2 h-11 w-full rounded-[10px] border px-3.5 text-sm"
            style={{ background: 'var(--tg-bg)', borderColor: 'var(--border-strong)' }}
          />

          <p className="mt-2.5 text-[11px] leading-normal" style={{ color: 'var(--tg-hint)' }}>
            {t('whoNote', lang)}
          </p>
        </section>

        {/* -------------------------------------------------------- totals */}
        <dl className="mt-3.5 border-t pt-3 text-sm" style={{ borderColor: 'var(--border)' }}>
          <Row label={t('items', lang)} value={money(totals.subtotal)} />

          <Row
            label={mode === 'delivery' ? t('delivery', lang) : t('pickup', lang)}
            value={fee === 0 ? t('free', lang) : money(fee)}
          />

          {/* The design's `totals` has no conditional member: "Ballardan" is
              printed whether or not any were spent, because a row that appears
              only after a checkbox is a saving nobody knew to look for. */}
          <Row
            label={t('fromPoints', lang)}
            value={totals.discount > 0 ? `− ${money(totals.discount)}` : '—'}
            tone={totals.discount > 0 ? 'var(--success-600)' : undefined}
          />

          {rounding !== 0 ? (
            <Row
              label="±"
              value={`${rounding > 0 ? '+' : '−'}${money(Math.abs(rounding))}`}
              tone="var(--tg-hint)"
            />
          ) : null}

          <div
            className="mt-2 flex items-baseline justify-between border-t pt-3"
            style={{ borderColor: 'var(--divider)' }}
          >
            <dt className="text-base font-bold">{t('total', lang)}</dt>
            <dd data-num className="font-display text-xl font-bold">
              {money(payable)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-[11px] leading-normal" style={{ color: 'var(--tg-hint)' }}>
          {t('vatNote', lang)}
        </p>
        {/*
         * The figure the ledger will record, spelled out beside the sentence.
         *
         * The design extracts VAT from a base that includes the 12 000 so'm
         * delivery fee and prints 20 036. `BillTotals::of()` keeps delivery
         * outside the tax base — a courier's fee is not a taxable supply of
         * food — so this comes out lower, and it is the server's number that
         * reaches the receipt, the fiscal driver and the Z report. Changing
         * `lib/pricing.ts` to match the drawing would put the browser and the
         * till at odds, which is the one thing a money mirror must never do.
         */}
        <p data-num className="mt-1 text-[11px]" style={{ color: 'var(--tg-hint)' }}>
          {t('vatOf', lang)} · {money(totals.vatIncluded)}
        </p>

        {pointsSpent > 0 ? (
          <p data-num className="mt-1 text-[11px]" style={{ color: 'var(--tg-hint)' }}>
            {fill(t('costs', lang), { n: pointsSpent })}
          </p>
        ) : null}
      </main>

      {/* ---------------------------------------------------- main button */}
      <div
        className="fixed inset-x-0 bottom-14 z-40 mx-auto max-w-[480px] border-t px-3.5 pt-2.5 pb-4"
        style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
      >
        {/*
         * The basket, on its way to a real kitchen.
         *
         * `placeSiteOrder` is the restaurant site's own placement path — the
         * reason it is reused rather than copied is at the top of this file.
         * What it refuses before the network is the useful half: a basket built
         * against `TG_MENU`, whose dish ids are words like `plov-tashkent`,
         * cannot be priced by any restaurant's catalogue, and
         * `placeOrderPayloadFrom` answers null rather than letting the guest
         * commit and be told about a menu item id.
         */}
        {usePoints ? (
          <p className="mb-2 text-[11px] leading-normal" style={{ color: 'var(--tg-hint)' }}>
            {t('pointsNotWired', lang)}
          </p>
        ) : null}

        {refused === null ? null : (
          <p
            role="alert"
            className="mb-2 text-[11px] leading-normal"
            style={{ color: 'var(--danger-600)' }}
          >
            {refused}
          </p>
        )}

        <button
          type="button"
          data-tap="pay"
          data-press
          disabled={!canPlace}
          onClick={() => {
            if (!canPlace) return;

            setPlacing(true);
            setRefused(null);

            void placeSiteOrder(
              {
                /* `takeaway` is what `orders.channel` stores and `pickup` is
                   what the guest surfaces say; the payload builder sends the
                   guest's word and both reach the same row. */
                channel: 'takeaway',
                /* No id to send. The mini app is one restaurant's, and a venue
                   with one open branch is resolved by the server — a chain is
                   refused rather than guessed, which is the honest failure. */
                branchId: '',
                lines: cart.lines.map((line) => ({
                  dishId: line.dishId,
                  modifierIds: line.modifierIds ?? [],
                  quantity: line.quantity,
                  note: line.note,
                })),
                name: name.trim(),
                phone: phone.trim(),
                /* Collection: nowhere to carry it, so nothing to say. */
                address: null,
                railId: 'cash',
                /* The door this came through. The server turns it into the
                   billing lane (`intake_channel`); the client never names one. */
                source: 'telegram',
              },
              lang,
            ).then((answer) => {
              if (!answer.ok) {
                setPlacing(false);

                /* `not_orderable` is ours and means the basket was filled from
                   the sample menu; everything else is the API's own sentence in
                   the reader's language, which says which rule refused. */
                const said =
                  answer.error === 'not_orderable'
                    ? t('sampleMenu', lang)
                    : (answer.message ?? t('sampleMenu', lang));

                setRefused(said);
                flash.problem(said);

                return;
              }

              clearCart(basket);
              flash(fill(t('placed', lang), { number: answer.data.number }));
              /*
               * Back to the conversation, which is where the design sends it:
               * `mainGo` for the cart sets `stage: "chat"`. The bot is what
               * tells a guest what happens next, and the order screen is one
               * tap from the message it posts.
               */
              router.push('/tg');
            });
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-[10px] text-[15px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--acc)', color: '#fff' }}
        >
          <span>{t('mainPay', lang)}</span>
          <span data-num className="opacity-90">
            {money(payable)}
          </span>
        </button>
      </div>

      <TgDock lang={lang} basket={basket} />
    </div>
  );
}

/** Tiyin of discount back to whole points — one point buys one so'm. */
const pointsOf = (tiyin: number) => Math.round(tiyin / TG_POINTS.worth);

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt style={{ color: tone ?? 'var(--tg-hint)' }}>{label}</dt>
      <dd data-num className="font-medium" style={{ color: tone ?? 'var(--tg-text)' }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The name Telegram hands the WebView, or nothing.
 *
 * `useSyncExternalStore` rather than an effect, which is the pattern every
 * other browser-only read in this app uses (`lib/guest-cart`, `tg-mode`,
 * `placed-order`) and for the same reason: this page is server-rendered, the
 * server has no `window`, and a value read during hydration that the server
 * never saw is a mismatch React reports as a broken page. The server snapshot
 * is the empty string and the client's arrives on the next paint.
 *
 * Nothing subscribes, because nothing changes it — Telegram fills `initData`
 * before the WebView loads.
 *
 * `initDataUnsafe` is exactly what its name says: the same fields as the signed
 * `initData`, handed over without the signature check that needs the bot token.
 * Good enough to save a guest typing "Aziz" and never good enough to identify
 * anybody — nothing downstream authorises on it, and the field stays editable.
 */
const noSubscribe = () => () => {};

function useTelegramName(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const user = (window as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user;

      return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
    },
    () => '',
  );
}

/**
 * The sliver of Telegram's WebView API this screen reads.
 *
 * Declared here rather than pulled in as a dependency: one optional field of
 * one object, and `@twa-dev/types` would be a package on the critical path of a
 * page that already has to load over a café's connection. `initDataUnsafe` is
 * the unsigned half by name — see where it is read for why that is acceptable
 * for a prefilled name and for nothing else.
 */
type TelegramWindow = {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: { user?: { first_name?: string; last_name?: string } };
    };
  };
};

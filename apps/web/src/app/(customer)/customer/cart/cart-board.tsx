'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { DishPhoto } from '@/components/dish-photo';
import { billTotals } from '@restaurant/surfaces/money';

import { promoDiscount, useCart, type ResolvedLine } from '../../cart-store';
import { CART, copy, SHARED } from '@restaurant/surfaces/customer/copy';
import { CustomerDock } from '../../customer-dock';
import {
  BRANCH_BY_ID,
  BRANCHES,
  FREE_DELIVERY_OVER,
  say,
  type Lang,
} from '@restaurant/surfaces/customer/data';
import { Money } from '../../money';

/**
 * The basket.
 *
 * The screen quotes a price, and the whole of its arithmetic is one call to
 * `billTotals()` — the browser's mirror of `BillTotals::of()`. Nothing here
 * multiplies, discounts or extracts tax on its own. The rule is not stylistic:
 * a cart that adds up a bill its own way is how a guest sees one number on a
 * phone and a different one on the printed cheque, and the cashier is the one
 * standing there when it happens.
 *
 * The totals block therefore reads top to bottom in the order the money is
 * applied — items, discount, delivery, then what is owed — rather than in the
 * order the design happened to draw the rows, because a guest checking the
 * subtraction has to be able to follow it.
 */
export function CartBoard({ lang }: { lang: Lang }) {
  const t = copy(CART, lang);
  const s = copy(SHARED, lang);
  const cart = useCart();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [promoNote, setPromoNote] = useState<string | null>(null);

  /*
   * The venue from the live list, and the fixture only when there is none.
   *
   * The delivery fee on this row is the one a guest reads before deciding, and
   * `GET /api/v1/public/branches` is where the real one lives — per venue,
   * from `branches.settings['delivery.fee_tiyin']`, and recomputed by the
   * server on the order itself.
   */
  const branch =
    cart.venues.find((venue) => venue.id === cart.branchId) ??
    cart.venues[0] ??
    BRANCH_BY_ID.get(cart.branchId) ??
    BRANCHES[0]!;
  const delivering = cart.channel === 'delivery';

  /*
   * Free above the threshold, and the row still renders — struck through rather
   * than removed. A fee that silently disappears reads as a fee that was never
   * charged, and the guest never learns the threshold exists.
   */
  const deliveryEarned = cart.subtotal >= FREE_DELIVERY_OVER;
  const deliveryFee = delivering && !deliveryEarned ? branch.deliveryFee : 0;

  const discount = promoDiscount(cart.promo, cart.subtotal);

  const bill = billTotals({
    subtotal: cart.subtotal,
    channel: delivering ? 'delivery' : 'takeaway',
    discount,
    deliveryFee,
  });

  if (cart.resolved.length === 0) {
    return (
      <>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-[var(--phone-gutter)] text-center">
          <p className="font-display text-xl font-semibold">{t.emptyHeading}</p>
          <p className="text-fg-subtle max-w-[34ch] text-sm leading-normal">{t.emptyBody}</p>
          <Link
            href="/customer/menu"
            className="bg-acc mt-1 grid h-[var(--tap-min)] place-items-center rounded-md px-5 text-sm font-semibold text-white"
          >
            {t.emptyCta}
          </Link>
        </main>

        <CustomerDock lang={lang} cartCount={0} />
      </>
    );
  }

  return (
    <>
      <main className="flex-1 pb-6">
        <header
          className="px-[var(--phone-gutter)] pt-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
            {t.heading}
          </h1>
          <p data-num className="text-fg-subtle mt-0.5 text-xs">
            {cart.count} {t.positions}
          </p>
        </header>

        {/* --------------------------------------------------- how it arrives */}
        <div
          role="radiogroup"
          aria-label={s.delivery}
          className="bg-bg-muted mx-[var(--phone-gutter)] mt-4 flex gap-1 rounded-md p-1"
        >
          {(
            [
              ['delivery', s.delivery],
              ['takeaway', s.pickup],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={cart.channel === value}
              onClick={() => cart.setChannel(value)}
              className={`h-10 flex-1 rounded-sm text-sm font-semibold ${
                cart.channel === value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-3 block px-[var(--phone-gutter)]">
          <span className="text-fg-subtle text-xs">
            {delivering ? s.delivery : s.pickup} · {branch.eta} {s.minutes}
          </span>
          <select
            value={cart.branchId}
            onChange={(event) => cart.setBranch(event.target.value)}
            className="border-border bg-surface mt-1 h-12 w-full rounded-md border px-3 text-base"
          >
            {cart.venues.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.address}
              </option>
            ))}
          </select>
        </label>

        {/* ---------------------------------------------------------- lines */}
        <ul className="mt-4 flex flex-col px-[var(--phone-gutter)]">
          {cart.resolved.map((entry) => (
            <CartRow key={entry.line.key} entry={entry} lang={lang} />
          ))}
        </ul>

        {/* ---------------------------------------------------------- promo */}
        <div className="mt-5 px-[var(--phone-gutter)]">
          {cart.promo === null ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();

                const outcome = await cart.applyPromo(code, lang);

                const problem =
                  outcome === 'ok'
                    ? null
                    : outcome === 'empty'
                      ? t.promoEmpty
                      : outcome === 'already'
                        ? t.promoAlready
                        : outcome === 'floor'
                          ? t.promoFloor
                          : t.promoUnknown;

                setPromoNote(problem);

                /*
                 * Both, and they are not redundant. The inline note is what a
                 * screen reader announces and what stays on screen while the
                 * guest retypes; the flash is what the design does on every
                 * outcome (`applyPromo` calls it four ways). A guest looking at
                 * the total rather than at the field sees the flash.
                 */
                if (problem === null) {
                  setCode('');
                  flash(`${code.trim().toUpperCase()} · ${t.promoApplied}`);
                } else {
                  flash.problem(problem);
                }
              }}
              className="flex gap-2"
            >
              <input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setPromoNote(null);
                }}
                placeholder={t.promoPlaceholder}
                aria-label={t.promoPlaceholder}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={promoNote !== null}
                className="border-border bg-surface h-12 min-w-0 flex-1 rounded-md border px-3.5 text-base uppercase"
              />
              <button
                type="submit"
                className="border-border h-12 flex-none rounded-md border px-4 text-sm font-semibold"
              >
                {t.promoApply}
              </button>
            </form>
          ) : (
            <div className="border-acc-line bg-acc-soft flex items-center gap-2 rounded-md border px-3.5 py-3">
              <span data-num className="text-acc text-sm font-semibold">
                {cart.promo.code}
              </span>
              <span className="text-fg-subtle flex-1 text-xs">
                {cart.promo.percent > 0 ? `−${cart.promo.percent}% · ` : ''}
                {t.promoApplied}
              </span>
              <button
                type="button"
                onClick={() => {
                  cart.clearPromo();
                  setPromoNote(null);
                  flash(`${cart.promo?.code ?? ''} · ${s.remove}`.trim());
                }}
                className="text-fg-muted text-xs font-semibold underline"
              >
                {s.remove}
              </button>
            </div>
          )}

          {/*
           * `role="alert"` so a guest using a screen reader hears why the code
           * bounced. Without it the field simply stays empty and nothing is said.
           */}
          {promoNote !== null ? (
            <p role="alert" className="text-danger-600 mt-2 text-xs leading-normal">
              {promoNote}
            </p>
          ) : null}
        </div>

        {/* --------------------------------------------------------- totals */}
        <dl className="mt-5 flex flex-col gap-2 px-[var(--phone-gutter)] text-sm">
          <Row label={s.items}>
            <Money tiyin={bill.subtotal} lang={lang} />
          </Row>

          {/*
           * Four rows, always four — `totals` in the design has no conditional
           * member. A discount line that only appears once a code has worked is
           * a line nobody knows to look for, and a delivery row that vanishes on
           * pickup takes the word "bepul" with it: the customer never learns
           * that collecting is what made it free. An em dash is the honest
           * rendering of nothing.
           */}
          <Row label={delivering ? s.delivery : s.pickup}>
            {!delivering || deliveryEarned ? (
              <span className="text-fg-subtle text-sm font-semibold">{s.free}</span>
            ) : (
              <Money tiyin={bill.deliveryFee} lang={lang} />
            )}
          </Row>

          <Row label={cart.promo === null ? s.discount : `${s.discount} · ${cart.promo.code}`}>
            {bill.discount > 0 ? (
              <span className="text-acc text-sm font-semibold">
                −<Money tiyin={bill.discount} lang={lang} className="text-acc" />
              </span>
            ) : (
              <span className="text-fg-subtle text-sm font-semibold">—</span>
            )}
          </Row>

          <div className="border-divider mt-1 flex items-baseline justify-between border-t pt-3">
            <dt className="text-md font-semibold">{s.total}</dt>
            <dd>
              <Money tiyin={bill.total} lang={lang} className="text-lg" />
            </dd>
          </div>

          <p className="text-fg-subtle mt-0.5 text-xs leading-normal">
            {t.vatNote} <Money tiyin={bill.vatIncluded} lang={lang} className="text-xs" />
          </p>
        </dl>
      </main>

      {/*
       * The pay button sits above the dock rather than inside it. It is the one
       * control on this screen that costs money, and a guest reaching for the
       * cart tab must not be able to land on it by a thumb's width.
       */}
      <div className="cx-bar" data-above-dock="true">
        <button
          type="button"
          onClick={() => router.push('/customer/pay')}
          className="bg-acc flex h-[var(--tap-lg)] w-full items-center justify-center gap-2 rounded-md px-4 text-base font-semibold text-white"
        >
          <span>{t.toPayment}</span>
          <Money tiyin={bill.total} lang={lang} className="text-base text-white" />
        </button>
      </div>

      <CustomerDock lang={lang} cartCount={cart.count} />
    </>
  );
}

function Row({ label, children }: { label: string; tone?: 'acc'; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One line: a thumbnail, what it is, and the two controls that change it.
 *
 * Two things the design has that this did not. A **64px picture**, because a
 * basket of four rows of text is the one place a customer double-checks they
 * ordered the right thing and a name alone is what makes them go back to the
 * menu to look. And a **named Remove**, because the stepper used to turn into a
 * wastebasket emoji at quantity one: an emoji is not a control, it renders as a
 * different picture on every platform, the content rules forbid one outside the
 * Telegram bot, and "press minus until the row disappears" is not a thing
 * anybody expects a minus to do.
 *
 * So the stepper stops at one and does what a stepper does, and removing is its
 * own word underneath.
 */
function CartRow({ entry, lang }: { entry: ResolvedLine; lang: Lang }) {
  const cart = useCart();
  const t = copy(CART, lang);
  const s = copy(SHARED, lang);

  const extras =
    entry.modifiers.length === 0
      ? t.noExtras
      : entry.modifiers.map((modifier) => say(modifier.name, lang)).join(' · ');

  return (
    <li className="border-divider flex items-start gap-3 border-b py-3.5 last:border-0">
      {/*
       * The line is resolved against the menu, so the picture is the dish's
       * own size set rather than an address saved with the basket — and
       * `sizes="64px"` makes it `thumb` (160px), not the 1600px file. No
       * photograph leaves the `.c-shot` tint, as before.
       */}
      <span className="c-shot size-16 flex-none rounded-md" aria-hidden>
        <DishPhoto image={entry.dish.image ?? null} alt="" sizes="64px" className="size-full" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-md leading-snug font-semibold">{say(entry.dish.name, lang)}</p>

        <p className="text-fg-subtle mt-0.5 text-xs leading-normal">
          {say(entry.portion.name, lang)} · {extras}
        </p>

        {entry.line.note !== '' ? (
          <p className="text-fg-muted mt-0.5 text-xs leading-normal italic">“{entry.line.note}”</p>
        ) : null}

        <div className="mt-2">
          <Money tiyin={entry.linePrice} lang={lang} />
        </div>
      </div>

      <div className="flex flex-none flex-col items-end gap-1.5">
        <div className="border-border rounded-pill flex items-center border">
          <button
            type="button"
            onClick={() => cart.setQuantity(entry.line.key, Math.max(1, entry.line.quantity - 1))}
            aria-label="−"
            disabled={entry.line.quantity === 1}
            className="grid h-[var(--tap-min)] w-10 place-items-center text-lg disabled:opacity-40"
          >
            −
          </button>

          <span data-num className="w-6 text-center text-sm font-semibold">
            {entry.line.quantity}
          </span>

          <button
            type="button"
            onClick={() => cart.setQuantity(entry.line.key, entry.line.quantity + 1)}
            aria-label="+"
            className="grid h-[var(--tap-min)] w-10 place-items-center text-lg"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            cart.remove(entry.line.key);
            flash(`${say(entry.dish.name, lang)} · ${t.removed}`);
          }}
          className="text-fg-subtle text-xs font-semibold"
        >
          {s.remove}
        </button>
      </div>
    </li>
  );
}

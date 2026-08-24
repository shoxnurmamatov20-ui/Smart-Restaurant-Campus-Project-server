'use client';

import { flash } from '@restaurant/ui';
import Link from 'next/link';
import { useState } from 'react';

import {
  addLine,
  cartCount,
  cartSubtotal,
  clearCart,
  setQuantity,
  useCart,
} from '@/lib/guest-cart';
import { billTotals, SERVICE_PERCENT, VAT_PERCENT } from '@restaurant/surfaces/money';

import { copy, fill, FLASH, MENU_COPY, ORDER_COPY, SHARED } from '@restaurant/surfaces/crew/copy';
import { MENU_ROWS, say, type Lang, type MenuRow } from '@restaurant/surfaces/crew/data';
import { realId } from '@restaurant/surfaces/crew/live';
import { Som } from '../../../../../crew-money';
import { EmptyState, Note, NotWired, SectionLabel } from '../../../../../panels/bits';

/**
 * A waiter taking an order at the table.
 *
 * The design's four steps — pick the table, pick the items, review, send —
 * and the app had none of it: a waiter could look at their tables and read the
 * menu, and then had to walk to a tablet.
 *
 * **One screen, not four routes.** The table is already chosen (this screen
 * hangs off it), and the other three are a list, a basket and a button. A
 * wizard on a phone means a waiter who wants to add one more thing loses the
 * page they scrolled to, with a guest watching.
 *
 * **A sold-out dish cannot be tapped at all.** The menu panel dims them and
 * says so in words; here they are also inert, because the cost of the mistake
 * is different — reading the wrong price to a guest is an apology, and putting
 * an 86'd dish on a bill is an apology plus a re-cook plus usually a discount.
 *
 * The basket is `lib/guest-cart`, keyed `crew:{table}`. Same store as the
 * guest surfaces, so a table's order survives the app being closed — which on
 * a phone happens every time somebody takes a call.
 *
 * **The total is the total.** The review used to end at the sum of the lines,
 * and the send button repeated it — so the first figure a waiter could read
 * aloud was ten percent short of what the guest would be handed. The ladder
 * below is the design's `mfOrdTotals`, and every figure in it comes from
 * `lib/pricing`, which mirrors `BillTotals::of()` line for line. Nothing here
 * multiplies anything: a second arithmetic is exactly how a phone and a printed
 * cheque come to disagree, and the waiter is who gets blamed for it.
 */
export function OrderBoard({
  lang,
  role,
  table,
  tableLabel,
  tableId = table,
  orderId,
  dishes = MENU_ROWS,
  live = false,
}: {
  lang: Lang;
  role: string;
  /** The basket's key — the segment in the URL, whatever it names. */
  table: string;
  tableLabel: string;
  /** The table row's own id, which on a live floor is the database one. */
  tableId?: string;
  /** The bill already open on it, when there is one. */
  orderId?: number;
  /** The card, from `GET /api/v1/menu/items` — see `crewMenu()`. */
  dishes?: readonly MenuRow[];
  live?: boolean;
}) {
  const t = copy(ORDER_COPY, lang);
  const menu = copy(MENU_COPY, lang);
  const shared = copy(SHARED, lang);
  const f = copy(FLASH, lang);

  const basket = `crew:${table}`;
  const cart = useCart(basket);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const count = cartCount(cart);

  /*
   * Dine-in, and that is not a placeholder: this screen hangs off a table, so
   * there is no other channel it could be. Takeaway and delivery are charged no
   * service, and `chargesService()` is what says so — the rule lives in one
   * place rather than as a condition written out here.
   */
  const bill = billTotals({ subtotal: cartSubtotal(cart), channel: 'dine_in' });

  /**
   * Fire it.
   *
   * `POST /crew/order` opens the table's bill if it has none and puts every
   * line on it through `orders/orders/{id}/items`, which prices each dish from
   * the Menu at that moment — so nothing here sends money, and a handset that
   * cached a price at lunchtime cannot charge it at nine.
   *
   * The basket is cleared only on a clean send. A pad that emptied itself on a
   * refusal would leave a waiter re-keying eight lines with a guest watching,
   * and a partial send is reported as one: the dish the kitchen 86'd between
   * the tap and the press is named, and the rest are on the bill.
   */
  const send = async () => {
    if (busy) return;

    /*
     * A fixture table or a fixture card. Neither has ids the kitchen would
     * recognise, and the strip above has already said the screen is a sample —
     * so the basket clears locally and nothing is claimed about the kitchen.
     */
    const table_id = realId(tableId);

    if (!live || table_id === null) {
      flash(fill(f.orderSent, { n: count }));
      clearCart(basket);
      setSent(true);

      return;
    }

    setBusy(true);

    type SendAnswer = { data?: { sent?: number; refused?: number } };

    let answer: SendAnswer | null = null;

    try {
      const response = await fetch('/crew/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: table_id,
          tableLabel,
          orderId,
          lines: cart.lines.map((line) => ({
            menuItemId: realId(line.dishId),
            quantity: line.quantity,
            note: line.note,
          })),
        }),
      });

      // A POST with no shift cookie is redirected to the keypad and followed,
      // which answers 200 with HTML. Nothing was fired.
      answer = response.ok && !response.redirected ? ((await response.json()) as SendAnswer) : null;
    } catch {
      answer = null;
    }

    setBusy(false);

    if (answer?.data === undefined) {
      // Nothing is cleared and nothing is claimed. A waiter told the order went
      // when it did not is a table waiting for food nobody is cooking.
      flash.problem(t.sendNote);

      return;
    }

    const landed = answer.data.sent ?? 0;
    const refused = answer.data.refused ?? 0;

    if (landed === 0) {
      flash.problem(shared.soldOut);

      return;
    }

    flash(refused > 0 ? fill(f.orderSent, { n: landed }) : fill(f.orderSent, { n: count }));

    // Only what landed leaves the pad. A refused line stays so the waiter can
    // see which dish the kitchen would not take and offer something else.
    if (refused === 0) {
      clearCart(basket);
      setSent(true);
    }
  };

  return (
    <section className="pb-28">
      <Link
        href={`/crew/${role}/table/${table}`}
        data-press
        className="text-fg-subtle -ml-1 inline-flex min-h-[var(--tap-min)] items-center gap-1.5 text-sm font-semibold"
      >
        ← {shared.back}
      </Link>

      <h1 className="font-display mt-2 text-2xl leading-tight font-semibold tracking-tight">
        {t.title}
      </h1>
      <p className="text-fg-subtle mt-1 text-xs">{t.forTable.replace('{table}', tableLabel)}</p>

      {/* Only while the pad is fixtures. A live menu on a live table fires a
          real kitchen ticket, and a warning that is wrong half the time is one
          nobody reads the other half. */}
      {live ? null : <NotWired>{shared.notWired}</NotWired>}

      {/* --------------------------------------------------------- pick */}
      <SectionLabel>{t.pick}</SectionLabel>
      <p className="text-fg-muted mb-2 text-xs leading-normal">{menu.intro}</p>

      <ul>
        {dishes.map((dish) => (
          <li
            key={dish.id}
            className={`border-divider flex items-center gap-3 border-b py-3 last:border-b-0 ${
              dish.soldOut ? 'opacity-50' : ''
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{say(dish.name, lang)}</span>
              <span className="text-fg-subtle text-2xs mt-0.5 block">
                {say(dish.category, lang)}
              </span>
            </span>

            {dish.soldOut ? (
              <span className="bg-danger-50 text-danger-700 flex-none rounded-full px-2.5 py-1 text-[10px] font-bold">
                {shared.soldOut}
              </span>
            ) : (
              <>
                <Som tiyin={dish.price} lang={lang} className="flex-none text-sm font-semibold" />
                <button
                  type="button"
                  onClick={() =>
                    addLine(basket, {
                      dishId: dish.id,
                      name: say(dish.name, lang),
                      unitPrice: dish.price,
                      quantity: 1,
                      options: [],
                      note: '',
                    })
                  }
                  aria-label={`${say(dish.name, lang)} +`}
                  className="bg-acc grid size-[var(--tap-min)] flex-none place-items-center rounded-full text-lg font-semibold text-white"
                >
                  +
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* ------------------------------------------------------- review */}
      <SectionLabel>{t.review}</SectionLabel>

      {cart.lines.length === 0 ? (
        <>
          <EmptyState>{t.empty}</EmptyState>
          <p className="text-fg-subtle -mt-4 text-center text-xs leading-normal">{t.emptySub}</p>
        </>
      ) : (
        <ul className="flex flex-col">
          {cart.lines.map((line) => (
            <li
              key={line.key}
              className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{line.name}</span>

              <span className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQuantity(basket, line.key, line.quantity - 1)}
                  aria-label="−"
                  className="border-border grid size-10 place-items-center rounded-[10px] border text-sm font-semibold"
                >
                  −
                </button>
                <span data-num className="w-7 text-center text-sm font-bold">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(basket, line.key, line.quantity + 1)}
                  aria-label="+"
                  className="border-border grid size-10 place-items-center rounded-[10px] border text-sm font-semibold"
                >
                  +
                </button>
              </span>

              <Som
                tiyin={line.unitPrice * line.quantity}
                lang={lang}
                unit={false}
                className="w-20 flex-none text-right text-sm font-semibold"
              />
            </li>
          ))}
        </ul>
      )}

      {/*
       * Three rows, in the design's order: what the food costs, what the table
       * costs, what the guest pays. The percentage is in the label because the
       * question it provokes has one answer and this is the cheapest place to
       * give it.
       */}
      {cart.lines.length > 0 ? (
        <>
          <dl className="border-border mt-4 border-t pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted text-sm">{t.items}</dt>
              <dd>
                <Som
                  tiyin={bill.subtotal}
                  lang={lang}
                  unit={false}
                  className="text-fg-muted text-sm font-medium"
                />
              </dd>
            </div>

            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted text-sm">
                {fill(t.service, { percent: SERVICE_PERCENT })}
              </dt>
              <dd>
                <Som
                  tiyin={bill.serviceCharge}
                  lang={lang}
                  unit={false}
                  className="text-fg-muted text-sm font-medium"
                />
              </dd>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between gap-3">
              <dt className="text-sm font-semibold">{shared.total}</dt>
              <dd>
                <Som
                  tiyin={bill.total}
                  lang={lang}
                  unit={false}
                  className="font-display text-xl font-bold tracking-tight"
                />
              </dd>
            </div>
          </dl>

          {/* VAT is read *out of* the total, never added to it — the note says
              so, because a guest who adds twelve percent to this figure and
              gets a different one at the till concludes the app is lying. */}
          <Note>{fill(t.vatNote, { vat: VAT_PERCENT })}</Note>
        </>
      ) : null}

      <Note>{t.sendNote}</Note>

      {/* --------------------------------------------------------- send */}
      {count > 0 && !sent ? (
        <div className="border-border bg-surface fixed inset-x-0 bottom-[var(--dock-height,64px)] border-t p-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="bg-acc flex h-14 w-full items-center justify-center gap-3 rounded-[12px] text-sm font-semibold text-white disabled:opacity-45"
          >
            <span>{t.send}</span>
            <span aria-hidden>·</span>
            <span data-num>{count}</span>
            <span aria-hidden>·</span>
            {/* The figure on the button is the one the guest pays, not the
                food alone. They differ by the service charge, and the button
                is the last thing read before the order is fired. */}
            <Som tiyin={bill.total} lang={lang} className="font-semibold" />
          </button>
        </div>
      ) : null}

      {sent ? (
        <p className="border-success-500/30 bg-success-50 text-success-700 mt-4 rounded-[10px] border px-3.5 py-3 text-sm font-semibold">
          {t.sent}
        </p>
      ) : null}
    </section>
  );
}

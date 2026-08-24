'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { cartSubtotal, clearCart, setQuantity, useCart } from '@/lib/guest-cart';

import type { GuestLocale } from '@restaurant/surfaces/guest/menu-data';
import { som } from '../../../../guest-session';

/**
 * What this table has chosen and not yet told anybody.
 *
 * Kept apart from the lines above it, which are what the kitchen already has.
 * The distinction is the whole point of the section: a guest must be able to
 * tell "the tea is being made" from "I have picked a tea and nobody knows", and
 * one list containing both would say neither.
 *
 * The empty state is the design's own sentence — `qr.status.empty`, written in
 * three languages long before anything read it: *"the basket is empty; dishes
 * you add from the menu appear here."*
 *
 * ---------------------------------------------------------------------------
 * The send button, and what it costs to get it wrong
 *
 * There was none, on the reasoning that a button which told nobody is the one
 * failure this screen must not have. `POST /api/v1/public/tables/{token}/order`
 * is what changed: the lines go onto the table's open bill and straight to the
 * kitchen, in one transaction.
 *
 * Three things it does that a plain `fetch` would not.
 *
 * **It empties the basket only on success.** A send that failed and cleared
 * would leave a guest with no list, no food and nothing to retry — the worst
 * outcome available on this screen.
 *
 * **It disables itself while in flight.** Not for tidiness: the endpoint is
 * idempotent per request key and a second tap mints a NEW key, so two taps are
 * two orders. The server cannot tell them apart, because a table ordering the
 * same two teas twice is a thing that genuinely happens.
 *
 * **It shows the API's own refusal.** "Manti hozir mavjud emas" names the dish
 * and tells the guest what to do; "something went wrong" has them pressing the
 * same button.
 */
export function GuestBasket({
  basket,
  locale,
  menuHref,
  sendHref,
  copy,
}: {
  basket: string;
  locale: GuestLocale;
  menuHref: string;
  /**
   * Where to send the basket — `/qr/{restaurant}/{token}/service/order`.
   *
   * Optional so the restaurant-site basket, which has no table to send to, can
   * draw this same list without a button it cannot honour.
   */
  sendHref?: string;
  copy: {
    title: string;
    empty: string;
    addMore: string;
    total: string;
    waiter: string;
    send?: string;
    sending?: string;
    sent?: string;
  };
}) {
  const cart = useCart(basket);
  const router = useRouter();
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (sending || sendHref === undefined || cart.lines.length === 0) return;

    setSending(true);

    try {
      const response = await fetch(sendHref, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.lines.map((line) => ({
            // The dish id from `GET /public/menu`, which is the menu item's own
            // id — the basket has carried it since the menu screen was wired.
            menu_item_id: Number(line.dishId),
            quantity: line.quantity,
            /*
             * The kitchen's own choice ids, and only ever numbers.
             *
             * `PublicTableOrderRequest` takes `modifier_choice_ids` as integers
             * and `BillRegistry::addLine` prices each one through `MenuCatalog`;
             * a word — which is what a fixture add-on carries — is refused for
             * the **whole basket**, not just its line. So anything that is not a
             * number is dropped here rather than losing a guest their order,
             * and the label still travels with the line for them to read.
             */
            modifier_choice_ids: (line.modifierIds ?? [])
              .map((id) => Number(id))
              .filter((id) => Number.isInteger(id) && id > 0),
            note: line.note === '' ? null : line.note,
          })),
        }),
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        flash.problem(body?.message ?? copy.empty);

        return;
      }

      // Cleared only now — see the file note.
      clearCart(basket);
      flash(copy.sent ?? copy.title);
      // The lines just moved from "chosen" to "the kitchen has them", and the
      // list above this one is server-rendered.
      router.refresh();
    } catch {
      flash.problem(copy.waiter);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-6">
      <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">{copy.title}</h2>

      {cart.lines.length === 0 ? (
        <p className="text-fg-subtle mt-2 text-sm leading-normal">{copy.empty}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col">
            {cart.lines.map((line) => (
              <li
                key={line.key}
                className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug font-semibold">{line.name}</span>
                  {line.note !== '' ? (
                    <span className="text-fg-subtle block text-xs italic">{line.note}</span>
                  ) : null}
                </span>

                <span className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(basket, line.key, line.quantity - 1)}
                    aria-label="−"
                    className="border-border grid size-9 place-items-center rounded-md border text-sm font-semibold"
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
                    className="border-border grid size-9 place-items-center rounded-md border text-sm font-semibold"
                  >
                    +
                  </button>
                </span>

                <span data-num className="w-24 flex-none text-right text-sm font-semibold">
                  {som(line.unitPrice * line.quantity, locale)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold">{copy.total}</span>
            <span data-num className="font-display text-lg font-bold">
              {som(cartSubtotal(cart), locale)}
            </span>
          </div>

          {sendHref === undefined ? (
            /* No table to send to — the restaurant site's own basket. One
               sentence about finding a waiter, as before. */
            <p className="border-acc-line bg-acc-soft mt-3 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
              {copy.waiter}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="bg-acc mt-3 grid h-[52px] w-full place-items-center rounded-md text-base font-semibold text-white disabled:opacity-55"
            >
              {sending ? (copy.sending ?? copy.send ?? copy.title) : (copy.send ?? copy.title)}
            </button>
          )}
        </>
      )}

      <Link
        href={menuHref}
        className="text-acc mt-3 inline-flex h-[var(--tap-min)] items-center text-sm font-semibold underline"
      >
        {copy.addMore}
      </Link>
    </section>
  );
}

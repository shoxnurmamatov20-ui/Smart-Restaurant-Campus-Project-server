'use client';

import { useState } from 'react';

import type { GuestDish, GuestLocale } from '@restaurant/surfaces/guest/menu-data';
import { som } from './locale-bridge';
import { cartCount, cartSubtotal, useCart } from '@/lib/guest-cart';
import { DishSheet } from './dish-sheet';

/**
 * The two client pieces the menu page needs, and nothing else.
 *
 * The page stays a server component. `specs/07-restaurant-site.md` wants a
 * basket; the same page's own docblock argues — correctly — that the dish names
 * must be in the server HTML because they are the only reason a crawler cares
 * about the page. Both are satisfied by putting the controls in islands rather
 * than the content: the `<li>` and its text are rendered on the server, and
 * only the button inside it is hydrated.
 *
 * `AddButton` is one per row and carries no dish text, so the markup a crawler
 * reads is unchanged. `CartBar` is one per page.
 */
export function AddButton({
  restaurant,
  dish,
  locale,
  copy,
  label,
  groups,
  also,
}: {
  restaurant: string;
  dish: GuestDish;
  locale: GuestLocale;
  copy: React.ComponentProps<typeof DishSheet>['copy'];
  /** The accessible name — the visible glyph is a plus. */
  label: string;
  /**
   * The venue's own questions for this dish, resolved on the server.
   *
   * Passed down rather than fetched here, because the row is server HTML and
   * this island is the only hydrated part of it: a sheet that asked the API on
   * open would spin on a café's Wi-Fi at the exact moment a guest is deciding.
   * `null` means the catalogue did not answer at all — see `DishSheet`, which
   * treats that differently from a dish that simply asks nothing.
   */
  groups?: React.ComponentProps<typeof DishSheet>['groups'];
  /** The three "ordered together" suggestions the sheet draws under itself. */
  also?: React.ComponentProps<typeof DishSheet>['also'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} — ${dish.name}`}
        className="border-brand-500 text-brand-600 hover:bg-brand-50 grid size-10 flex-none place-items-center rounded-full border text-lg font-semibold"
      >
        +
      </button>

      {open ? (
        <DishSheet
          restaurant={restaurant}
          dish={dish}
          copy={copy}
          groups={groups}
          also={also}
          money={(tiyin) => som(tiyin, locale)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The bar that appears once there is something in the basket.
 *
 * Pinned to the bottom, full width, and absent entirely when the basket is
 * empty — an empty bar reading "0 items · 0 so'm" occupies the thumb zone on a
 * phone and tells nobody anything.
 */
export function CartBar({
  restaurant,
  locale,
  href,
  label,
}: {
  restaurant: string;
  locale: GuestLocale;
  href: string;
  /** `{count}` and `{total}`, filled in here. */
  label: string;
}) {
  const cart = useCart(restaurant);
  const count = cartCount(cart);

  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] p-4">
      <a
        href={href}
        className="bg-acc pointer-events-auto mx-auto flex h-14 max-w-[560px] items-center justify-center gap-3 rounded-full px-6 text-sm font-semibold text-white shadow-lg"
      >
        {label
          .replace('{count}', String(count))
          .replace('{total}', som(cartSubtotal(cart), locale))}
      </a>
    </div>
  );
}

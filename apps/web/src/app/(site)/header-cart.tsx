'use client';

import { cartCount, useCart } from '@/lib/guest-cart';

/**
 * The basket count in the header — `dc.html` header, `cartCount`/`cartHas`.
 *
 * The one client island in an otherwise server-rendered header, and it is a
 * span with a number in it: making the whole bar a client component to show a
 * badge would put the copy catalogue and the branch list into the browser
 * bundle for the sake of one digit.
 *
 * It renders nothing at all until there is something to count. A "0" beside a
 * basket on a restaurant's front page is a control that looks broken.
 */
export function HeaderCart({
  restaurant,
  href,
  label,
}: {
  restaurant: string;
  href: string;
  label: string;
}) {
  const count = cartCount(useCart(restaurant));

  if (count === 0) return null;

  return (
    <a
      href={href}
      aria-label={label}
      className="border-border grid h-10 min-w-10 flex-none place-items-center rounded-md border px-2.5"
    >
      <span className="flex items-center gap-1.5">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.55L20.5 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
        </svg>
        <span data-num className="text-sm font-bold">
          {count}
        </span>
      </span>
    </a>
  );
}

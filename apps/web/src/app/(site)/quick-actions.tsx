import type { GuestCopy } from '@restaurant/surfaces/guest/copy';

/**
 * The four cards under the hero — `dc.html:170-181`, script `:931-936`.
 *
 * Shape only. The words are in the copy catalogue like every other string on
 * this surface, and `key`/`sub` name the entries there so a card cannot drift
 * from its own label.
 *
 * `href` is `null` for the large-order card, which is not a screen this product
 * has: a forty-person banquet is agreed on the telephone, and a button that
 * pretended to take one would put a wedding in a queue nobody in the kitchen
 * reads.
 */
type QuickCopy = GuestCopy['site']['home']['quick'];

export type QuickAction = {
  key: keyof QuickCopy & ('delivery' | 'pickup' | 'book' | 'large');
  sub: keyof QuickCopy;
  /** Relative to `/r/{slug}`, or `null` for the telephone. */
  href: string | null;
  /** One path, drawn at 19px on a 1.75 stroke. */
  icon: string;
};

export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    key: 'delivery',
    sub: 'deliverySub',
    href: '/menu',
    icon: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  },
  {
    key: 'pickup',
    sub: 'pickupSub',
    href: '/menu',
    icon: 'M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4zM4 6h16M16 10a4 4 0 0 1-8 0',
  },
  {
    key: 'book',
    sub: 'bookSub',
    href: '/book',
    icon: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  },
  {
    key: 'large',
    sub: 'largeSub',
    href: null,
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
];

/**
 * The rating star, in `--rating-star` rather than the foreground colour.
 *
 * A filled glyph, not the `★` character: the text star inherits the paragraph's
 * colour and renders at whatever weight the font happens to carry it at, which
 * on the hero line came out as a grey asterisk beside a number.
 */
export function Star({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="var(--rating-star)"
      aria-hidden
      className="flex-none"
    >
      <path d="M12 2.4l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.3l6.6-.9z" />
    </svg>
  );
}

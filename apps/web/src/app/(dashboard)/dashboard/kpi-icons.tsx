import type { ReactNode } from 'react';
import type { Tone } from '@restaurant/ui';

/**
 * The glyphs the design puts in the corner of every KPI card.
 *
 * `Smart Restaurant OS.dc.html:567-595`, `:780-801`, `:933-954`, `:1071-1092`,
 * `:1249-1270`, `:1444-1465` — a 15px stroked icon at 1.85 on a 24×24 box, in a
 * 30px tinted badge. `KpiCard` already draws the badge and binds its hover to
 * `[data-kpiic]`; what was missing was the picture inside it, on every card in
 * the console.
 *
 * The badge is not decoration. Five cards in a row all read as "a label and a
 * big number" and an owner scanning for revenue has to read five labels to find
 * it; a wallet, a receipt and a rising line are found without reading. That is
 * also why the tint is part of the pair here rather than chosen per screen —
 * expenses are warning-tinted on the owner's dashboard and on the accountant's,
 * and a figure that changes colour between two screens is a figure a reader
 * stops trusting.
 *
 * The five dashboards that share a figure share its glyph: revenue is the same
 * wallet for the owner, the waiter and the cashier.
 *
 * Six paths are absent on purpose — the order desk. The design's operator
 * dashboard draws its four figures with no badge at all, because that screen is
 * a queue rather than a summary and the eye should land on the waiting count.
 */

const BOX = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.85,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Money taken. */
export const WalletIcon = (
  <svg {...BOX}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v10A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M16.5 12.5h2" />
  </svg>
);

/** A ticket — orders, closed or open. */
export const ReceiptIcon = (
  <svg {...BOX}>
    <path d="M6 3h12v18l-3-1.8L12 21l-3-1.8L6 21z" />
    <path d="M9 8.5h6M9 12.5h6" />
  </svg>
);

/** Anything divided by anything — the average cheque. */
export const CalculatorIcon = (
  <svg {...BOX}>
    <path d="M5 3h14v18H5z" />
    <path d="M8.5 7.5h7M8.5 12h2M8.5 16h2M14 12h2M14 16h2" />
  </svg>
);

/** A line going up — margin, gross profit. */
export const TrendIcon = (
  <svg {...BOX}>
    <path d="M3 16.5 9 10l4 4 8-8" />
    <path d="M17 6h4v4" />
  </svg>
);

/** Money going out. */
export const OutflowIcon = (
  <svg {...BOX}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
    <path d="M12 8v8M8.5 12.5 12 16l3.5-3.5" />
  </svg>
);

/** Something still open — a bill, a table waiting to pay. */
export const ClockIcon = (
  <svg {...BOX}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
    <path d="M12 7.5v5l3 1.8" />
  </svg>
);

/** How long something is taking, which is not the same as what time it is. */
export const StopwatchIcon = (
  <svg {...BOX}>
    <path d="M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
    <path d="M9.5 2h5M12 10.5v3.5l2.5 1.5" />
  </svg>
);

/** Cancelled, voided, struck out. */
export const VoidIcon = (
  <svg {...BOX}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
    <path d="M15 9l-6 6M9 9l6 6" />
  </svg>
);

/** Something needs attention — a debt, a stock line about to run out. */
export const AlertIcon = (
  <svg {...BOX}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17.5h.01" />
  </svg>
);

/** A date that matters — an expiry. */
export const CalendarIcon = (
  <svg {...BOX}>
    <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M8 3v4M16 3v4M4 10.5h16" />
  </svg>
);

/** Goods arriving. */
export const TruckIcon = (
  <svg {...BOX}>
    <path d="M3 7.5h11v9H3z" />
    <path d="M14 10.5h4l3 3v3h-7M6.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4" />
  </svg>
);

/** Thrown away. */
export const WasteIcon = (
  <svg {...BOX}>
    <path d="M4 7h16" />
    <path d="M7.5 7l1 12.5h7L16.5 7M9.5 7V4h5v3" />
  </svg>
);

/** People at a table — covers, guests. */
export const GuestsIcon = (
  <svg {...BOX}>
    <path d="M16.5 20v-1.8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <path d="M9.75 10.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2M17.5 4a3.6 3.6 0 0 1 0 7" />
  </svg>
);

/** A card through a terminal — payments taken. */
export const CardIcon = (
  <svg {...BOX}>
    <path d="M2.5 7.5A1.5 1.5 0 0 1 4 6h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M2.5 10.5h19" />
  </svg>
);

/** Money going back — a refund. */
export const RefundIcon = (
  <svg {...BOX}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.9-6.4L3 8.5" />
    <path d="M3 3.5v5h5" />
  </svg>
);

/** One card's glyph and the tint behind it, as the design pairs them. */
export type KpiGlyph = { icon: ReactNode; iconTone: Tone };

export const GLYPH = {
  revenue: { icon: WalletIcon, iconTone: 'brand' },
  revenueGood: { icon: WalletIcon, iconTone: 'success' },
  orders: { icon: ReceiptIcon, iconTone: 'accent' },
  average: { icon: CalculatorIcon, iconTone: 'brand' },
  profit: { icon: TrendIcon, iconTone: 'success' },
  expenses: { icon: OutflowIcon, iconTone: 'warning' },
  open: { icon: ClockIcon, iconTone: 'brand' },
  awaiting: { icon: ClockIcon, iconTone: 'warning' },
  wait: { icon: StopwatchIcon, iconTone: 'warning' },
  cancelled: { icon: VoidIcon, iconTone: 'danger' },
  due: { icon: AlertIcon, iconTone: 'danger' },
  lowStock: { icon: AlertIcon, iconTone: 'warning' },
  expiring: { icon: CalendarIcon, iconTone: 'warning' },
  deliveries: { icon: TruckIcon, iconTone: 'brand' },
  waste: { icon: WasteIcon, iconTone: 'danger' },
  guests: { icon: GuestsIcon, iconTone: 'brand' },
  payments: { icon: CardIcon, iconTone: 'brand' },
  refunds: { icon: RefundIcon, iconTone: 'danger' },
} as const satisfies Record<string, KpiGlyph>;

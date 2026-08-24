'use client';

import { useOrdered } from './purchase-store';

/**
 * The open-purchase count, which grows as orders are placed.
 *
 * `ivPoCount: 8 + (S.ivPo || []).length` in the design. The base comes from the
 * server with the rest of the summary; the addition is what happened on this
 * screen. Only the number is a client component — the card around it, its label
 * and the other three figures stay server-rendered.
 */
export function OpenPurchases({ base }: { base: number }) {
  return <>{base + useOrdered().length}</>;
}

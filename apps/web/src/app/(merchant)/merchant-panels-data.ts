/**
 * The performance panel's shapes: bar widths and tones.
 *
 * Everything that is not a word and not a record — index-aligned with
 * `merchantCopy().performance`, `.funnel`, `.stars` and `.penalties`.
 *
 * It used to carry settlement, dispute and promotion structure too. Those views
 * now read real records from `merchant-data.ts` — amounts in tiyin, states, ids
 * — and a parallel array of tones indexed against them was one renumbering away
 * from painting the wrong row red.
 */

export type MerchantTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export const M_PERFORMANCE: readonly { width: string; tone: MerchantTone }[] = [
  { width: '84%', tone: 'brand' },
  { width: '72%', tone: 'brand' },
  { width: '62%', tone: 'success' },
  { width: '38%', tone: 'warning' },
];

/** The four funnel steps, as bar widths. */
export const M_FUNNEL: readonly { width: string }[] = [
  { width: '100%' },
  { width: '37%' },
  { width: '10%' },
  { width: '6%' },
];

export const M_STARS: readonly { width: string }[] = [
  { width: '78%' },
  { width: '14%' },
  { width: '5%' },
  { width: '2%' },
  { width: '1%' },
];

/** Each SLA penalty rule, and whether this store is inside it. */
export const M_PENALTIES: readonly { tone: MerchantTone }[] = [
  { tone: 'success' },
  { tone: 'success' },
  { tone: 'warning' },
  { tone: 'success' },
];

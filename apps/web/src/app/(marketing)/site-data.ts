import type { Messages } from '@/i18n';

/**
 * The public site's figures, ids and proper nouns.
 *
 * Everything here reads the same in Uzbek, Russian and English — a price, a
 * card number, a person's initials — so none of it belongs in a message
 * catalogue, where it would sit in three files at once waiting for two of them
 * to fall behind. The catalogue holds the prose, keyed by the ids below.
 *
 * The figures are the design's own. They are static on purpose: a marketing
 * page that queried the production database on every render would be both
 * slower and a small information leak.
 */

type Marketing = Messages['marketing'];

export const STATS: readonly { key: keyof Marketing['stats']; value: string }[] = [
  { key: 'restaurants', value: '42' },
  { key: 'branches', value: '118' },
  { key: 'uptime', value: '99.98%' },
  { key: 'response', value: '142 ms' },
];

export const FEATURES: readonly { key: keyof Marketing['product']['items']; number: string }[] = [
  { key: 'floor', number: '01' },
  { key: 'kitchen', number: '02' },
  { key: 'till', number: '03' },
  { key: 'stock', number: '04' },
  { key: 'finance', number: '05' },
  { key: 'multiBranch', number: '06' },
];

export const ROLES: readonly { key: keyof Marketing['roles']['items']; initials: string }[] = [
  { key: 'waiter', initials: 'OF' },
  { key: 'cashier', initials: 'KS' },
  { key: 'chef', initials: 'OS' },
  { key: 'storekeeper', initials: 'OM' },
  { key: 'manager', initials: 'MN' },
  { key: 'accountant', initials: 'BX' },
  { key: 'owner', initials: 'EG' },
];

export const COMPLIANCE: readonly (keyof Marketing['compliance']['items'])[] = [
  'fiscal',
  'einvoice',
  'vat',
  'export1c',
];

export type Plan = {
  key: keyof Marketing['pricing']['plans'];
  /** The plan's own name — a brand, not a translation. */
  name: string;
  /**
   * Monthly price in tiyin, or null when it is negotiated.
   *
   * An integer rather than a formatted string so the grouping follows the
   * reader's language, and because money is tiyin everywhere else on this
   * platform — a price typed out as "2 400 000" is a price nobody can compute
   * with.
   */
  priceTiyin: number | null;
  highlighted: boolean;
};

export const PLANS: readonly Plan[] = [
  { key: 'start', name: 'Start', priceTiyin: 240_000_000, highlighted: false },
  { key: 'growth', name: 'Growth', priceTiyin: 690_000_000, highlighted: true },
  { key: 'enterprise', name: 'Enterprise', priceTiyin: null, highlighted: false },
];

export const QUOTES: readonly {
  key: keyof Marketing['quotes']['items'];
  initials: string;
  name: string;
}[] = [
  { key: 'rustam', initials: 'RK', name: 'Rustam Kamolov' },
  { key: 'kamola', initials: 'KY', name: 'Kamola Yusupova' },
  { key: 'shahzod', initials: 'SE', name: 'Shahzod Ergashev' },
];

export const FAQ: readonly (keyof Marketing['faq']['items'])[] = [
  'setup',
  'offline',
  'hardware',
  'migration',
  'training',
  'security',
];

export const DOORS: readonly { key: keyof Marketing['signin']['doors']; number: string }[] = [
  { key: 'owner', number: '01' },
  { key: 'floor', number: '02' },
  { key: 'operator', number: '03' },
];

/**
 * The dashboard still in the hero.
 *
 * Bar heights are in px, straight from the design — a percentage would resolve
 * against a parent with no resolved height and collapse the chart to nothing.
 */
export const MOCK_BARS = [28, 33, 30, 38, 36, 43, 47, 44, 53, 56, 61, 74] as const;

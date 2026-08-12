import type { Messages } from '@/i18n';

/**
 * Known guests, as the design's screen shows them.
 *
 * Money is integer tiyin. The average order and the visit frequency are not
 * stored — both are computed from spend and visits, and a stored average is an
 * average that disagrees with its own inputs the first time a bill is voided.
 *
 * TODO(api): GET /api/v1/crm/customers — the list, and the selected guest's
 * order history from Orders.
 */

type Customers = Messages['console']['customers'];

export type CustomerRow = {
  id: string;
  /** A guest's name is theirs; it is not translated. */
  name: string;
  phone: string;
  segment: keyof Pick<Customers, 'segRegular' | 'segCorporate' | 'segOccasional' | 'segAtRisk'>;
  tier: keyof Pick<Customers, 'tierGold' | 'tierPlatinum' | 'tierSilver' | 'tierBronze'>;
  visits: number;
  /** Lifetime, in tiyin. */
  spend: number;
  lastVisit: keyof Pick<
    Customers,
    'lastThreeDays' | 'lastYesterday' | 'lastTwoWeeks' | 'lastToday' | 'lastFiveWeeks' | 'lastWeek'
  >;
  /** What the floor should know before they sit down. */
  note: keyof Pick<
    Customers,
    'noteKamola' | 'noteRustam' | 'noteNilufar' | 'noteOtabek' | 'noteZilola' | 'noteSherzod'
  >;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const CUSTOMERS: readonly CustomerRow[] = [
  {
    id: 'kamola',
    name: 'Kamola Ergasheva',
    phone: '+998 90 311 22 40',
    segment: 'segRegular',
    tier: 'tierGold',
    visits: 34,
    spend: som(4_820_000),
    lastVisit: 'lastThreeDays',
    note: 'noteKamola',
  },
  {
    id: 'rustam',
    name: 'Rustam Kamolov',
    phone: '+998 93 774 10 05',
    segment: 'segCorporate',
    tier: 'tierPlatinum',
    visits: 21,
    spend: som(8_140_000),
    lastVisit: 'lastYesterday',
    note: 'noteRustam',
  },
  {
    id: 'nilufar',
    name: 'Nilufar Yusupova',
    phone: '+998 91 208 66 71',
    segment: 'segOccasional',
    tier: 'tierSilver',
    visits: 12,
    spend: som(1_460_000),
    lastVisit: 'lastTwoWeeks',
    note: 'noteNilufar',
  },
  {
    id: 'otabek',
    name: 'Otabek Sultonov',
    phone: '+998 97 450 39 18',
    segment: 'segRegular',
    tier: 'tierGold',
    visits: 48,
    spend: som(6_210_000),
    lastVisit: 'lastToday',
    note: 'noteOtabek',
  },
  {
    id: 'zilola',
    name: 'Zilola Abdullaeva',
    phone: '+998 90 662 74 03',
    segment: 'segAtRisk',
    tier: 'tierBronze',
    visits: 6,
    spend: som(540_000),
    lastVisit: 'lastFiveWeeks',
    note: 'noteZilola',
  },
  {
    id: 'sherzod',
    name: 'Sherzod Tursunov',
    phone: '+998 94 118 25 90',
    segment: 'segRegular',
    tier: 'tierGold',
    visits: 29,
    spend: som(3_980_000),
    lastVisit: 'lastWeek',
    note: 'noteSherzod',
  },
];

/** The selected guest's last four orders. */
export const ORDER_HISTORY = [
  { id: 'A-1284', where: 'hist1', total: som(186_000) },
  { id: 'A-1102', where: 'hist2', total: som(74_000) },
  { id: 'A-0977', where: 'hist3', total: som(242_000) },
  { id: 'A-0841', where: 'hist4', total: som(128_000) },
] as const;

/** What a guest spends per visit — derived, never stored. */
export const averageOrder = (customer: CustomerRow): number =>
  Math.round(customer.spend / customer.visits);

/** Visits per month, over the year the figures cover. */
export const visitsPerMonth = (customer: CustomerRow): string => (customer.visits / 12).toFixed(1);

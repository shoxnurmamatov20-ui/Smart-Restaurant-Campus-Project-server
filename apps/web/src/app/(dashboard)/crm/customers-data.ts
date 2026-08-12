import { apiGet, type Paginated } from '@/lib/api-server';

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
/**
 * Visits a month, from a lifetime total.
 *
 * Takes the count rather than a row, so it serves a fixture and an API row
 * alike. Twelve is the assumed span — the customer record carries no signup
 * date, so a guest of two months reads as though they had a year.
 * TODO(api): divide by the months since `created_at` once the resource
 * carries it in a form this screen can trust.
 */
export const visitsPerMonth = (customer: { visits: number }): string =>
  (customer.visits / 12).toFixed(1);

// ============ The API seam ============

/**
 * A guest as the screen draws them, with every label already resolved.
 *
 * The fixtures carry catalogue keys — a fixture cannot know a real guest's note
 * — while the API carries the words themselves. So the seam flattens both to
 * plain strings and the screen prints them, rather than the screen knowing
 * which of the two it holds.
 */
export type CustomerScreenRow = {
  id: string;
  name: string;
  phone: string;
  tierLabel: string;
  segmentLabel: string;
  lastVisitLabel: string;
  noteLabel: string;
  visits: number;
  spend: number;
  averageOrder: number;
};

/** `GET /api/v1/crm/customers`, narrowed to what this screen draws. */
type ApiCustomer = {
  id: number;
  name: string;
  phone: string | null;
  tier: string | null;
  visits_count: number;
  total_spent: number;
  average_cheque: number;
  note: string | null;
  allergens: readonly string[] | null;
  is_active: boolean;
};

/** The four loyalty tiers, as the server names them against the catalogue. */
const TIER_KEYS: Readonly<Record<string, CustomerRow['tier']>> = {
  bronze: 'tierBronze',
  silver: 'tierSilver',
  gold: 'tierGold',
  platinum: 'tierPlatinum',
};

/**
 * The guest list for this render.
 *
 * Two of the design's columns have no source on the server and are shown as an
 * em dash rather than guessed at:
 *
 * - **Segment.** "Regular", "corporate", "at risk" are a classification the
 *   business owns, not a fact the database holds. Deriving one from a visit
 *   count would put a label on a guest that the restaurant never agreed to,
 *   and a manager acting on it would be acting on this file's opinion.
 * - **Last visit.** The customer record carries no date of one. It can be had
 *   from the guest's most recent order, and that join belongs on the endpoint —
 *   `GET /crm/customers` should carry `last_visit_at`.
 *
 * An allergy, when there is one, wins over the free-text note: it is the one
 * thing the floor has to read before the guest sits down.
 */
export async function getCustomers(
  t: (key: string) => string,
  em = '—',
): Promise<readonly CustomerScreenRow[]> {
  const customers = await apiGet<Paginated<ApiCustomer>>('/crm/customers?per_page=100');

  if (!customers?.data) {
    return CUSTOMERS.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      tierLabel: t(customer.tier),
      segmentLabel: t(customer.segment),
      lastVisitLabel: t(customer.lastVisit),
      noteLabel: t(customer.note),
      visits: customer.visits,
      spend: customer.spend,
      averageOrder: averageOrder(customer),
    }));
  }

  return customers.data
    .filter((customer) => customer.is_active)
    .map((customer) => {
      const allergens = customer.allergens ?? [];

      return {
        id: String(customer.id),
        name: customer.name,
        phone: customer.phone ?? em,
        tierLabel: customer.tier ? t(TIER_KEYS[customer.tier] ?? 'tierBronze') : em,
        segmentLabel: em,
        lastVisitLabel: em,
        noteLabel:
          allergens.length > 0 ? `${t('allergy')}: ${allergens.join(', ')}` : (customer.note ?? em),
        visits: customer.visits_count,
        spend: customer.total_spent,
        averageOrder: customer.average_cheque,
      };
    });
}

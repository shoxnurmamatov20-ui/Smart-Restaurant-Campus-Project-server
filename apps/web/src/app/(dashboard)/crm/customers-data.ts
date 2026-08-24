import type { Messages } from '@/i18n';

/**
 * Known guests, as the design's screen shows them.
 *
 * Money is integer tiyin. The average order and the visit frequency are not
 * stored — both are computed from spend and visits, and a stored average is an
 * average that disagrees with its own inputs the first time a bill is voided.
 *
 * The live read is next door in `./crm-server.ts`, and **both halves now go
 * through it**. The review queue reads `GET /api/v1/crm/feedbacks`; the guest
 * list reads `GET /api/v1/crm/customers`.
 *
 * The list used to stay on fixtures and this docblock used to say why: the
 * endpoint answered the id, the name, the phone, the tier, the visit count and
 * the lifetime spend, and did not answer `segment` or `lastVisit` — the two
 * things a marketer actually opens this screen for. Both are columns now
 * (`2026_08_22_180000`), written by `crm:segment` overnight and by the listener
 * that hears `orders.paid`.
 *
 * Two fields below carry the seam and are worth reading before changing either.
 * `segment`, `tier` and `lastVisit` are catalogue keys because a fixture has no
 * language of its own; `lastVisitAt` and `noteText` are the live values beside
 * them, and a row that has them wins. A guest's note is their own words and a
 * date is a date — neither could ever have been a key.
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
  /**
   * When they were last in, from the API. ISO, or `null` for never.
   *
   * Absent on a fixture row, which is what makes `lastVisit` above still
   * meaningful: the six catalogue phrases are a demo's idea of "recently", and
   * a real date cannot be one of six phrases. A row that has this wins.
   */
  lastVisitAt?: string | null;
  /** What the floor should know before they sit down. */
  note: keyof Pick<
    Customers,
    'noteKamola' | 'noteRustam' | 'noteNilufar' | 'noteOtabek' | 'noteZilola' | 'noteSherzod'
  >;
  /**
   * The note as somebody actually typed it.
   *
   * An empty string is an answer — this guest has no note — and is drawn as
   * nothing. Only `undefined` falls back to the catalogue, so a live guest can
   * never be given a fixture's sentence about somebody else.
   */
  noteText?: string;
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

/**
 * What a guest spends per visit — derived, never stored.
 *
 * Zero visits is a real row now that the list is live: a guest added at a till
 * who has not eaten yet. Dividing by it drew `Infinity so'm` on the card, which
 * is a worse answer than nothing.
 */
export const averageOrder = (customer: CustomerRow): number =>
  customer.visits > 0 ? Math.round(customer.spend / customer.visits) : 0;

/** Visits per month, over the year the figures cover. */
export const visitsPerMonth = (customer: CustomerRow): string => (customer.visits / 12).toFixed(1);

/**
 * What guests said, as the screen's second table lists it.
 *
 * Wired to `GET /api/v1/crm/feedbacks` — see `./crm-server.ts`. The list below
 * is what the screen draws with no session behind it.
 *
 * The comments are held in one language rather than three, and deliberately:
 * a review is something a guest wrote, not copy the product ships. Translating
 * it would be putting words in their mouth.
 */
export type FeedbackStatus = 'new' | 'in_review' | 'resolved' | 'dismissed';

export type FeedbackRow = {
  id: string;
  /** The guest's name, or `null` for a review left without one. */
  guest: string | null;
  /** One to five. */
  score: number;
  /**
   * What the review is about.
   *
   * The column is free text on the server rather than an enum, so a value the
   * catalogue does not know is shown as it was stored instead of as a missing
   * translation key.
   */
  aspect: string | null;
  comment: string;
  /** ISO timestamp, or `null` if the row somehow carries no date. */
  at: string | null;
  status: FeedbackStatus;
  /** Reaches a manager today, whatever else is in the queue. */
  urgent: boolean;
};

/**
 * The demo reviews.
 *
 * A function rather than a constant because the dates are relative — see
 * purchaseOrderFixture() in suppliers-data.ts for the same reason. The mix is
 * unflattering on purpose: a demo full of fives never shows the screen doing
 * the job it exists for, which is getting one angry guest in front of a manager
 * before they leave the building.
 */
export function feedbackFixture(): readonly FeedbackRow[] {
  return [
    {
      id: 'fb-1',
      guest: 'Aziz Karimov',
      score: 1,
      aspect: 'food',
      comment: "Yong'oqqa allergiyam borligini aytgan edim, salatda yong'oq chiqdi. Bu jiddiy.",
      at: hoursAgo(3),
      status: 'new',
      urgent: true,
    },
    {
      id: 'fb-2',
      guest: 'Malika Sobirova',
      score: 3,
      aspect: 'cleanliness',
      comment: 'Stol ustida oldingi mehmonlardan qolgan izlar bor edi.',
      at: hoursAgo(9),
      status: 'new',
      urgent: false,
    },
    {
      id: 'fb-3',
      guest: 'Dilnoza Yusupova',
      score: 2,
      aspect: 'price',
      comment: 'Xizmat haqi 10% ekanini chek berilgandan keyin bildik.',
      at: hoursAgo(28),
      status: 'in_review',
      urgent: false,
    },
    {
      id: 'fb-4',
      guest: 'Bekzod Tursunov',
      score: 4,
      aspect: 'speed',
      comment: "Taom mazali, lekin 25 daqiqa kutdik. Tushlik payti bo'lsa kerak.",
      at: hoursAgo(52),
      status: 'in_review',
      urgent: false,
    },
    {
      id: 'fb-5',
      guest: 'Dilnoza Yusupova',
      score: 5,
      aspect: 'service',
      comment: 'Ofitsiant juda xushmuomala, hamma narsani tushuntirdi.',
      at: hoursAgo(76),
      status: 'resolved',
      urgent: false,
    },
  ];
}

/** An ISO timestamp so many hours before now. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

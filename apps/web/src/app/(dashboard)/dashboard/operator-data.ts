import { scaleFor, type Period } from './overview-data';

/**
 * The order-intake desk's dashboard.
 *
 * The ninth role's screen, and the one whose numbers are all about speed.
 * Everything else in this console measures money; this measures how long
 * somebody waited on the line before a human said hello, because that is what
 * an intake desk is judged on and what an aggregator penalises.
 *
 * Two of the four panels are diagnostics rather than scores: the hourly load
 * says when to put a second person on the line, and the late list says which
 * promises are already broken. An operator who finds out about a late delivery
 * when the guest calls has lost the argument before it starts.
 *
 * Fixtures. No intake endpoint exists — see `calls/calls-data.ts`, which
 * carries the same caveat and the same channel vocabulary.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type IntakeChannelKey = 'phone' | 'telegram' | 'yandex' | 'uzum' | 'site';

export type ChannelLoad = {
  key: IntakeChannelKey;
  /** Orders taken through this door since the line opened. */
  orders: number;
  /** Their value in tiyin, before commission. */
  revenue: number;
};

export type LateDelivery = {
  order: string;
  /** Channel and branch, already joined — one line under the order number. */
  where: string;
  /** How far past the promise, as `m:ss`. */
  late: string;
  /** Why, in two or three words. */
  reason: 'noCourier' | 'onTheWay';
  severity: 'danger' | 'warning';
};

export type OperatorOverview = {
  greetingName: string;
  /** The desk's own name for where it is answering from, from the session. */
  placeName: string;
  /** False for the design's own desk — see `./figures.ts`. */
  live: boolean;
  /** Orders accepted today, and the day's target — the target is a policy, null live. */
  taken: number | null;
  takenTarget: number | null;
  /**
   * Average time to answer, as `m:ss`. Null on a live desk and the card is not
   * drawn: time to answer lives in a telephony log this platform does not have,
   * and the sample `0:38` with a `−0:07` delta was the figure this whole role
   * is judged on.
   */
  answer: string | null;
  answerTarget: string | null;
  /** Seconds behind the two strings above — the rail needs a number. */
  answerSeconds: number | null;
  answerTargetSeconds: number | null;
  /** Average order value in tiyin, and what it is measured against. */
  averageOrder: number | null;
  averageOrderTarget: number | null;
  declined: number | null;
  declinedLimit: number | null;
  /** Bills still open — what the queue on `/calls` actually holds. */
  queue: number | null;
  channels: readonly ChannelLoad[];
  /** Orders per hour from noon, index 0 = 12:00. */
  hourly: readonly number[];
  late: readonly LateDelivery[];
  /** Today's most-ordered dishes, already ranked. */
  top: readonly { name: string; sold: number }[];
};

const PLACEHOLDER = {
  greetingName: 'Dilnoza',
  placeName: 'Chilonzor',
  live: false,
  queue: 4,
  taken: 84,
  takenTarget: 90,
  answer: '0:38',
  answerTarget: '1:00',
  answerSeconds: 38,
  answerTargetSeconds: 60,
  averageOrder: som(168_000),
  averageOrderTarget: som(160_000),
  declined: 3,
  declinedLimit: 5,

  channels: [
    { key: 'phone', orders: 31, revenue: som(5_100_000) },
    { key: 'telegram', orders: 22, revenue: som(3_900_000) },
    { key: 'yandex', orders: 18, revenue: som(3_400_000) },
    { key: 'uzum', orders: 9, revenue: som(1_600_000) },
    { key: 'site', orders: 4, revenue: som(600_000) },
  ],

  /*
   * Noon to midnight, which is the operator's shift and not the restaurant's
   * day. Twenty hundred is the peak and the screen marks it, because the
   * decision this panel exists for is when a second person joins the line.
   */
  hourly: [4, 6, 5, 7, 9, 12, 15, 11, 8, 5, 3, 2],

  late: [
    {
      order: '#4824',
      where: 'Uzum Tezkor · Sergeli',
      late: '+12:04',
      reason: 'noCourier',
      severity: 'danger',
    },
    {
      order: '#4818',
      where: 'Sayt · Yunusobod',
      late: '+4:30',
      reason: 'onTheWay',
      severity: 'warning',
    },
    {
      order: '#4817',
      where: 'Telegram · Termiz',
      late: '+1:15',
      reason: 'onTheWay',
      severity: 'warning',
    },
  ],

  top: [
    { name: 'Osh', sold: 46 },
    { name: 'Lavash', sold: 38 },
    { name: 'Pizza Margarita', sold: 27 },
    { name: 'Burger', sold: 24 },
    { name: 'Somsa', sold: 19 },
  ],
} satisfies OperatorOverview;

/**
 * The busiest hour, as an index into `hourly`.
 *
 * Computed rather than stored so the marked bar and the caption cannot come
 * apart — a panel that highlights 20:00 while the tallest bar is at 19:00 is a
 * panel nobody trusts again.
 */
export function peakHour(hourly: readonly number[]): number {
  return hourly.reduce((best, value, index) => (value > hourly[best]! ? index : best), 0);
}

/** The hour label for an index. Index 0 is noon. */
export const hourLabel = (index: number): string => `${12 + index}`;

export async function getOperatorOverview(period: Period = 'today'): Promise<OperatorOverview> {
  /*
   * Counts scale; the two averages do not. An operator answering in 38 seconds
   * answers in 38 seconds whether you look at a day or a month, and the target
   * beside it is a policy rather than a total.
   */
  const factor = scaleFor(period);

  if (factor !== 1) {
    return {
      ...PLACEHOLDER,
      taken: Math.round(PLACEHOLDER.taken * factor),
      takenTarget: Math.round(PLACEHOLDER.takenTarget * factor),
      declined: Math.round(PLACEHOLDER.declined * factor),
      declinedLimit: Math.round(PLACEHOLDER.declinedLimit * factor),
      channels: PLACEHOLDER.channels.map((channel) => ({
        ...channel,
        orders: Math.round(channel.orders * factor),
        revenue: Math.round(channel.revenue * factor),
      })),
    };
  }

  return PLACEHOLDER;
}

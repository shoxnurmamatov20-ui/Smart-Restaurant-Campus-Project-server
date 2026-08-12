import type { Messages } from '@/i18n';

/**
 * Loss prevention, as the design's screen shows it.
 *
 * A screen that names people has to be careful with what it implies. The risk
 * figure below is a ranking, not an accusation: it says who to look at first,
 * and every row it is built from — a void, a deletion, a discount — is a normal
 * thing a waiter does many times a day. What makes it useful is the comparison
 * across the shift, not any single number.
 *
 * TODO(api): GET /api/v1/analytics/control — computed server-side from the
 * audit log, because these figures decide whether someone is spoken to.
 */

type Control = Messages['console']['control'];

export type ControlStaffRow = {
  id: string;
  name: string;
  role: keyof Pick<Control, 'roleWaiter' | 'roleCashier' | 'roleManager'>;
  voids: number;
  deleted: number;
  /** Discount given, in tiyin. */
  discount: number;
  /** That discount as a share of what they sold. */
  share: string;
  /** 0–100. Higher means look here first. */
  risk: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const CONTROL_STAFF: readonly ControlStaffRow[] = [
  {
    id: 'jasur',
    name: 'Jasur Toshev',
    role: 'roleWaiter',
    voids: 5,
    deleted: 14,
    discount: som(620_000),
    share: '11.2%',
    risk: 78,
  },
  {
    id: 'dilshod',
    name: 'Dilshod Karimov',
    role: 'roleCashier',
    voids: 3,
    deleted: 6,
    discount: som(240_000),
    share: '4.8%',
    risk: 46,
  },
  {
    id: 'nodira',
    name: 'Nodira Ismoilova',
    role: 'roleWaiter',
    voids: 1,
    deleted: 3,
    discount: som(180_000),
    share: '3.1%',
    risk: 24,
  },
  {
    id: 'sardor',
    name: 'Sardor Aliyev',
    role: 'roleWaiter',
    voids: 2,
    deleted: 4,
    discount: som(140_000),
    share: '2.6%',
    risk: 20,
  },
  {
    id: 'aziza',
    name: 'Aziza Rasulova',
    role: 'roleManager',
    voids: 1,
    deleted: 1,
    discount: som(60_000),
    share: '1.4%',
    risk: 10,
  },
];

/** How loud an event is: 2 asks for a decision, 0 is a record. */
export type EventLevel = 0 | 1 | 2;

export type ControlEvent = {
  time: string;
  /** A name, or a till when the system itself raised it. */
  who: string | keyof Pick<Control, 'evShiftWho'>;
  what: keyof Pick<Control, 'evDeleted' | 'evVoided' | 'evDiscount' | 'evShiftClosed' | 'evRefund'>;
  where: keyof Pick<
    Control,
    'evDeletedWhere' | 'evVoidedWhere' | 'evDiscountWhere' | 'evShiftWhere' | 'evRefundWhere'
  >;
  amount: number;
  level: EventLevel;
};

export const CONTROL_EVENTS: readonly ControlEvent[] = [
  {
    time: '21:14',
    who: 'Jasur Toshev',
    what: 'evDeleted',
    where: 'evDeletedWhere',
    amount: som(96_000),
    level: 2,
  },
  {
    time: '20:42',
    who: 'Dilshod Karimov',
    what: 'evVoided',
    where: 'evVoidedWhere',
    amount: som(214_000),
    level: 2,
  },
  {
    time: '19:58',
    who: 'Jasur Toshev',
    what: 'evDiscount',
    where: 'evDiscountWhere',
    amount: som(128_000),
    level: 1,
  },
  {
    time: '18:30',
    who: 'evShiftWho',
    what: 'evShiftClosed',
    where: 'evShiftWhere',
    amount: som(32_000),
    level: 1,
  },
  {
    time: '17:05',
    who: 'Nodira Ismoilova',
    what: 'evRefund',
    where: 'evRefundWhere',
    amount: som(42_000),
    level: 0,
  },
];

/** The month's totals, above the tables. */
export const CONTROL_SUMMARY = {
  voids: 12,
  deleted: 28,
  discountsTiyin: som(1_240_000),
  varianceTiyin: som(32_000),
} as const;

/** The design's thresholds: 60 and over is red, 40 and over amber. */
export function riskColour(risk: number): { rail: string; text: string } {
  if (risk >= 60) return { rail: 'var(--danger-600)', text: 'text-danger-700' };
  if (risk >= 40) return { rail: 'var(--warning-600)', text: 'text-warning-700' };

  return { rail: 'var(--success-600)', text: 'text-fg-muted' };
}

export const EVENT_DOT: Record<EventLevel, string> = {
  2: 'bg-danger-500',
  1: 'bg-warning-500',
  0: 'bg-[var(--n-300)]',
};

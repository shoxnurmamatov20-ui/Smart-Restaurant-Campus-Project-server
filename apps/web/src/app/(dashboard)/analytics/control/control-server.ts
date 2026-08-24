import { apiGet } from '@/lib/api-server';

import {
  CONTROL_EVENTS,
  CONTROL_STAFF,
  CONTROL_SUMMARY,
  type ControlStaffRow,
  type EventLevel,
} from './control-data';

/**
 * Loss prevention, from the API.
 *
 * Server half of ./control-data.ts. Everything here is computed server-side and
 * that is not an optimisation: these figures decide whether somebody is spoken
 * to, and a ranking a browser could recompute is a ranking a browser could be
 * made to recompute differently.
 *
 * ---------------------------------------------------------------------------
 * The view model carries labels, not message keys
 *
 * The fixture's rows key their role and their event text off the catalogue
 * (`roleWaiter`, `evVoided`), which works for five invented people. Real rows
 * carry a person's name, a server role name and an audit-log event — none of
 * which a message catalogue contains. So the seam resolves both sides to
 * strings here and the page renders one path.
 *
 * The role is the one exception and stays a key, because the platform really
 * does have a fixed set of them: the server sends `waiter`, `cashier`,
 * `branch-manager`, and `roleOf()` maps those onto the three the design draws.
 * Anything unrecognised reads as a waiter, which is the safe direction — it
 * understates authority rather than implying it.
 */

type ApiControl = {
  summary: {
    voided_bills: number;
    voided_value_tiyin: number;
    cancelled_lines: number;
    cancelled_value_tiyin: number;
    discounts_tiyin: number;
    paid_revenue_tiyin: number;
    variance_tiyin: number;
    shifts_closed: number;
    shifts_with_variance: number;
  };
  staff: {
    user_id: number;
    name: string;
    role: string;
    voided_bills: number;
    cancelled_lines: number;
    discounts_tiyin: number;
    discount_share_percent: number | null;
    risk: number;
  }[];
  events: {
    at: string | null;
    log: string | null;
    event: string | null;
    who: string | null;
    subject_id: number | null;
  }[];
};

export type ControlEventView = {
  id: string;
  time: string;
  who: string;
  what: string;
  where: string;
  amount: number;
  level: EventLevel;
};

/**
 * The four figures above the tables, and what each caption is allowed to say.
 *
 * The counts were live and the captions under them were catalogue sentences —
 * "bu oy · 840 000 so'm" beside a real void count, on the one screen where the
 * money attached to a count is what a manager acts on. Everything the caption
 * needs is now on the response: `LossControl::summary()` publishes the voided
 * bills' value, the paid revenue the discount share divides by, and how many of
 * the window's closed shifts disagreed with their drawer.
 */
export type ControlSummary = {
  voids: number;
  /** Tiyin those voided bills came to. `null` on the fixture console. */
  voidsTiyin: number | null;
  deleted: number;
  deletedTiyin: number | null;
  discountsTiyin: number;
  /** What the window actually sold, so the discount share has a denominator. */
  revenueTiyin: number | null;
  varianceTiyin: number;
  shiftsClosed: number | null;
  shiftsWithVariance: number | null;
};

export type ControlView = {
  /** False when the screen is drawing the design's sample figures. */
  live: boolean;
  summary: ControlSummary;
  staff: readonly (ControlStaffRow & { roleLabel: string })[];
  events: readonly ControlEventView[];
};

/** The three the design draws. Anything else reads as a waiter — see above. */
function roleKeyOf(role: string): 'roleWaiter' | 'roleCashier' | 'roleManager' {
  if (role === 'cashier') return 'roleCashier';
  if (role === 'branch-manager' || role === 'owner') return 'roleManager';

  return 'roleWaiter';
}

/**
 * How loud an audit entry is.
 *
 * Two asks for a decision, one is worth reading, zero is a record. Money
 * leaving without a sale is the only kind that reaches two: a deleted line and
 * a voided bill are both a meal that was made and not paid for, which is the
 * pattern this whole screen exists to surface.
 */
function levelOf(log: string | null, event: string | null): EventLevel {
  if (event === 'deleted') return 2;
  if (log === 'orders.order_item') return 2;
  if (log === 'finance.payment') return 1;

  return 0;
}

/** `21:14` from an ISO timestamp, which is all the design's column shows. */
const clock = (iso: string | null): string => (iso === null ? '—' : iso.slice(11, 16));

export async function getControl(
  t: (key: string) => string,
  period: 'today' | 'week' | 'month' = 'month',
): Promise<ControlView> {
  const answer = await apiGet<{ data?: ApiControl }>(`/analytics/control?period=${period}`);

  if (!answer?.data) return demo(t);

  const { summary, staff, events } = answer.data;

  return {
    live: true,
    summary: {
      voids: summary.voided_bills,
      voidsTiyin: summary.voided_value_tiyin,
      deleted: summary.cancelled_lines,
      deletedTiyin: summary.cancelled_value_tiyin,
      discountsTiyin: summary.discounts_tiyin,
      revenueTiyin: summary.paid_revenue_tiyin,
      varianceTiyin: summary.variance_tiyin,
      shiftsClosed: summary.shifts_closed,
      shiftsWithVariance: summary.shifts_with_variance,
    },
    staff: staff.map((person) => ({
      id: String(person.user_id),
      name: person.name,
      role: roleKeyOf(person.role),
      roleLabel: t(roleKeyOf(person.role)),
      voids: person.voided_bills,
      deleted: person.cancelled_lines,
      discount: person.discounts_tiyin,
      // A dash rather than "0%": a waiter who sold nothing has no discount
      // share, and printing zero would put them at the clean end of a column
      // they are not in.
      share: person.discount_share_percent === null ? '—' : `${person.discount_share_percent}%`,
      risk: person.risk,
    })),
    events: events.map((entry, index) => ({
      id: `${entry.at ?? index}-${index}`,
      time: clock(entry.at),
      who: entry.who ?? t('evShiftWho'),
      // The audit log's own words. Not translated, because the alternative is a
      // message catalogue that has to grow an entry for every event any module
      // will ever log — and the day it falls behind, the loudest rows on this
      // screen render as raw keys.
      what: entry.event ?? '—',
      where: entry.subject_id === null ? (entry.log ?? '—') : `#${entry.subject_id}`,
      // The audit log stores what changed, not what it was worth. A figure
      // inferred from it would be a number nobody could trace to a bill.
      amount: 0,
      level: levelOf(entry.log, entry.event),
    })),
  };
}

/** The design's own month, with every label resolved. */
function demo(t: (key: string) => string): ControlView {
  return {
    live: false,
    summary: {
      voids: CONTROL_SUMMARY.voids,
      voidsTiyin: null,
      deleted: CONTROL_SUMMARY.deleted,
      deletedTiyin: null,
      discountsTiyin: CONTROL_SUMMARY.discountsTiyin,
      revenueTiyin: null,
      varianceTiyin: CONTROL_SUMMARY.varianceTiyin,
      shiftsClosed: null,
      shiftsWithVariance: null,
    },
    staff: CONTROL_STAFF.map((person) => ({ ...person, roleLabel: t(person.role) })),
    events: CONTROL_EVENTS.map((event, index) => ({
      id: `${event.time}-${index}`,
      time: event.time,
      who: event.who === 'evShiftWho' ? t('evShiftWho') : event.who,
      what: t(event.what),
      where: t(event.where),
      amount: event.amount,
      level: event.level,
    })),
  };
}

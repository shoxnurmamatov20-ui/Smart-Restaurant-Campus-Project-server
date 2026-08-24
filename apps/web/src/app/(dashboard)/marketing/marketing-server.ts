import { apiGet, type Paginated } from '@/lib/api-server';

import {
  CAMPAIGNS,
  PROMOTIONS,
  SEGMENTS,
  SMS_SPEND_THIS_MONTH,
  TRIGGERS,
  type Campaign,
  type CampaignState,
  type Promotion,
  type Segment,
  type Trigger,
  type Trilingual,
} from './marketing-data';

/**
 * The marketing screen, from the API.
 *
 * Server half of ./marketing-data.ts — the split every screen follows: types
 * and fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 *
 * Three of the four tabs are live. `marketing-panels.tsx` used to explain what
 * was missing and it was a table each rather than an endpoint each: no
 * `crm.campaigns`, no `crm.promotions`, no `crm.triggers`. All three exist now
 * (`2026_08_22_1801` — `1803`), and the composer's estimate has a server twin so
 * the number on the screen and the number in the record are one arithmetic.
 *
 * The loyalty tab stays on fixtures and says so below: tiers and the points
 * liability are a different question — they are computed over
 * `crm.loyalty_transactions`, which has no reporting endpoint yet.
 */

/** Everything the four tabs draw, and whether any of it is real. */
export type MarketingBoard = {
  segments: readonly Segment[];
  campaigns: readonly Campaign[];
  promotions: readonly Promotion[];
  triggers: readonly Trigger[];
  /** Tiyin. What the gateway has actually charged this month. */
  smsSpend: number;
  live: boolean;
};

/** `GET /api/v1/crm/customers/segments`. */
type ApiSegments = { data: readonly { id: string; count: number }[] };

/** `GET /api/v1/crm/campaigns`. */
type ApiCampaign = {
  id: number;
  name: string;
  segment: string;
  status: string;
  scheduled_for: string | null;
  finished_at: string | null;
  recipients: number;
  redeemed: number;
  revenue_tiyin: number;
  cost_tiyin: number;
  created_at: string | null;
};

/** `GET /api/v1/crm/promotions`. */
type ApiPromotion = {
  id: number;
  name: Record<string, string> | null;
  rule_text: Record<string, string> | null;
  kind: string;
  days: readonly number[];
  starts_minute: number | null;
  ends_minute: number | null;
  channels: readonly string[];
  is_active: boolean;
  used_count: number;
  revenue_tiyin: number;
  margin_percent: number | null;
};

/** `GET /api/v1/crm/triggers`. */
type ApiTrigger = {
  id: number;
  key: string;
  name: Record<string, string> | null;
  rule_text: Record<string, string> | null;
  body: string;
  is_active: boolean;
  audience: number | null;
  sent_this_month: number | null;
  converted_this_month: number | null;
};

const plain = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

/** A jsonb `{uz,ru,en}` column, falling through to whichever language is there. */
function trilingual(value: Record<string, string> | null, fallback = ''): Trilingual {
  const uz = value?.uz ?? value?.ru ?? value?.en ?? fallback;

  return { uz, ru: value?.ru ?? uz, en: value?.en ?? uz };
}

/** The five the composer's picker draws, in the design's order. */
const SEGMENT_NAME: Readonly<Record<string, Trilingual>> = {
  all: { uz: 'Hammasi', ru: 'Все', en: 'Everyone' },
  regular: { uz: 'Doimiy', ru: 'Постоянные', en: 'Regulars' },
  corporate: { uz: 'Korporativ', ru: 'Корпоративные', en: 'Corporate' },
  occasional: { uz: 'Vaqti-vaqti bilan', ru: 'Иногда', en: 'Occasional' },
  at_risk: { uz: "Yo'qolish xavfida", ru: 'Под риском ухода', en: 'At risk' },
};

/**
 * The five states the model defines, folded into the three the design draws.
 *
 * `sending` is drawn as scheduled rather than as sent, and that is the honest
 * side of the fold: a campaign halfway through two thousand messages has not
 * been sent, and a marketer who read "sent" would press send again. `failed`
 * goes to `sent` because it HAS left — the row's own cost and delivered
 * counters are what say it went badly.
 */
const STATE: Readonly<Record<string, CampaignState>> = {
  draft: 'draft',
  scheduled: 'sched',
  sending: 'sched',
  sent: 'sent',
  failed: 'sent',
};

/** `dd.mm`, or an em dash for a draft that has no send date. */
function shortDate(at: string | null): string {
  if (at === null) return '—';

  const when = new Date(at);

  if (Number.isNaN(when.getTime())) return '—';

  return `${String(when.getDate()).padStart(2, '0')}.${String(when.getMonth() + 1).padStart(2, '0')}`;
}

export async function getMarketing(): Promise<MarketingBoard> {
  const [segments, campaigns, promotions, triggers] = await Promise.all([
    apiGet<ApiSegments>('/crm/customers/segments'),
    apiGet<Paginated<ApiCampaign>>('/crm/campaigns?per_page=25'),
    apiGet<Paginated<ApiPromotion>>('/crm/promotions?per_page=25'),
    apiGet<Paginated<ApiTrigger>>('/crm/triggers?per_page=25'),
  ]);

  /*
   * Per block, not all-or-nothing.
   *
   * This used to put the WHOLE screen on fixtures when any one of the four
   * reads failed — including a single 403 for a role holding `crm.view` but not
   * one of the sub-permissions. A live restaurant lost all four tabs to the
   * demo's campaigns, promotions and trigger figures because one endpoint
   * refused, and the only signal was the shell's generic banner.
   *
   * `board-server.ts` and `calls-server.ts` fall back the same way, and the
   * argument that was written here for the coarser version — a real offer next
   * to an invented one on the same page — is answered by the granularity
   * rather than by the fixture: a refused segments read costs the segments
   * panel and nothing else.
   */
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);

  if (!segments?.data && !campaigns?.data && !promotions?.data && !triggers?.data) {
    return {
      segments: SEGMENTS,
      campaigns: CAMPAIGNS,
      promotions: PROMOTIONS,
      triggers: TRIGGERS,
      smsSpend: SMS_SPEND_THIS_MONTH,
      live: false,
    };
  }

  return {
    segments: (segments?.data ?? SEGMENTS_UNANSWERED).map((row): Segment => ({
      id: row.id,
      name: SEGMENT_NAME[row.id] ?? plain(row.id),
      count: row.count,
    })),

    campaigns: (campaigns?.data ?? []).map((row): Campaign => ({
      apiId: row.id,
      name: plain(row.name),
      state: STATE[row.status] ?? 'draft',
      segment: SEGMENT_NAME[row.segment] ?? plain(row.segment),
      date: shortDate(row.scheduled_for ?? row.finished_at ?? row.created_at),
      recipients: row.recipients,
      redeemed: row.redeemed,
      revenue: row.revenue_tiyin,
      cost: row.cost_tiyin,
    })),

    promotions: (promotions?.data ?? []).map((row): Promotion => ({
      apiId: row.id,
      name: trilingual(row.name),
      rule: trilingual(row.rule_text),
      when: plain(whenOf(row)),
      where: plain(whereOf(row)),
      used: row.used_count,
      revenue: row.revenue_tiyin,
      // Zero rather than null: the card colours the figure by band and has no
      // "unknown" band. An offer nobody has used shows 0% and a used count of
      // 0 beside it, which reads correctly together.
      margin: row.margin_percent ?? 0,
      on: row.is_active,
      accent: row.is_active ? 'var(--brand-500)' : 'var(--n-300)',
      /*
       * The warning is a rule, not a stored sentence.
       *
       * The design draws it on the one offer eating full-price sales, and the
       * threshold is the same one the figure is coloured by: below 28 points
       * of margin the strip lights. A stored warning would be a sentence
       * somebody wrote once about a number that has moved since.
       */
      ...(row.is_active && row.margin_percent !== null && row.margin_percent < 28
        ? { warning: marginWarning(row.margin_percent) }
        : {}),
    })),

    triggers: (triggers?.data ?? []).map((row): Trigger => ({
      id: row.key,
      apiId: row.id,
      name: trilingual(row.name, row.key),
      rule: trilingual(row.rule_text),
      message: plain(row.body),
      audience: row.audience ?? 0,
      sent: row.sent_this_month ?? 0,
      converted: row.converted_this_month ?? 0,
      on: row.is_active,
    })),

    /*
     * What the gateway actually charged, this calendar month.
     *
     * Summed from the campaigns on the page rather than from a report endpoint,
     * and that is a real limit worth naming: a restaurant with more than
     * twenty-five campaigns in a month would under-report. It is still the
     * honest number for every restaurant that has ever run one, and it is
     * `cost_tiyin` — what was billed — rather than the estimate.
     */
    smsSpend: (campaigns?.data ?? [])
      .filter((row) => stampedThisMonth(row, month))
      .reduce((sum, row) => sum + row.cost_tiyin, 0),

    live: true,
  };
}

/**
 * What the audience picker shows when the segments read was refused.
 *
 * Empty rather than `SEGMENTS`: the composer prints "reaches N people" beside a
 * cost estimate, and the design's counts there would price a send at somebody
 * else's list size. A picker with nothing in it is a picker that cannot send,
 * which is the correct outcome for a reader whose token could not read the
 * guest list.
 */
const SEGMENTS_UNANSWERED: readonly { id: string; count: number }[] = [];

function stampedThisMonth(row: ApiCampaign, since: Date): boolean {
  const at = row.finished_at ?? row.created_at;

  if (at === null) return false;

  const when = Date.parse(at);

  return !Number.isNaN(when) && when >= since.getTime();
}

/** "Mon–Fri 12:00–15:00", from the two columns that store it. */
function whenOf(row: ApiPromotion): string {
  const clock =
    row.starts_minute === null || row.ends_minute === null
      ? ''
      : ` ${hhmm(row.starts_minute)}–${hhmm(row.ends_minute)}`;

  const days =
    row.days.length === 0 || row.days.length === 7 ? 'Har kuni' : row.days.map(dayName).join(', ');

  return `${days}${clock}`.trim();
}

/** Which channels honour it. Empty means all four, which is what the column's null says. */
function whereOf(row: ApiPromotion): string {
  if (row.channels.length === 0) return 'Barcha kanallar';

  return row.channels.map((channel) => CHANNEL_NAME[channel] ?? channel).join(' · ');
}

const CHANNEL_NAME: Readonly<Record<string, string>> = {
  dine_in: 'Zal',
  takeaway: 'Olib ketish',
  delivery: 'Yetkazish',
  aggregator: 'Agregator',
};

const DAY_NAME = ['', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'] as const;

const dayName = (iso: number): string => DAY_NAME[iso] ?? String(iso);

const hhmm = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** The sentence the amber strip carries, with the offer's own figure in it. */
function marginWarning(margin: number): Trilingual {
  const figure = margin.toFixed(1);

  return {
    uz: `Marja ${figure}% — me'yordan past. Bu aksiya to'liq narxdagi savdoni yeb qo'yayotgan bo'lishi mumkin.`,
    ru: `Маржа ${figure}% — ниже нормы. Акция может съедать продажи по полной цене.`,
    en: `Margin is ${figure}% — below target. This offer may be eating full-price sales.`,
  };
}

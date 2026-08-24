import { apiGet, type Paginated } from '@/lib/api-server';

import {
  CASES,
  CAUSES,
  COST,
  type CaseFact,
  type CaseKind,
  type CaseOutcome,
  type Complaint,
  type Trilingual,
} from './cases-data';

/**
 * The complaints desk, from the API.
 *
 * Server half of ./cases-data.ts — the split every screen follows: types and
 * fixtures in `*-data.ts`, server calls in a sibling only server components
 * import. See tables-server.ts for why.
 *
 * The screen was fixtures until `crm.cases` existed, and `case-actions.tsx`
 * said exactly why: a review is a score and a comment, and a complaint carries
 * five things it does not — the channel it arrived on, the order it disputes,
 * the amount in dispute, which of the four answers was given, and who gave it.
 * All five are columns now.
 *
 * ---------------------------------------------------------------------------
 * Why free text becomes a trilingual triple with the same string in it
 *
 * The row type holds `Trilingual` for the guest's words, the channel and the
 * amount note, because a fixture has no language of its own and the design
 * writes all three in three. A live complaint has exactly one: what somebody
 * typed. `plain()` puts it in all three slots, so `say()` returns it whatever
 * the console is set to — which is right. A guest's own words are evidence and
 * are never translated.
 */

/** `GET /api/v1/crm/cases`. */
type ApiCase = {
  id: number;
  number: string;
  channel: string;
  kind: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_visits: number | null;
  order_number: string | null;
  amount_tiyin: number;
  amount_note: string | null;
  quote: string | null;
  photos: readonly string[];
  status: string;
  assigned_to: string | null;
  is_overdue: boolean;
  outcome: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string | null;
};

/** `GET /api/v1/crm/cases/causes` — the month, in one answer. */
type ApiCauses = {
  data: {
    days: number;
    total: number;
    answer_minutes: number | null;
    kinds: readonly { kind: string; count: number; cost_tiyin: number }[];
    outcomes: readonly { outcome: string; count: number; cost_tiyin: number }[];
  };
};

/** What the desk draws beside the four bars, and what the month cost. */
export type CasesMonth = {
  /** How many complaints in the window. */
  total: number;
  /** Average minutes to an answer, or `null` when nothing has been answered. */
  answerMinutes: number | null;
  causes: typeof CAUSES;
  cost: typeof COST;
  /** Whether any of the above came from the API. */
  live: boolean;
};

const plain = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

/** The five the model defines; anything else is not drawn. */
const KINDS: ReadonlySet<string> = new Set(['late', 'missing', 'wrong', 'quality', 'courier']);

const OUTCOMES: ReadonlySet<string> = new Set(['refunded', 'partly', 'points', 'declined']);

/**
 * The channel, in words a person reads.
 *
 * The column is a machine value and the card prints it as a chip; a chip
 * reading `aggregator` is a chip nobody translates in their head.
 */
const CHANNEL: Readonly<Record<string, Trilingual>> = {
  phone: { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
  web: { uz: 'Sayt', ru: 'Сайт', en: 'Website' },
  bot: { uz: 'Telegram', ru: 'Telegram', en: 'Telegram' },
  table: { uz: 'Stol QR', ru: 'QR стола', en: 'Table QR' },
  aggregator: { uz: 'Agregator', ru: 'Агрегатор', en: 'Aggregator' },
  courier: { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' },
};

const FACT: Readonly<Record<'order' | 'assignee' | 'history' | 'late', Trilingual>> = {
  order: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order' },
  assignee: { uz: 'Mas’ul', ru: 'Ответственный', en: 'Assigned to' },
  history: { uz: 'Mijoz tarixi', ru: 'История гостя', en: 'Guest history' },
  late: { uz: 'Muddat', ru: 'Срок', en: 'Deadline' },
};

const NOBODY: Trilingual = { uz: 'Biriktirilmagan', ru: 'Не назначен', en: 'Unassigned' };
const OVERDUE: Trilingual = { uz: "O'tib ketdi", ru: 'Просрочено', en: 'Overdue' };
const FIRST_TIME: Trilingual = {
  uz: 'Birinchi shikoyat',
  ru: 'Первая жалоба',
  en: 'First complaint',
};
const ANONYMOUS: Trilingual = { uz: 'Anonim', ru: 'Аноним', en: 'Anonymous' };

/**
 * The queue for this render.
 *
 * Oldest first is the API's own default and is not negotiable on this screen:
 * lateness is what makes a complaint expensive, so this morning's grumble does
 * not go above the one that has been waiting since Friday.
 */
export type CaseQueue = {
  rows: readonly Complaint[];
  /** False when these are the design's complaints rather than the restaurant's. */
  live: boolean;
};

export async function getCases(): Promise<CaseQueue> {
  const cases = await apiGet<Paginated<ApiCase>>('/crm/cases?per_page=50');

  /*
   * An empty queue is the answer a restaurant nobody has complained about
   * deserves.
   *
   * `|| cases.data.length === 0` used to fall through to `CASES`, so a venue
   * with no complaints was shown open ones — a guest name, a quoted grievance,
   * an amount and an overdue clock each — and the sidebar badge reinforced it
   * with a red 3. `getCasesMonth()` already handles empty correctly, by
   * zeroing its bars.
   */
  if (!cases?.data) return { rows: CASES, live: false };

  const rows = cases.data
    .filter((row) => KINDS.has(row.kind))
    .map((row): Complaint => ({
      id: row.number,
      apiId: row.id,
      channel: CHANNEL[row.channel] ?? plain(row.channel),
      kind: row.kind as CaseKind,
      who: plain(whoIs(row)),
      amount: row.amount_tiyin,
      amountNote: row.amount_note === null ? plain('') : plain(row.amount_note),
      quote: plain(row.quote ?? ''),
      photos: row.photos.length,
      ago: agoOf(row.created_at),
      facts: factsOf(row),
      ...(row.outcome !== null && OUTCOMES.has(row.outcome)
        ? {
            outcome: row.outcome as CaseOutcome,
            settledBy: settledBy(row),
          }
        : {}),
    }));

  return { rows, live: true };
}

/**
 * The month's figures, from the one endpoint that computes them.
 *
 * A single call rather than four, because the KPI strip and the right-hand
 * column are the same window over the same table — asking four times would
 * report four slightly different months as the clock moved between requests.
 *
 * `live: false` means the fixtures came back, and the screen says so through
 * the shell's degraded strip rather than by drawing anything different.
 */
export async function getCasesMonth(): Promise<CasesMonth> {
  const answer = await apiGet<ApiCauses>('/crm/cases/causes?days=30');

  if (!answer?.data) {
    return { total: 0, answerMinutes: null, causes: CAUSES, cost: COST, live: false };
  }

  const counts = new Map(answer.data.kinds.map((row) => [row.kind, row.count]));

  // The five bars in the design's own order and colours, with live counts. A
  // cause nobody complained about this month is drawn at zero rather than
  // dropped: a bar chart that loses its categories cannot be compared week to
  // week, which is the only thing this panel is for.
  const causes = CAUSES.map((cause) => ({ ...cause, count: counts.get(cause.kind) ?? 0 }));

  const byOutcome = new Map(answer.data.outcomes.map((row) => [row.outcome, row.cost_tiyin]));
  const refunded = (byOutcome.get('refunded') ?? 0) + (byOutcome.get('partly') ?? 0);

  const cost = COST.map((line, index) => ({
    ...line,
    /*
     * Three lines and only two of them can be true.
     *
     * Money refunded and points issued are `outcome_tiyin` grouped by outcome —
     * facts about decisions this desk made. A remade dish is not: nothing on
     * this platform records that a kitchen cooked something twice, so the
     * middle line is zero rather than a number nobody could check. It stays on
     * the panel because the design draws three lines and a restaurant reading
     * "0" learns something true.
     */
    amount: index === 0 ? refunded : index === 2 ? (byOutcome.get('points') ?? 0) : 0,
  }));

  return {
    total: answer.data.total,
    answerMinutes: answer.data.answer_minutes,
    causes,
    cost,
    live: true,
  };
}

/** Name, number and how many times they have been in — or that they are anonymous. */
function whoIs(row: ApiCase): string {
  const parts = [row.guest_name, row.guest_phone].filter(
    (part): part is string => typeof part === 'string' && part !== '',
  );

  if (parts.length === 0) return ANONYMOUS.uz;

  return parts.join(' · ');
}

function factsOf(row: ApiCase): readonly CaseFact[] {
  const facts: CaseFact[] = [];

  if (row.order_number !== null && row.order_number !== '') {
    facts.push({ label: FACT.order, value: plain(row.order_number) });
  }

  facts.push({
    label: FACT.assignee,
    value: row.assigned_to === null ? NOBODY : plain(row.assigned_to),
  });

  facts.push({
    label: FACT.history,
    // Their first complaint is the one worth answering generously; their fourth
    // is the one that says the cause is somewhere else entirely.
    value:
      row.guest_visits === null || row.guest_visits <= 1
        ? FIRST_TIME
        : plain(String(row.guest_visits)),
  });

  // Only when it is the problem. A deadline that has not passed is not a fact
  // anybody needs on the card.
  if (row.is_overdue) {
    facts.push({ label: FACT.late, value: OVERDUE, tone: 'danger' });
  }

  return facts;
}

/**
 * How long ago, in words.
 *
 * Phrased here rather than in the page because the row type says so — "relative
 * time is a render concern" — and this is the render's server half. Minutes up
 * to an hour, then hours, then days: the queue is worked within a shift, and a
 * complaint measured in weeks has already failed whatever this screen is for.
 */
function agoOf(at: string | null): Trilingual {
  if (at === null) return plain('—');

  const then = Date.parse(at);

  if (Number.isNaN(then)) return plain('—');

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));

  if (minutes < 60) {
    return { uz: `${minutes} daqiqa oldin`, ru: `${minutes} мин назад`, en: `${minutes} min ago` };
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return { uz: `${hours} soat oldin`, ru: `${hours} ч назад`, en: `${hours} h ago` };
  }

  const days = Math.round(hours / 24);

  return { uz: `${days} kun oldin`, ru: `${days} дн назад`, en: `${days} d ago` };
}

/** "Settled by X · 11:24" — the sentence the card draws on an answered case. */
function settledBy(row: ApiCase): string {
  const at = row.decided_at === null ? null : new Date(row.decided_at);
  const clock =
    at === null || Number.isNaN(at.getTime())
      ? ''
      : ` · ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

  return `${row.decided_by ?? '—'}${clock}`;
}

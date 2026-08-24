import { formatTiyinAmount } from '@restaurant/utils';

import { heading, type Align, type Lang, type PeriodKey, type ReportId } from './reports-data';

/**
 * The five report viewers, from the API.
 *
 * Client-side rather than a `*-server.ts` in the usual sense, and the period
 * buttons are why: the viewer holds which report is open and which window is
 * chosen in local state, so the fetch has to happen after a click. It goes
 * through this app's own route handler (`/api/analytics/reports`) because the
 * session token lives in an httpOnly cookie only Node can read — the same
 * arrangement every other live console action uses.
 *
 * ---------------------------------------------------------------------------
 * The API answers one shape for all five, and that is the point
 *
 * `{columns, rows, totals}` with a type on every column. It is what lets the
 * CSV export be written once — `POST /api/v1/reports/export` produces exactly
 * what the screen shows, from the same query — and it is what stops a report
 * and its file disagreeing, which is the disagreement that is always found by
 * the person who trusted the file.
 *
 * `stock` answers `available: false` with a reason: it needs Inventory, and
 * Analytics is permitted to read Menu, Orders and Finance only. The viewer keeps
 * the design's sample rows for that one and the reason is worth surfacing rather
 * than hiding behind an empty table.
 *
 * Nine kinds now rather than five. The Z pack, sales by item, the VAT pack and
 * the branch comparison were four of the six cards that used to flash "building
 * · it will be emailed to you" and queue nothing; they answer the same
 * `{columns, rows, totals}` shape, which is what makes the CSV export work for
 * them without a line of new code.
 */

/** The kinds the API knows. The design's fifth card is `cash`; the API calls it `cashflow`. */
const KIND: Record<ReportId, string> = {
  waiters: 'waiters',
  dishes: 'dishes',
  voids: 'voids',
  stock: 'stock',
  labour: 'labour',
  cash: 'cashflow',
  // The four the API learned later. Their ids and their kinds are the same word
  // — the mismatch above is a historical one, and repeating it would be a
  // second place for a card to ask for a report that does not exist.
  zreport: 'zreport',
  items: 'items',
  vat: 'vat',
  branches: 'branches',
};

/** The viewer's periods, mapped onto the three windows the API answers. */
const WINDOW: Record<PeriodKey, string> = {
  today: 'today',
  week: 'week',
  month: 'month',
  // A quarter is not a window this module computes: every figure is scoped by
  // `business_date` against a fixed ladder of one, seven and thirty days.
  // Asking for a month is the honest nearest answer, and the button stays
  // because the design draws four.
  quarter: 'month',
};

/**
 * What `POST /api/v1/reports/export` needs to name this table.
 *
 * The same two words the viewer already resolved for its own fetch, exported so
 * the export dialog cannot pick a third spelling. It matters more than it looks:
 * the design's fifth card is `cash` and the API calls that report `cashflow`,
 * and a file requested under the wrong name is not a wrong file — it is a 400
 * on the one button whose whole job is to produce something.
 */
export function exportTarget(id: ReportId, period: PeriodKey): { kind: string; period: string } {
  return { kind: KIND[id], period: WINDOW[period] };
}

type ApiColumn = { key: string; type: 'text' | 'count' | 'money' | 'percent' | 'datetime' };

type ApiReport = {
  kind: string;
  available: boolean;
  reason?: string;
  columns: ApiColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number>;
};

export type LiveReport = {
  head: { label: string; align: Align }[];
  /** Already formatted for display, in the reader's language. */
  rows: string[][];
  /** The footer row, or null when the table has no numeric column. */
  totals: string[] | null;
  /** The design's grid template, derived from the column count. */
  columns: string;
  minWidth: string;
};

function cell(value: string | number | null, type: ApiColumn['type'], lang: Lang): string {
  // A dash, not a zero. A margin that could not be computed is not a margin of
  // nothing, and a column of zeros invites an average that means nothing.
  if (value === null || value === undefined) return '—';

  if (type === 'money') return formatTiyinAmount(Number(value), lang);
  if (type === 'percent') return `${value}%`;
  // `2026-08-21 19:44:02` → `19:44`, which is all the design's column shows.
  if (type === 'datetime') return String(value).slice(11, 16);

  return String(value);
}

/**
 * Fetch one report for one window.
 *
 * Returns null for every failure — no session, a role without
 * `analytics.view`, an API mid-restart — and the viewer keeps the design's own
 * sample rows. A console that showed an error page because a report endpoint
 * was slow would be worse than one showing a demo table with a banner over it.
 */
export async function fetchReport(
  id: ReportId,
  period: PeriodKey,
  lang: Lang,
  signal?: AbortSignal,
): Promise<LiveReport | null> {
  let answer: { data?: ApiReport } | null = null;

  try {
    const response = await fetch(
      `/api/analytics/reports?kind=${KIND[id]}&period=${WINDOW[period]}`,
      { signal, cache: 'no-store' },
    );

    if (!response.ok) return null;

    answer = (await response.json()) as { data?: ApiReport };
  } catch {
    return null;
  }

  const report = answer?.data;

  if (!report || report.available !== true || report.columns.length === 0) return null;

  const numeric = new Set(['count', 'money', 'percent']);

  return {
    head: report.columns.map((column) => ({
      label: heading(column.key, lang),
      align: numeric.has(column.type) ? 'right' : 'left',
    })),
    rows: report.rows.map((row) =>
      report.columns.map((column) => cell(row[column.key] ?? null, column.type, lang)),
    ),
    totals:
      Object.keys(report.totals).length === 0
        ? null
        : report.columns.map((column, index) =>
            index === 0
              ? 'Σ'
              : column.key in report.totals
                ? cell(report.totals[column.key] ?? null, column.type, lang)
                : '',
          ),
    /*
     * The grid, derived rather than declared.
     *
     * The design writes a template per report because it knows its own columns;
     * a live table's column count depends on the report, so the first column
     * takes the slack and the rest are fixed. `minmax(0,…)` on the first is what
     * stops a long dish name pushing the numeric columns off the card.
     */
    columns: `minmax(160px,1.4fr) ${report.columns
      .slice(1)
      .map(() => '110px')
      .join(' ')}`,
    minWidth: `${160 + (report.columns.length - 1) * 110 + 60}px`,
  };
}

/* ============================================================
   The builder and the schedule sheet
   ============================================================ */

/**
 * Which of the design's column chips the projection can actually answer.
 *
 * Index-aligned with `BUILDER_COLUMNS`, and by position rather than by label
 * for the reason `POLICY_PATHS` gives on the settings screen: the catalogue and
 * the fixture already pair by index, and keying by label would key by a
 * sentence that changes with the reader's language.
 *
 * A `null` is a column `analytics.daily_facts` does not hold, and the chip is
 * drawn but not selectable when the screen is live. The projection is one row
 * per venue per trading day — see `CustomReports` for why it is the only table
 * this builder may read — so it can group a business by day, week, month or
 * venue and cannot group it by dish or by employee. Six chips fall on the wrong
 * side of that line, and saying which is more useful than quietly returning a
 * column of dashes.
 */
export const BUILDER_KEYS: Readonly<Record<string, readonly (string | null)[]>> = {
  // Sana · Filial · Kanal · Buyurtma · Tushum · O'rtacha chek · Chegirma
  sales: ['date', 'branch', null, 'orders', 'revenue', 'average_cheque', 'discounts'],
  // Sana · Filial · Tushum · Xarajat · Yalpi foyda · QQS · Sof foyda
  fin: ['date', 'branch', 'revenue', 'expenses', 'gross_profit', null, 'net_profit'],
  // Sana · Mahsulot · Boshlang'ich · Kirim · Chiqim · Chiqindi · Qoldiq
  stock: ['date', null, null, null, 'cogs', 'waste', null],
  // Xodim · Rol · Smena · Soat · Sotuv · Choypuli · Mehnat %
  staff: ['date', null, null, null, 'revenue', null, 'labour_percent'],
};

/** Headings for the builder's own columns, in the reader's language. */
const BUILT_HEADINGS: Record<string, Record<Lang, string>> = {
  date: { uz: 'Sana', ru: 'Дата', en: 'Date' },
  branch: { uz: 'Filial', ru: 'Филиал', en: 'Branch' },
  orders: { uz: 'Buyurtma', ru: 'Заказы', en: 'Orders' },
  guests: { uz: 'Mehmon', ru: 'Гости', en: 'Guests' },
  revenue: { uz: 'Tushum', ru: 'Выручка', en: 'Revenue' },
  takings: { uz: 'Kassa', ru: 'Касса', en: 'Takings' },
  average_cheque: { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Avg ticket' },
  discounts: { uz: 'Chegirma', ru: 'Скидки', en: 'Discounts' },
  expenses: { uz: 'Xarajat', ru: 'Расходы', en: 'Expenses' },
  cogs: { uz: 'Tannarx', ru: 'Себестоимость', en: 'Cost' },
  waste: { uz: 'Chiqindi', ru: 'Списание', en: 'Waste' },
  labour: { uz: 'Mehnat', ru: 'ФОТ', en: 'Labour' },
  gross_profit: { uz: 'Yalpi foyda', ru: 'Валовая прибыль', en: 'Gross profit' },
  net_profit: { uz: 'Sof foyda', ru: 'Чистая прибыль', en: 'Net profit' },
  food_cost_percent: { uz: 'Food cost', ru: 'Food cost', en: 'Food cost' },
  waste_percent: { uz: 'Chiqindi %', ru: 'Списание %', en: 'Waste %' },
  labour_percent: { uz: 'Mehnat %', ru: 'ФОТ %', en: 'Labour %' },
};

/**
 * What the server said the projection cannot answer, in the reader's language.
 *
 * Here rather than in the i18n catalogue because it is a sentence about this
 * one table's grain, shown in a `title` on a disabled chip — not console
 * chrome, and not something a translator would ever be asked to keep in step
 * with a database schema.
 */
export const UNSUPPORTED_COLUMN: Record<Lang, string> = {
  uz: "Kunlik yig'ma jadvalda bu ustun yo'q",
  ru: 'В дневной сводке такого столбца нет',
  en: 'The daily roll-up has no such column',
};

export type BuiltReport = LiveReport & { rowCount: number };

/**
 * Run a built report once.
 *
 * The same `{columns, rows, totals}` envelope the five fixed reports answer,
 * which is what lets the viewer and the CSV writer be reused unchanged — and
 * is the reason `CustomReports` was written to speak it rather than inventing
 * a second shape.
 */
export async function runCustomReport(
  base: string,
  columns: readonly string[],
  groupBy: string,
  period: PeriodKey,
  lang: Lang,
): Promise<BuiltReport | null> {
  let answer: { data?: ApiReport } | null = null;

  try {
    const response = await fetch('/api/analytics/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base, columns, groupBy, period: WINDOW[period] }),
    });

    if (!response.ok) return null;

    answer = (await response.json()) as { data?: ApiReport };
  } catch {
    return null;
  }

  const report = answer?.data;

  if (!report || report.columns.length === 0) return null;

  const numeric = new Set(['count', 'money', 'percent']);

  return {
    rowCount: report.rows.length,
    head: report.columns.map((column) => ({
      label: BUILT_HEADINGS[column.key]?.[lang] ?? heading(column.key, lang),
      align: numeric.has(column.type) ? 'right' : 'left',
    })),
    rows: report.rows.map((row) =>
      report.columns.map((column) => cell(row[column.key] ?? null, column.type, lang)),
    ),
    totals:
      Object.keys(report.totals).length === 0
        ? null
        : report.columns.map((column, index) =>
            index === 0
              ? 'Σ'
              : column.key in report.totals
                ? cell(report.totals[column.key] ?? null, column.type, lang)
                : '',
          ),
    columns: `minmax(160px,1.4fr) ${report.columns
      .slice(1)
      .map(() => '110px')
      .join(' ')}`,
    minWidth: `${160 + (report.columns.length - 1) * 110 + 60}px`,
  };
}

/** One destination on a schedule: a channel and an address. */
export type Destination = { channel: 'mail' | 'telegram'; target: string };

/**
 * Save a schedule.
 *
 * Answers the API's own sentence on a refusal rather than a boolean, because
 * the two refusals a person actually hits — an address that is not an address,
 * and a role without `reports.export` — are both things the API explains in the
 * reader's language and the dialog should simply show.
 */
export async function saveSchedule(input: {
  kind: string;
  period: PeriodKey;
  frequency: string;
  lang: Lang;
  destinations: readonly Destination[];
  definition?: { base: string; columns: readonly string[]; group_by: string } | null;
}): Promise<{ ok: true } | { ok: false; message: string | null }> {
  let response: Response;

  try {
    response = await fetch('/api/analytics/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        period: WINDOW[input.period],
        frequency: input.frequency,
        destinations: input.destinations,
        definition: input.definition ?? null,
      }),
    });
  } catch {
    return { ok: false, message: null };
  }

  if (response.ok) return { ok: true };

  try {
    const body = (await response.json()) as {
      error?: { message_uz?: string; message_ru?: string; message_en?: string };
    };

    const sentence = {
      uz: body.error?.message_uz,
      ru: body.error?.message_ru,
      en: body.error?.message_en,
    }[input.lang];

    return { ok: false, message: sentence ?? null };
  } catch {
    return { ok: false, message: null };
  }
}

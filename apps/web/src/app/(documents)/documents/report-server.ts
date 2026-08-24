import {
  heading,
  REPORT_CARDS,
  say,
  type ReportId,
} from '@/app/(dashboard)/analytics/reports/reports-data';
import { apiGet } from '@/lib/api-server';

import { money } from './documents-data';

/**
 * One standard report, as the sheet a manager prints.
 *
 * Its own module rather than a case inside `documents-server.ts`, for the same
 * reason `settlement-server.ts` is: the seven documents that file loads are a
 * restaurant's own statutory paper — a Z report, a payslip, a count sheet —
 * each with a fixed shape the tax office or the labour code settled. A standard
 * report has no fixed shape at all. Its columns come down from the API per
 * report, and the sheet draws whatever arrives.
 *
 * ---------------------------------------------------------------------------
 * Why there is a printable sheet at all
 *
 * The export dialog draws PDF as one of the design's four formats and there is
 * no PDF renderer on this platform — no headless browser, no PDF library, and
 * none being built. What there *is* is a surface whose entire job is putting a
 * table on A4 with a print button over it. So PDF is not a file this platform
 * produces; it is this page, and the reader's own browser makes the PDF from it
 * through "save as PDF" in the print dialogue. That is the same button an
 * accountant already uses for the invoice and the P&L.
 *
 * ---------------------------------------------------------------------------
 * Uzbek, whoever pressed the button
 *
 * Like every other sheet on this surface. The reasoning `documents-data.ts`
 * gives for the statutory seven is about jurisdiction, and it does not apply
 * here — but the second half of it does, and it is the half that matters for a
 * report: a printed sheet gets filed, photocopied and argued over, and a report
 * that comes off the printer in a different language depending on who was
 * signed in is two different papers claiming to be the same report. The column
 * names come from `heading()` in `reports-data.ts`, which is the same table the
 * on-screen viewer reads, so the paper and the screen cannot drift apart.
 *
 * ---------------------------------------------------------------------------
 * `null` prints nothing, and never a specimen
 *
 * There are no fixture rows here on purpose. Every other document on this
 * surface falls back to the sheet the design drew, because a specimen Z teaches
 * a cashier what the paper looks like. A specimen REPORT is a page of invented
 * takings under a real restaurant's name and a real date range — printed and
 * left on a desk, nothing on it says it was never true.
 */

/** The five the API answers. The viewer's fifth card is `cash`; the API calls it `cashflow`. */
export type ReportKind = 'waiters' | 'dishes' | 'voids' | 'stock' | 'cashflow';

/** The three windows `GET /analytics/reports/{kind}` computes. */
export type ReportPeriod = 'today' | 'week' | 'month';

const KINDS: readonly ReportKind[] = ['waiters', 'dishes', 'voids', 'stock', 'cashflow'];

const PERIODS: readonly ReportPeriod[] = ['today', 'week', 'month'];

/** Which card names each kind — the one place `cashflow` and `cash` are reconciled. */
const CARD_OF: Readonly<Record<ReportKind, ReportId>> = {
  waiters: 'waiters',
  dishes: 'dishes',
  voids: 'voids',
  stock: 'stock',
  cashflow: 'cash',
};

type ColumnType = 'text' | 'count' | 'money' | 'percent' | 'datetime';

type ApiColumn = { key: string; type: ColumnType };

type ApiReport = {
  kind: string;
  window: { from: string; to: string; period: string };
  available: boolean;
  reason?: string;
  columns: readonly ApiColumn[];
  rows: readonly Record<string, string | number | null>[];
  totals: Readonly<Record<string, number>>;
};

/** One report, already formatted for paper. Nothing below this line is a number. */
export type ReportSheet = {
  /** The report's own name, as the console's card says it. */
  title: string;
  /** `23.07.2026 — 21.08.2026`, which is the API's answer to "which window is a month". */
  window: string;
  columns: readonly { label: string; numeric: boolean }[];
  rows: readonly (readonly string[])[];
  /** The footer, or `null` when the report has nothing to add up. */
  totals: readonly string[] | null;
};

/**
 * `?kind=` and `?period=`, or `null`.
 *
 * `null` is a sheet that says it has no report rather than a request built from
 * a guess — the same rule `settlementIdFrom()` applies to an id, and for the
 * same reason: this page is reached by a link that carries both, so a value it
 * cannot read means the link is wrong and printing the nearest report would be
 * printing a different report under the reader's expectations.
 */
const one = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

export const reportKindFrom = (value: string | string[] | undefined): ReportKind | null =>
  KINDS.find((kind) => kind === one(value)) ?? null;

export const reportPeriodFrom = (value: string | string[] | undefined): ReportPeriod | null =>
  PERIODS.find((period) => period === one(value)) ?? null;

/**
 * `2026-07-23` → `23.07.2026`.
 *
 * Cut out of the string rather than parsed into a `Date`, exactly as
 * `documents-server.ts` does it: the window's ends are plain calendar days, and
 * `new Date('2026-07-23')` read back in a zone behind UTC is the 22nd — a
 * report headed with a day it does not cover.
 */
const dmy = (iso: string | null | undefined): string => {
  if (!iso) return '—';

  const [year, month, day] = iso.slice(0, 10).split('-');

  return day && month && year ? `${day}.${month}.${year}` : '—';
};

/** The report's own name, or the key if a card was ever removed from under it. */
function titleOf(kind: ReportKind): string {
  const card = REPORT_CARDS.find((entry) => entry.id === CARD_OF[kind]);

  return card === undefined ? kind : say(card.name, 'uz');
}

/**
 * One cell, printed.
 *
 * Money keeps the surface's own formatter — `money()` is `formatTiyinAmount`
 * in Uzbek — and wears a real minus sign rather than a hyphen, because a hyphen
 * is narrower than a digit and makes a column of figures ragged. That is the
 * rule `documents-data.ts` set for `signedMoney` and `profit-loss.tsx` prints
 * by.
 */
function cell(value: string | number | null | undefined, type: ColumnType): string {
  // A dash, not a zero. A margin that could not be computed is not a margin of
  // nothing, and a column of zeros invites an average that means nothing.
  if (value === null || value === undefined) return '—';

  if (type === 'money') {
    const tiyin = Number(value);

    return tiyin < 0 ? `−${money(tiyin)}` : money(tiyin);
  }

  if (type === 'percent') return `${value}%`;
  // `2026-08-21 19:44:02` → `19:44`, which is all the on-screen column shows.
  if (type === 'datetime') return String(value).slice(11, 16);

  return String(value);
}

/** Columns whose figures line up on their right edge, like every other sheet here. */
const NUMERIC: ReadonlySet<ColumnType> = new Set<ColumnType>(['count', 'money', 'percent']);

export function sheetFrom(kind: ReportKind, report: ApiReport): ReportSheet | null {
  /*
   * `available: false` is a real answer, not a failure — `stock` needs
   * Inventory and Analytics may read Menu, Orders and Finance only. An empty
   * table under a real heading would read as "nothing was sold", so it prints
   * nothing at all and the page says why.
   */
  if (report.available !== true || report.columns.length === 0) return null;

  const columns = report.columns;

  return {
    title: titleOf(kind),
    window: `${dmy(report.window?.from)} — ${dmy(report.window?.to)}`,
    columns: columns.map((column) => ({
      label: heading(column.key, 'uz'),
      numeric: NUMERIC.has(column.type),
    })),
    rows: report.rows.map((row) => columns.map((column) => cell(row[column.key], column.type))),
    /*
     * A footer only where there is one. A report of text columns — a list of
     * voids and their reasons — has nothing to add up, and a row of dashes
     * under it reads as a total somebody failed to compute.
     */
    totals:
      Object.keys(report.totals ?? {}).length === 0
        ? null
        : columns.map((column, index) =>
            index === 0
              ? 'JAMI'
              : column.key in report.totals
                ? cell(report.totals[column.key], column.type)
                : '',
          ),
  };
}

/**
 * Load one report for one window, or `null`.
 *
 * The read goes out on the reader's own console token, so the API is the last
 * of three guards rather than something this module re-implements:
 * `middleware.ts` decides who reaches the surface, `REPORT_ACCESS` in
 * `documents-access.ts` decides who may ask for a report at all, and
 * `analytics.view` upstream decides whether this person may read this
 * restaurant's takings. A cashier who edited `?d=` gets a 403 and therefore
 * `null`.
 */
export async function loadReport(
  kind: ReportKind,
  period: ReportPeriod,
): Promise<ReportSheet | null> {
  const answer = await apiGet<{ data: ApiReport }>(`/analytics/reports/${kind}?period=${period}`);

  return answer?.data === undefined ? null : sheetFrom(kind, answer.data);
}

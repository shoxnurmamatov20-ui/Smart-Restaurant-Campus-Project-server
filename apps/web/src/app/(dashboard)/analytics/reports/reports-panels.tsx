'use client';

import { useEffect, useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { ExportDialog } from '../../export-dialog';

import {
  BUILDER_BASES,
  BUILDER_COLUMNS,
  BUILDER_GROUPS,
  BUILDER_ROWS,
  PERIODS,
  REPORTS_COPY,
  REPORTS_UI,
  REPORT_CARDS,
  REPORT_DEFINITIONS,
  say,
  SCHEDULE_DESTINATIONS,
  SCHEDULE_FREQUENCIES,
  type BuilderBase,
  type BuilderGroup,
  type Cell,
  type Lang,
  type PeriodKey,
  type ReportId,
  type Trilingual,
} from './reports-data';
import {
  BUILDER_KEYS,
  exportTarget,
  fetchReport,
  runCustomReport,
  saveSchedule,
  UNSUPPORTED_COLUMN,
  type BuiltReport,
  type Destination,
  type LiveReport,
} from './reports-server';

/**
 * The reports list, the viewer behind five of the cards, and the two dialogs.
 *
 * `Smart Restaurant OS.dc.html:3367-3449` and `:7974-8060`. A client island
 * because all four states are local: which report is open, which period it is
 * showing, and which dialog is up.
 *
 * The five cards with a viewer behind them read live — `fetchReport()` against
 * `GET /api/v1/analytics/reports/{kind}` — and export the server's own CSV
 * through the shared dialog.
 *
 * The builder and the schedule sheet now write as well. The builder runs
 * against `POST /analytics/reports/custom`, which is a whitelist over
 * `analytics.daily_facts` rather than a passthrough — the projection is one row
 * per venue per trading day, so six of the design's column chips are drawn and
 * not selectable and say why on hover. The schedule sheet saves through
 * `POST /analytics/schedules`, and `analytics:send-scheduled` delivers.
 *
 * What still only confirms is the other six cards and their schedules: the
 * design describes eleven reports and the platform computes five, so
 * scheduling one of the six would create a job that builds nothing every
 * Monday. `reportId === null` is that case, and it keeps the design's own
 * behaviour rather than inventing a report to fill it.
 */

const CARD = 'bg-surface rounded-lg border';

/** Copy is already trilingual or already a string; both reach the page. */
function text(value: Trilingual | string | undefined, lang: Lang): string {
  if (value === undefined) return '';

  return typeof value === 'string' ? value : say(value, lang);
}

function cellText(cell: Cell, lang: Lang): string {
  if (cell.tiyin !== undefined) {
    return `${cell.prefix ?? ''}${formatTiyinAmount(cell.tiyin, lang)}`;
  }

  return `${cell.prefix ?? ''}${text(cell.text, lang)}`;
}

/** The radio mark the design draws in both dialogs, `:7984`. */
function Mark({ on, square }: { on: boolean; square?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid flex-none place-items-center text-[10px] font-bold text-white ${
        square ? 'size-[18px] rounded-[5px]' : 'size-[19px] rounded-full'
      }`}
      style={{
        border: `1.5px solid ${on ? 'var(--brand-500)' : 'var(--border-strong)'}`,
        background: on ? 'var(--brand-500)' : 'transparent',
      }}
    >
      {on ? '✓' : ''}
    </span>
  );
}

/**
 * What the shared export dialog needs said, in the reader's language.
 *
 * Resolved on the server and handed down, like every other label in this route
 * group — a client component cannot reach the catalogue without shipping it.
 */
export type ExportLabels = {
  title: string;
  body: string;
  rowCount: string;
  format: string;
  csv: string;
  excel: string;
  download: string;
  cancel: string;
  note: string;
};

/* ================================================================= viewer */

function Viewer({
  id,
  lang,
  exportLabels,
  onBack,
}: {
  id: ReportId;
  lang: Lang;
  exportLabels: ExportLabels;
  onBack: () => void;
}) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [exporting, setExporting] = useState(false);

  /*
   * The live table, or null while it is on its way and forever after a refusal.
   *
   * Fetched in an effect rather than on the server because the period buttons
   * are local state: rendering all four windows server-side would ship four
   * tables to a reader who opens one. `AbortController` is not optional here —
   * a reader tapping through four periods leaves three responses in flight, and
   * without it the slowest one wins and the screen shows the wrong window.
   */
  const request = `${id}:${period}:${lang}`;
  const [answer, setAnswer] = useState<{ key: string; table: LiveReport | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchReport(id, period, lang, controller.signal).then((table) => {
      if (!controller.signal.aborted) setAnswer({ key: `${id}:${period}:${lang}`, table });
    });

    return () => controller.abort();
  }, [id, period, lang]);

  /*
   * Derived rather than cleared, and the difference matters twice.
   *
   * Clearing it in the effect body would be a synchronous setState — a
   * cascading render on every period tap — and it would also be the wrong
   * guard: what has to be ignored is an ANSWER for a window the reader has
   * already moved on from, not the state before it arrives. Comparing the key
   * does both, and the sample rows show through until the right answer lands.
   */
  const settled = answer?.key === request;
  const live = settled ? answer.table : null;

  /*
   * Three states, not two — and conflating the last two is the whole defect.
   *
   * Nothing has come back yet (`settled === false`), the server answered a
   * table, or the server refused. `fetchReport()` answers null for the refusal,
   * and "this report is not available for this window" is exactly what a
   * restaurant with no trading data gets — so falling through to the design's
   * sample rows meant showing invented figures, with a row count under them and
   * an Export button beside them, to the reader least able to tell.
   */
  const refused = settled && live === null;

  /*
   * The design drew five viewers; there are nine reports.
   *
   * The four that were added when `StandardReports` learned to answer them have
   * no sample table, and that is the honest state: a demo VAT return or an
   * invented branch comparison would be figures on the screen an accountant
   * reads before the server has said a word. They draw a heading and an empty
   * table until the live answer arrives, and the card's own words are the
   * heading — the same two sentences the reader pressed Run under.
   */
  const definition = REPORT_DEFINITIONS[id];
  const card = REPORT_CARDS.find((entry) => entry.id === id);
  const days = PERIODS.find((entry) => entry.key === period)?.days ?? 30;
  // The design's sample rows only while the first answer is on its way.
  const head =
    live?.head ??
    definition?.head.map((column) => ({
      label: say(column.label, lang),
      align: column.align,
    })) ??
    [];
  const rows = refused
    ? []
    : (live?.rows ?? definition?.rows(days).map((row) => row.map((c) => cellText(c, lang))) ?? []);
  const grid = live?.columns ?? definition?.columns ?? 'minmax(0,1fr)';
  const minWidth = live?.minWidth ?? definition?.minWidth ?? '0';
  const title = say(definition?.title ?? card?.name ?? REPORTS_UI.runNow, lang);
  const subtitle = say(definition?.sub ?? card?.body ?? REPORTS_UI.runNow, lang);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="bg-surface hover:bg-bg-subtle text-fg-muted mb-3.5 flex h-8 items-center gap-[7px] rounded-md border pr-[11px] pl-2 text-sm font-medium"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 6-6 6 6 6" />
        </svg>
        {say(REPORTS_UI.back, lang)}
      </button>

      <div data-pagehead className="mb-5 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
        </div>

        <div className="flex flex-none gap-[9px]">
          {/*
           * A page, not a promise. This flashed "sent to the printer" and did
           * nothing — a manager who needs a paper copy was told it printed and
           * stood at an idle printer. `/documents?d=report` is the A4 sheet the
           * export dialog's PDF path already opens, and the browser's own print
           * dialogue is where the printer is chosen. `noopener` because a named
           * window handed a reference back can navigate the console away.
           */}
          <button
            type="button"
            data-press
            onClick={() => {
              const target = exportTarget(id, period);

              window.open(
                `/documents?d=report&kind=${encodeURIComponent(
                  target.kind,
                )}&period=${encodeURIComponent(target.period)}`,
                '_blank',
                'noopener,noreferrer',
              );
            }}
            className="bg-surface hover:bg-bg-subtle text-fg h-9 rounded-md border px-3.5 text-sm font-medium"
          >
            {say(REPORTS_UI.print, lang)}
          </button>

          {/* Nothing to export when the server refused: the dialog would write
              a CSV of the design's rows and the owner would keep it. */}
          <button
            type="button"
            data-press
            disabled={refused}
            onClick={() => setExporting(true)}
            className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-3.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {say(REPORTS_UI.export, lang)}
          </button>
        </div>
      </div>

      <div data-scroll className="mb-[18px] flex gap-2 overflow-x-auto pb-0.5">
        {PERIODS.map((entry) => {
          const active = entry.key === period;

          return (
            <button
              key={entry.key}
              type="button"
              data-press
              onClick={() => setPeriod(entry.key)}
              className={`rounded-pill h-8 flex-none border px-[13px] text-xs font-semibold whitespace-nowrap ${
                active ? 'bg-brand-500 border-brand-500 text-white' : 'bg-surface text-fg-muted'
              }`}
            >
              {say(entry.label, lang)}
            </button>
          );
        })}
      </div>

      {/* The four figures above the table are the design's own arithmetic over
          the design's own rows; the API answers `{columns, rows, totals}` and
          nothing that maps onto them. They belong with the sample table and
          leave with it. */}
      <div
        className="mb-[18px] grid [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3"
        hidden={settled}
      >
        {(definition?.kpis(days) ?? []).map((kpi) => (
          <div key={say(kpi.label, lang)} data-kpi className={`${CARD} px-[18px] py-4`}>
            <div className="text-fg-subtle text-[10px] font-semibold tracking-[.07em] uppercase">
              {say(kpi.label, lang)}
            </div>
            <div data-num className="font-display mt-[5px] text-2xl font-bold tracking-tight">
              {kpi.tiyin === undefined ? text(kpi.text, lang) : formatTiyinAmount(kpi.tiyin, lang)}
            </div>
            <div data-num className="text-2xs mt-[3px] font-semibold" style={{ color: kpi.tone }}>
              {text(kpi.delta, lang)}
            </div>
          </div>
        ))}
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <div data-scroll className="overflow-x-auto">
          <div style={{ minWidth }}>
            <div
              className="bg-bg-subtle text-fg-subtle grid gap-3.5 border-b px-[22px] py-[11px] text-xs font-semibold"
              style={{ gridTemplateColumns: grid }}
            >
              {head.map((column) => (
                <span
                  key={column.label}
                  className="whitespace-nowrap"
                  style={{ textAlign: column.align }}
                >
                  {column.label}
                </span>
              ))}
            </div>

            {rows.map((row, index) => (
              <div
                key={index}
                data-row
                className="border-divider grid items-center gap-3.5 border-b px-[22px] py-[11px]"
                style={{ gridTemplateColumns: grid }}
              >
                {row.map((value, cellIndex) => (
                  <span
                    key={cellIndex}
                    data-num={head[cellIndex]?.align === 'right' ? '' : undefined}
                    className="min-w-0 truncate text-sm"
                    style={{ textAlign: head[cellIndex]?.align ?? 'left' }}
                  >
                    {value}
                  </span>
                ))}
              </div>
            ))}

            {live?.totals ? (
              <div
                data-row
                className="border-divider bg-bg-subtle grid items-center gap-3.5 border-b px-[22px] py-[11px] text-sm font-semibold"
                style={{ gridTemplateColumns: grid }}
              >
                {live.totals.map((value, cellIndex) => (
                  <span
                    key={cellIndex}
                    data-num={head[cellIndex]?.align === 'right' ? '' : undefined}
                    className="min-w-0 truncate"
                    style={{ textAlign: head[cellIndex]?.align ?? 'left' }}
                  >
                    {value}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-divider text-fg-muted border-t px-[22px] py-3.5 text-xs leading-relaxed">
          {refused ? (
            say(REPORTS_COPY.noData, lang)
          ) : (
            <>
              {definition === undefined ? null : <>{say(definition.note, lang)} </>}
              {say(REPORTS_UI.showing, lang)}
              {rows.length} {say(REPORTS_UI.rowsWord, lang)}.
            </>
          )}
        </div>
      </section>

      {/*
       * `rv.exp` at `:12064` opens the console's export sheet rather than
       * queueing a file, and the sheet already exists — the rows on screen are
       * exactly what it wants. Flashing "it will be emailed" here would promise
       * something no endpoint delivers while a working CSV sat one import away.
       *
       * `server` names the report so the sheet can fetch the canonical file
       * instead of re-writing the strings on screen: money as numbers a
       * spreadsheet can add, a totals row, and formula characters defused. It
       * only does that while the reader leaves the columns alone — see the
       * dialog. Passed even when the table below is the design's sample rows,
       * because the two are decided separately: `fetchReport()` returns null
       * for a reader with no session, and `POST /reports/export` answers 401 to
       * exactly the same reader, which falls back to the local writer.
       */}
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        filename={`report-${id}-${period}`}
        columns={head.map((column) => column.label)}
        rows={rows}
        server={exportTarget(id, period)}
        labels={exportLabels}
      />
    </>
  );
}

/* ================================================================ dialogs */

const OVERLAY = 'fixed inset-0 z-[250] grid place-items-center bg-[rgba(15,19,32,.42)] p-5';
const SHEET =
  'bg-surface-raised max-h-[88vh] w-full overflow-y-auto rounded-xl border px-7 pt-[26px] pb-6 shadow-xl';
const LEGEND = 'text-2xs tracking-caps text-fg-subtle mt-[22px] mb-[9px] font-semibold uppercase';

function BuilderDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [base, setBase] = useState<BuilderBase>('sales');
  const [off, setOff] = useState<Readonly<Record<string, boolean>>>({});
  const [group, setGroup] = useState<BuilderGroup>('day');
  const [running, setRunning] = useState(false);
  const [built, setBuilt] = useState<BuiltReport | null>(null);

  const columns = BUILDER_COLUMNS[base];
  const keys = BUILDER_KEYS[base] ?? [];

  /*
   * A chip the projection cannot answer is drawn and not selectable.
   *
   * `analytics.daily_facts` is one row per venue per trading day, so it can
   * group a business by day, week, month or venue and cannot group it by dish
   * or by employee — see CustomReports for why it is the only table this
   * builder may read. Six of the design's twenty-eight chips fall on the wrong
   * side of that line. Drawing them greyed with the reason on hover says which;
   * hiding them would make four of the bases look like three columns.
   */
  const answerable = (index: number): boolean => keys[index] != null;

  const chosen = columns.filter((_, index) => answerable(index) && !off[`${base}${index}`]);
  const chosenKeys = columns
    .map((_, index) => (answerable(index) && !off[`${base}${index}`] ? keys[index] : null))
    .filter((key): key is string => key !== null);

  /* The design's own ROWCOUNT until the report has actually been run, and the
     real count afterwards. A preview that claimed a number it had not counted
     is what the old TODO was careful not to do. */
  const rowCount = built?.rowCount ?? BUILDER_ROWS[group];

  async function run() {
    if (chosenKeys.length === 0) {
      flash.problem(say(REPORTS_COPY.pickAColumn, lang));

      return;
    }

    setRunning(true);
    const answer = await runCustomReport(base, chosenKeys, group, 'month', lang);
    setRunning(false);

    if (answer === null) {
      /*
       * The demo console, a role without `analytics.view`, or an API
       * mid-restart — and all three take the same path every other screen here
       * takes: say what shape was described rather than pretending a file
       * exists. `session.live === false` is already on the shell.
       */
      flash(`${BUILDER_ROWS[group]} ${say(REPORTS_COPY.builtRows, lang)}`);
      onClose();

      return;
    }

    setBuilt(answer);
    flash(`${answer.rowCount} ${say(REPORTS_COPY.builtRows, lang)}`);
  }

  return (
    <div className={OVERLAY} role="presentation" onClick={onClose}>
      <div
        className={`${SHEET} max-w-[560px]`}
        role="dialog"
        aria-modal="true"
        aria-label={say(REPORTS_UI.builderTitle, lang)}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-display tracking-snug text-xl font-bold">
          {say(REPORTS_UI.builderTitle, lang)}
        </h3>
        <p className="text-fg-muted mt-[7px] text-sm leading-normal">
          {say(REPORTS_UI.builderSub, lang)}
        </p>

        <div className={LEGEND}>{say(REPORTS_UI.labelBase, lang)}</div>
        <div className="grid gap-2">
          {BUILDER_BASES.map((entry) => {
            const on = entry.key === base;

            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setBase(entry.key);
                  // The built table belongs to the base it was built from.
                  setBuilt(null);
                }}
                className={`flex w-full items-start gap-3 rounded-md border px-3.5 py-[13px] text-left ${
                  on ? 'border-brand-500 bg-brand-50' : 'bg-surface'
                }`}
              >
                <span className="mt-px">
                  <Mark on={on} />
                </span>
                <span className="min-w-0">
                  <span className="text-fg block text-sm font-semibold">
                    {say(entry.label, lang)}
                  </span>
                  <span className="text-fg-muted mt-0.5 block text-xs leading-normal">
                    {say(entry.note, lang)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={LEGEND}>{say(REPORTS_UI.labelColumns, lang)}</div>
        <div className="flex flex-wrap gap-2">
          {columns.map((column, index) => {
            const key = `${base}${index}`;
            const available = answerable(index);
            const on = available && !off[key];

            return (
              <button
                key={key}
                type="button"
                disabled={!available}
                title={available ? undefined : UNSUPPORTED_COLUMN[lang]}
                onClick={() => {
                  setOff((current) => ({ ...current, [key]: on }));
                  setBuilt(null);
                }}
                className={`rounded-pill h-8 border px-[13px] text-xs font-medium ${
                  on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-surface text-fg-muted'
                } ${available ? '' : 'opacity-40'}`}
              >
                {say(column, lang)}
              </button>
            );
          })}
        </div>

        <div className={LEGEND}>{say(REPORTS_UI.labelGroup, lang)}</div>
        <div className="bg-bg-muted flex gap-[3px] rounded-md p-[3px]">
          {BUILDER_GROUPS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              data-seg
              data-active={group === entry.key ? 'true' : undefined}
              onClick={() => {
                setGroup(entry.key);
                setBuilt(null);
              }}
              className="text-fg-muted h-8 flex-1 rounded-lg border-0 bg-transparent text-xs font-semibold"
            >
              {say(entry.label, lang)}
            </button>
          ))}
        </div>

        {/*
         * The preview is the reason the dialog exists: a builder that only
         * shows its result after you press Run is a form, not a builder.
         */}
        <div className="bg-bg-subtle mt-5 rounded-md border px-4 py-[15px]">
          <div className="text-2xs tracking-caps text-fg-subtle font-semibold uppercase">
            {say(REPORTS_UI.labelPreview, lang)}
          </div>
          <div className="text-fg mt-2 font-mono text-xs leading-relaxed break-words">
            {chosen.length > 0
              ? chosen.map((column) => say(column, lang)).join(' · ')
              : say(REPORTS_UI.noColumns, lang)}
          </div>
          <div data-num className="text-fg-muted mt-2 text-xs">
            {chosen.length > 0
              ? `${rowCount} ${say(REPORTS_UI.rowsWord, lang)} × ${chosen.length} ${say(REPORTS_UI.columnsWord, lang)}`
              : say(REPORTS_UI.needColumn, lang)}
          </div>

          {/* The first three rows of what actually came back. Enough to see
              whether the report is the one that was meant, and short enough
              not to turn the dialog into a viewer. */}
          {built !== null && built.rows.length > 0 ? (
            <div className="border-divider mt-3 grid gap-1 border-t pt-3">
              {built.rows.slice(0, 3).map((row, index) => (
                <div key={index} data-num className="text-fg-muted truncate font-mono text-[11px]">
                  {row.join(' · ')}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-[22px] flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="border-border-strong bg-surface text-fg h-11 flex-1 rounded-md border text-sm font-semibold"
          >
            {say(REPORTS_UI.cancel, lang)}
          </button>

          <button
            type="button"
            disabled={running}
            onClick={() => void run()}
            className={`h-11 flex-1 rounded-md text-sm font-semibold text-white ${
              chosen.length > 0 ? 'bg-brand-500 hover:bg-brand-600' : 'bg-n-300'
            }`}
          >
            {say(REPORTS_UI.runReport, lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleDialog({
  lang,
  reportName,
  reportId,
  onClose,
}: {
  lang: Lang;
  reportName: string | null;
  /**
   * Which report the API knows this card as, when it knows it at all.
   *
   * Five of the eleven cards have one; the other six are exports the design
   * describes and the platform does not compute. Scheduling one of those six
   * would create a job that builds nothing every Monday, so they keep
   * confirming — which is the design's own behaviour and is honest.
   */
  reportId: ReportId | null;
  onClose: () => void;
}) {
  const [frequency, setFrequency] = useState('weekly');
  const [destinations, setDestinations] = useState<Readonly<Record<string, boolean>>>(
    Object.fromEntries(SCHEDULE_DESTINATIONS.map((entry) => [entry.key, entry.on])),
  );
  /* What each destination is actually addressed to. Empty until somebody types
     it: the fixture's `rustam@smartrestaurant.uz` is the design's example and
     sending a real weekly report to it would be a mistake with a stranger's
     inbox at the other end. */
  const [address, setAddress] = useState<Readonly<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  /* `drive` is cloud storage and there is no account behind it. Left drawn and
     not selectable rather than removed — the design lists three destinations,
     and a row that vanished would read as a missing feature rather than as one
     that has not been connected. */
  const CHANNEL: Readonly<Record<string, Destination['channel'] | null>> = {
    mail: 'mail',
    tg: 'telegram',
    drive: null,
  };

  const chosen = SCHEDULE_DESTINATIONS.filter((entry) => destinations[entry.key]);

  async function save() {
    if (chosen.length === 0) {
      flash.problem(say(REPORTS_COPY.pickADestination, lang));

      return;
    }

    const label = SCHEDULE_FREQUENCIES.find((entry) => entry.key === frequency);
    const told = `${say(label?.label ?? REPORTS_UI.schedule, lang)} · ${chosen.length} ${say(
      REPORTS_COPY.destinations,
      lang,
    )} · ${say(REPORTS_COPY.scheduled, lang)}`;

    const addressed: Destination[] = [];

    for (const entry of chosen) {
      const channel = CHANNEL[entry.key];
      const target = (address[entry.key] ?? '').trim();

      if (channel === null || channel === undefined || target === '') continue;

      addressed.push({ channel, target });
    }

    // A card the API has no report for, or a demo console with nothing typed.
    // Confirms what would have been scheduled, which is what it did before.
    if (reportId === null || addressed.length === 0) {
      onClose();
      flash(told);

      return;
    }

    setSaving(true);
    const answer = await saveSchedule({
      kind: exportTarget(reportId, 'month').kind,
      period: 'month',
      frequency,
      lang,
      destinations: addressed,
    });
    setSaving(false);

    if (!answer.ok) {
      // An address that is not an address and a role without `reports.export`
      // are both refusals the API explains in the reader's own language.
      flash.problem(answer.message ?? told);

      return;
    }

    onClose();
    flash(told);
  }

  return (
    <div className={OVERLAY} role="presentation" onClick={onClose}>
      <div
        className={`${SHEET} max-w-[460px]`}
        role="dialog"
        aria-modal="true"
        aria-label={reportName ?? say(REPORTS_UI.scheduleTitle, lang)}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-display tracking-snug text-xl font-bold">
          {reportName ?? say(REPORTS_UI.scheduleTitle, lang)}
        </h3>
        <p className="text-fg-muted mt-[7px] text-sm leading-normal">
          {say(REPORTS_UI.scheduleSub, lang)}
        </p>

        <div className={LEGEND}>{say(REPORTS_UI.labelWhen, lang)}</div>
        <div className="grid gap-2">
          {SCHEDULE_FREQUENCIES.map((entry) => {
            const on = entry.key === frequency;

            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFrequency(entry.key)}
                className={`flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left ${
                  on ? 'border-brand-500 bg-brand-50' : 'bg-surface'
                }`}
              >
                <Mark on={on} />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block text-sm font-semibold">
                    {say(entry.label, lang)}
                  </span>
                  <span data-num className="text-fg-muted mt-0.5 block text-xs">
                    {say(entry.note, lang)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={LEGEND}>{say(REPORTS_UI.labelTo, lang)}</div>
        <div className="grid gap-[7px]">
          {SCHEDULE_DESTINATIONS.map((entry) => {
            const on = destinations[entry.key] ?? false;
            const channel = CHANNEL[entry.key] ?? null;

            /*
             * A row rather than a button, because two of the three now carry an
             * input and a control inside a button is neither clickable nor
             * valid. The toggle keeps the whole row's hit area; the address
             * sits beside it where the design draws the example address.
             */
            return (
              <div
                key={entry.key}
                className={`flex w-full items-center gap-[11px] rounded-md border px-[13px] py-[11px] ${
                  on ? 'border-brand-500 bg-brand-50' : 'bg-surface'
                }`}
              >
                <button
                  type="button"
                  disabled={channel === null}
                  onClick={() => setDestinations((current) => ({ ...current, [entry.key]: !on }))}
                  className={`flex min-w-0 flex-1 items-center gap-[11px] border-0 bg-transparent p-0 text-left ${
                    channel === null ? 'opacity-40' : ''
                  }`}
                >
                  <Mark on={on} square />
                  <span className="text-fg min-w-0 flex-1 text-sm font-medium">
                    {say(entry.label, lang)}
                  </span>
                </button>

                {on && channel !== null ? (
                  <input
                    value={address[entry.key] ?? ''}
                    onChange={(event) =>
                      setAddress((current) => ({ ...current, [entry.key]: event.target.value }))
                    }
                    placeholder={say(entry.note, lang)}
                    className="border-border bg-surface h-8 w-[52%] flex-none rounded-md border px-2.5 text-xs"
                  />
                ) : (
                  <span className="text-2xs text-fg-subtle flex-none">{say(entry.note, lang)}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-[22px] flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="border-border-strong bg-surface text-fg h-11 flex-1 rounded-md border text-sm font-semibold"
          >
            {say(REPORTS_UI.cancel, lang)}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className={`h-11 flex-1 rounded-md text-sm font-semibold text-white ${
              chosen.length > 0 ? 'bg-brand-500 hover:bg-brand-600' : 'bg-n-300'
            }`}
          >
            {say(REPORTS_UI.scheduleSave, lang)}
          </button>
        </div>

        <p className="text-2xs text-fg-subtle mt-3 leading-relaxed">
          {say(REPORTS_UI.scheduleNote, lang)}
        </p>
      </div>
    </div>
  );
}

/* ============================================================== the screen */

export function ReportsScreen({
  lang,
  title,
  subtitle,
  exportLabels,
}: {
  lang: Lang;
  title: string;
  subtitle: string;
  exportLabels: ExportLabels;
}) {
  const [open, setOpen] = useState<ReportId | null>(null);
  const [builder, setBuilder] = useState(false);
  const [scheduling, setScheduling] = useState<{ name: string; id: ReportId | null } | null>(null);

  return (
    <>
      {open === null ? (
        <>
          <div data-pagehead className="mb-[22px] flex items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
              <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
            </div>

            <button
              type="button"
              data-press
              onClick={() => setBuilder(true)}
              className="bg-surface hover:bg-bg-subtle text-fg h-9 flex-none rounded-md border px-3.5 text-sm font-medium whitespace-nowrap"
            >
              {say(REPORTS_UI.custom, lang)}
            </button>
          </div>

          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
            {REPORT_CARDS.map((report) => {
              const name = say(report.name, lang);

              return (
                <div key={name} className={`${CARD} flex flex-col gap-3 px-6 py-[22px]`}>
                  <h3 className="text-md tracking-snug font-semibold">{name}</h3>
                  <p className="text-fg-muted text-sm leading-normal text-pretty">
                    {say(report.body, lang)}
                  </p>

                  <div className="mt-0.5 flex gap-2">
                    <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs px-[9px] py-1 font-medium">
                      {say(report.schedule, lang)}
                    </span>
                    <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs px-[9px] py-1 font-medium">
                      {report.formats}
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    {/*
                     * Nine of the eleven open a viewer now. The Z pack, sales
                     * by item, the VAT pack and the branch comparison joined
                     * the original five when `StandardReports::build()` learned
                     * to answer them; the last two — stock movement and labour
                     * — still have no Run button, and that is not an oversight:
                     * stock needs Inventory, which Analytics may not read, and
                     * labour needs per-person attendance, which the Staff
                     * contract withholds. Both keep their Schedule button,
                     * which does write.
                     */}
                    {report.id === undefined ? null : (
                      <button
                        type="button"
                        data-press
                        onClick={() => setOpen(report.id as ReportId)}
                        className="hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-semibold"
                      >
                        {say(REPORTS_UI.runNow, lang)}
                      </button>
                    )}

                    <button
                      type="button"
                      data-press
                      onClick={() => setScheduling({ name, id: report.id ?? null })}
                      className="text-fg-muted hover:bg-bg-subtle h-9 rounded-md px-3.5 text-sm font-medium"
                    >
                      {say(REPORTS_UI.schedule, lang)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Viewer id={open} lang={lang} exportLabels={exportLabels} onBack={() => setOpen(null)} />
      )}

      {builder ? <BuilderDialog lang={lang} onClose={() => setBuilder(false)} /> : null}

      {scheduling === null ? null : (
        <ScheduleDialog
          lang={lang}
          reportName={scheduling.name}
          reportId={scheduling.id}
          onClose={() => setScheduling(null)}
        />
      )}
    </>
  );
}

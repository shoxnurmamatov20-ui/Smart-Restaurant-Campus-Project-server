import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';

import { getSession } from '@/lib/session';

import { documentsFor, mayOpen, mayReport, maySettlement } from './documents-access';
import {
  DOCUMENT_COPY,
  DOCUMENT_NAMES,
  langOf,
  LIVE_PARAM,
  say,
  type Lang,
} from './documents-copy';
import { isDocumentKey, PAPER_OF, type DocumentKey } from './documents-data';
import { loadDocument, type LoadedDocument } from './documents-server';
import { IndexPage } from './index-page';
import { Invoice } from './invoice';
import { Payslip } from './payslip';
import { PrintButton } from './print-button';
import { ProfitLoss } from './profit-loss';
import { Receipts } from './receipts';
import { Report } from './report';
import {
  loadReport,
  reportKindFrom,
  reportPeriodFrom,
  type ReportKind,
  type ReportPeriod,
} from './report-server';
import { Settlement, type SettlementSheet } from './settlement';
import { loadSettlement, settlementIdFrom } from './settlement-server';
import { StockCount } from './stock-count';
import { ZReport } from './z-report';

import './documents.css';

/**
 * 02 · Hujjatlar — the seven printable documents.
 *
 * `specs/02-documents.md §3` states the architecture in one line: "One
 * continuous page; each document is a `section`. A switcher at the top selects
 * the document for preview. Print emits one document per page box." That is
 * what this is, with the switcher resolved from `?d=` rather than from state.
 *
 * **Not a sidebar row, on purpose.** `NAV_ALL` has twenty-four entries and
 * documents is not among them — the design file that owns the console's
 * navigation draws twenty-four and no more, and adding a twenty-fifth here
 * would put this build back in the exact position `design-fidelity.test.ts`
 * exists to prevent. The way in is from the screen that produced the document:
 * the till for a Z, the ledger for an invoice or a payslip, the store room for
 * a count sheet. That is also the better door — nobody wants a document, they
 * want *this* document, about *this* shift.
 *
 * **The URL is the state.** `?d=z` opens the Z report, which is what makes
 * those three entry points a link rather than a sequence of clicks, and what
 * lets a manager send "print this" to a cashier in a message.
 */
export const metadata: Metadata = {
  title: 'Hujjatlar',
  /*
   * Never indexed. `robots.ts` keeps crawlers off every console surface by
   * reading the same maps middleware guards, and this surface is in neither map
   * — so it says so itself. What would otherwise be indexed is a restaurant's
   * turnover, a named employee's pay and a supplier's prices, under the
   * restaurant's own domain.
   */
  robots: { index: false, follow: false },
};

/**
 * The seven sheets, each handed the document it is drawing.
 *
 * A switch rather than the lookup table this used to be: every document now
 * takes its own data, and a `Record` of components with seven different prop
 * shapes is a union that has to be re-narrowed at the call site anyway. Here the
 * narrowing is the dispatch — `loaded.key` picks the component and carries the
 * matching payload with it, so a sheet cannot be rendered against another
 * document's figures.
 */
function Sheet({
  loaded,
  available,
}: {
  loaded: LoadedDocument;
  available: readonly DocumentKey[];
}) {
  switch (loaded.key) {
    case 'index':
      return <IndexPage available={available} />;
    case 'receipts':
      return <Receipts receipt={loaded.receipt} ticket={loaded.ticket} />;
    case 'z':
      return <ZReport report={loaded.report} live={loaded.source !== 'specimen'} />;
    case 'invoice':
      return <Invoice invoice={loaded.invoice} />;
    case 'stock-count':
      return <StockCount sheet={loaded.sheet} />;
    case 'payslip':
      return <Payslip payslip={loaded.payslip} />;
    case 'profit-loss':
      return <ProfitLoss statement={loaded.statement} rows={loaded.rows} />;
  }
}

/**
 * Whether the paper below is the design's specimen, a record, or a record with
 * a hole in it.
 *
 * Above the sheet and never on it — `.doc-chrome` is `display: none` at print,
 * which is right: this line is addressed to the person choosing what to print,
 * and a note about data provenance on a guest's receipt would be noise. The
 * consequence is that a printed specimen carries no warning at all, which is
 * exactly why the warning has to be unmissable *before* the button is pressed.
 */
function SheetState({ loaded, lang }: { loaded: LoadedDocument; lang: Lang }) {
  if (loaded.source === 'live') {
    return (
      <span className="text-success-700 text-xs font-medium">
        {say(DOCUMENT_COPY.liveSheet, lang)}
      </span>
    );
  }

  if (loaded.source === 'partial') {
    return (
      <span className="text-warning-700 text-xs font-medium">
        {say(DOCUMENT_COPY.partialSheet, lang)}
      </span>
    );
  }

  const parameter = LIVE_PARAM[loaded.key];

  return (
    <span className="text-warning-700 text-xs font-medium">
      {say(DOCUMENT_COPY.specimen, lang)}
      {parameter === null ? null : (
        <span className="text-fg-subtle font-normal">
          {' · '}
          {say(DOCUMENT_COPY.specimenHint, lang)} <code>?{parameter}=…</code>
        </span>
      )}
    </span>
  );
}

/**
 * `?d=report&kind=…&period=…` — the PDF the export dialog promises.
 *
 * The console draws four export formats and PDF is one of them. There is no PDF
 * renderer on this platform and none is being built: rendering a report to PDF
 * server-side means headless Chrome or a PDF library plus a page template per
 * report, and the platform already owns a surface whose whole job is putting a
 * table on A4 with a print button over it. So the dialog opens this page in a
 * new tab and the reader's own browser makes the PDF — the same "save as PDF"
 * an accountant already uses for the invoice and the P&L.
 *
 * A branch of its own, like the settlement and for the same reason: the seven
 * are the design file's statutory paper, this is whatever table analytics
 * answered, and adding a ninth `DocumentKey` would put a report tab in front of
 * every cashier on the surface.
 *
 * `a4-flow` rather than `a4`, because this is the one sheet here that can run
 * past one page — see `documents.css`.
 */
async function ReportDocument({
  kind,
  period,
  lang,
}: {
  /** `null` when `?kind=` named something that is not one of the five. */
  kind: ReportKind | null;
  period: ReportPeriod | null;
  lang: Lang;
}) {
  /*
   * Both halves or nothing. A link that lost its `kind` could be answered with
   * a default report, and the reader would print a page headed with a report
   * they did not ask for — worse than an empty sheet, because it looks right.
   */
  const sheet = kind === null || period === null ? null : await loadReport(kind, period);

  return (
    <div className="doc-paper flex min-h-dvh flex-col" data-paper="a4-flow">
      <header className="doc-chrome border-border bg-surface border-b px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {say(DOCUMENT_COPY.title, lang)}
            </h1>
            <p className="text-fg-muted mt-1.5 text-sm">{say(DOCUMENT_COPY.lede, lang)}</p>
          </div>

          {/* Not `flex-none`: at 320 this block is 365px against a 272px content
              box, so it pushed the whole page sideways by 93. It shrinks and
              wraps now, and the note under it goes with it. */}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="text-fg-subtle text-xs">{say(DOCUMENT_COPY.a4Note, lang)}</span>
              {sheet === null ? (
                <span className="text-warning-700 text-xs font-medium">
                  {say(DOCUMENT_COPY.noSheet, lang)}
                </span>
              ) : (
                <span className="text-success-700 text-xs font-medium">
                  {say(DOCUMENT_COPY.liveSheet, lang)}
                </span>
              )}
            </div>
            <PrintButton label={say(DOCUMENT_COPY.print, lang)} />
          </div>
        </div>
      </header>

      <main className="doc-stage flex-1">
        <article
          key={`report-${kind ?? 'none'}-${period ?? 'none'}`}
          data-panel-in
          className="doc-sheet"
        >
          {sheet === null ? (
            /*
             * No sample rows, on purpose — the same rule the settlement follows
             * one function down. A specimen Z teaches a cashier what the paper
             * looks like; a specimen REPORT is a page of invented takings under
             * a real restaurant's name and a real date range, and once it is on
             * paper nothing on it says it was never true.
             */
            <p style={{ fontSize: '10pt', color: 'var(--doc-fg-muted)' }}>
              Hisobot ma’lumotlari topilmadi. Hisobot tahlil ekranidagi eksport oynasidan ochiladi;
              ba’zi hisobotlar (masalan, ombor) hali tizimda mavjud emas.
            </p>
          ) : (
            <Report sheet={sheet} />
          )}
        </article>
      </main>
    </div>
  );
}

/**
 * `?d=settlement&id=…` — a branch of its own, and deliberately not an eighth
 * `DocumentKey`.
 *
 * The seven are the design file's, they are a restaurant's own paper, and every
 * reader who reaches this surface holds some of them. A settlement is the
 * *platform's* statement about a storefront on the marketplace: it exists only
 * for restaurants that sell through MyPOS, it is reached by link from
 * `/merchant/settlement` rather than from the switcher, and adding it to
 * `DOCUMENT_ORDER` would put a tab in front of every accountant whose
 * restaurant has never listed a dish.
 *
 * So it renders the same chrome — the same paper, the same print button, the
 * same `@page doc-a4` box — through its own path, and touches none of the
 * shared tables.
 */
async function SettlementDocument({
  id,
  sheet,
  lang,
}: {
  id: number | null;
  sheet: SettlementSheet;
  lang: Lang;
}) {
  const statement = id === null ? null : await loadSettlement(id);

  return (
    <div className="doc-paper flex min-h-dvh flex-col" data-paper="a4">
      <header className="doc-chrome border-border bg-surface border-b px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {say(DOCUMENT_COPY.title, lang)}
            </h1>
            <p className="text-fg-muted mt-1.5 text-sm">{say(DOCUMENT_COPY.lede, lang)}</p>
          </div>

          {/* Not `flex-none`: at 320 this block is 365px against a 272px content
              box, so it pushed the whole page sideways by 93. It shrinks and
              wraps now, and the note under it goes with it. */}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="text-fg-subtle text-xs">{say(DOCUMENT_COPY.a4Note, lang)}</span>
              {statement === null ? (
                <span className="text-warning-700 text-xs font-medium">
                  {say(DOCUMENT_COPY.specimen, lang)}
                </span>
              ) : (
                <span className="text-success-700 text-xs font-medium">
                  {say(DOCUMENT_COPY.liveSheet, lang)}
                </span>
              )}
            </div>
            <PrintButton label={say(DOCUMENT_COPY.print, lang)} />
          </div>
        </div>
      </header>

      <main className="doc-stage flex-1">
        <article key={`settlement-${id ?? 0}`} data-panel-in className="doc-sheet">
          {statement === null ? (
            /*
             * No specimen, on purpose. Every other document here falls back to
             * the sheet the design drew, because a specimen Z teaches a cashier
             * what the paper looks like. A specimen SETTLEMENT is an invoice for
             * money nobody owes — printed and posted to an accountant, it is a
             * fiction on a real letterhead.
             */
            <p style={{ fontSize: '10pt', color: 'var(--doc-fg-muted)' }}>
              Hisob-kitob topilmadi. Hujjat do‘kon panelidagi to‘lovlar ekranidan ochiladi.
            </p>
          ) : (
            <Settlement statement={statement} sheet={sheet} />
          )}
        </article>
      </main>
    </div>
  );
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [asked, locale, session] = await Promise.all([searchParams, getLocale(), getSession()]);
  const lang = langOf(locale);
  const role = session.role.id;

  if (asked.d === 'report') {
    /*
     * The same shape the seven use, and the same reason: the page exists and a
     * reader who may not open this sheet is still allowed on the surface, so
     * they land on the contents sheet rather than a 404. `redirect` rather than
     * a silent fall-through so the address bar stops claiming to hold a report.
     */
    if (!mayReport(role)) redirect('/documents');

    return (
      <ReportDocument
        kind={reportKindFrom(asked.kind)}
        period={reportPeriodFrom(asked.period)}
        lang={lang}
      />
    );
  }

  if (asked.d === 'settlement') {
    /*
     * The same shape the seven use: a role that does not hold this document
     * lands on the contents sheet rather than a 404, because the page exists
     * and they are allowed on it. `redirect` rather than a silent fall-through
     * so the address bar stops claiming to be showing them a statement.
     */
    if (!maySettlement(role)) redirect('/documents');

    const sheet: SettlementSheet = asked.sheet === 'act' ? 'act' : 'invoice';

    return <SettlementDocument id={settlementIdFrom(asked.id)} sheet={sheet} lang={lang} />;
  }

  /*
   * `?d=` is a query parameter, so it is also the second half of the guard.
   *
   * `middleware.ts` decides who reaches the surface; it cannot decide which
   * document, because the document is not in the path. Without this line a
   * warehouseman who may print a count sheet reads a colleague's payslip by
   * editing the address bar — and the switcher above would not even have shown
   * them the tab they typed.
   *
   * A document they do not hold falls back to the contents sheet rather than
   * 404ing: the page exists and they are allowed on it, so "not for you" is the
   * honest answer, and the contents sheet is exactly the list of what is.
   */
  const requested = asked.d;
  const wanted: DocumentKey = isDocumentKey(requested) ? requested : 'index';
  const selected: DocumentKey = mayOpen(role, wanted) ? wanted : 'index';

  /* Their own, in the design's order — never the full seven. */
  const available = documentsFor(role);
  const paper = PAPER_OF[selected];

  /*
   * `?d=` says which document; a second parameter says which *one*.
   *
   * `?d=z` is the specimen the design drew, `?d=z&shift=318` is the Z of shift
   * 318 — and the read goes out on this person's own token, so the API is a
   * third guard behind the two above rather than something this page has to
   * re-implement. Awaited before the header renders, because the header is
   * where the reader is told which of the two they are looking at.
   */
  const loaded = await loadDocument(selected, asked);

  return (
    <div className="doc-paper flex min-h-dvh flex-col" data-paper={paper}>
      <header className="doc-chrome border-border bg-surface border-b px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {say(DOCUMENT_COPY.title, lang)}
            </h1>
            <p className="text-fg-muted mt-1.5 text-sm">{say(DOCUMENT_COPY.lede, lang)}</p>
          </div>

          {/* Not `flex-none`: at 320 this block is 365px against a 272px content
              box, so it pushed the whole page sideways by 93. It shrinks and
              wraps now, and the note under it goes with it. */}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex flex-col items-end gap-1 text-right">
              {/* Which paper this document goes onto, before the dialogue opens
                  rather than after the wrong tray has swallowed it. */}
              <span className="text-fg-subtle text-xs">
                {say(paper === '80mm' ? DOCUMENT_COPY.paperNote : DOCUMENT_COPY.a4Note, lang)}
              </span>
              <SheetState loaded={loaded} lang={lang} />
            </div>
            <PrintButton label={say(DOCUMENT_COPY.print, lang)} />
          </div>
        </div>

        <nav
          aria-label={say(DOCUMENT_COPY.title, lang)}
          className="mx-auto mt-4 w-full max-w-[1180px]"
        >
          <div className="bg-bg-muted flex w-fit max-w-full flex-wrap gap-0.5 rounded-md p-[3px]">
            {available.map((key) => (
              <Link
                key={key}
                href={`/documents?d=${key}`}
                scroll={false}
                data-seg
                data-active={key === selected ? 'true' : undefined}
                aria-current={key === selected ? 'page' : undefined}
                className="grid h-8 place-items-center rounded-[7px] px-3.5 text-sm font-medium"
              >
                {say(DOCUMENT_NAMES[key], lang)}
              </Link>
            ))}
          </div>

          <p className="text-fg-subtle mt-3 text-xs leading-normal">
            {say(DOCUMENT_COPY.uzbekOnly, lang)}
          </p>
        </nav>
      </header>

      {/*
       * `data-panel-in` on the sheet, keyed by the document.
       *
       * The key is what makes it fire: without it React reuses the same element
       * across a navigation and the animation never restarts, so swapping from
       * the Z to the payslip would replace the content with no motion at all —
       * the design's own reason for the attribute (`motion.css`: "a panel that
       * replaces content in place").
       */}
      {/*
       * All seven preview on an A4 sheet, including the two thermal ones.
       *
       * That is the design: `p2` and `p3` are A4 specimen pages that hold the
       * 80 mm strips at real size with an explanation beside them, because a
       * receipt is easier to judge against a known sheet than floating alone.
       * At print the sheet gets out of the way for those two and only the
       * strips go to the roll — see the `[data-paper='80mm']` block in
       * `documents.css`.
       */}
      <main className="doc-stage flex-1">
        <article key={selected} data-panel-in className="doc-sheet">
          <Sheet loaded={loaded} available={available} />
        </article>
      </main>
    </div>
  );
}

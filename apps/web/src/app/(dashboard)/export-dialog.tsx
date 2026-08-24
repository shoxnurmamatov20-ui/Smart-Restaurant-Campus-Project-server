'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flash } from '@restaurant/ui';

/**
 * Taking a table off the screen and onto a disk.
 *
 * `Smart Restaurant OS.dc.html:7793-7850` — four formats, three scopes, a
 * column picker, three destinations and a preview of the file that is about to
 * exist. The build had two formats and nothing else, which meant a reader could
 * not answer the one question the dialog is for: *what am I about to get*.
 *
 * ---------------------------------------------------------------------------
 * Three places a report can be made, and which one a reader gets
 *
 * **This browser.** CSV and Excel are written here, from the rows already in
 * the page, and that path works on every screen this dialog is opened from —
 * including the ones with no endpoint behind them at all.
 *
 * **The server.** A caller that knows its table is one of the five standard
 * reports passes `server`, and then `POST /api/reports/export` writes the file
 * instead. The server's file is a genuinely better file and it is worth the
 * extra call: amounts come out as plain numbers a spreadsheet can add up rather
 * than as `450 000 so'm`, there is a totals row, and any cell beginning `=`,
 * `+`, `-` or `@` is defused so Excel does not execute a dish name. It is also
 * the only writer that can address a file to somebody who is not sitting at
 * this screen — email and Telegram are the same endpoint with `deliver` set.
 *
 * **The printer.** PDF is not a file this platform produces: there is no PDF
 * renderer on the server and none is being built. What there is is
 * `/documents`, a surface whose whole job is putting a sheet on A4 with a print
 * button over it — so PDF opens the report there in a new tab and the reader's
 * own browser makes the PDF through "save as PDF". That is the same button an
 * accountant already uses for the invoice and the P&L, and it beats a queued
 * renderer for the reason that matters here: it exists.
 *
 * ---------------------------------------------------------------------------
 * The column picker, and where it stops applying
 *
 * The server sends the report's own columns and takes no projection, so a
 * reader who has switched one off is asking for something only the browser can
 * write — and for a CSV download they get it. Untouched columns mean the two
 * files hold the same table, so the better one wins, and if the request fails
 * the local writer runs anyway: that button must always produce a file.
 *
 * Everywhere else the picker cannot be honoured at all — the browser cannot
 * write a 1C posting, cannot lay out a page, and cannot put a file in somebody
 * else's inbox — so the note under the picker says so before the button is
 * pressed rather than after the file arrives with columns the reader thought
 * they had removed.
 *
 * ---------------------------------------------------------------------------
 * What is offered against what
 *
 * The format is chosen at the top of the sheet and the destination at the
 * bottom, and the dependency runs the same way: the format decides which
 * destinations are reachable, never the reverse. Only the two dialects the
 * server writes — CSV and 1C — can be sent to somebody else. Excel here is a
 * semicolon-and-BOM file written in this browser for a Russian or Uzbek
 * Windows, and mailing the server's comma-separated CSV under that label is
 * precisely the file that gets mailed back a week later; PDF is a page the
 * reader prints, and a page has nowhere to be sent from. So with either of
 * those chosen the destination falls back to download and the other two buttons
 * are disabled.
 *
 * **A BOM, and semicolons.** Excel on a Russian or Uzbek Windows reads a
 * comma-separated file as one column and mangles Cyrillic without a
 * byte-order mark. Both are one line each here and both are the difference
 * between a file that opens and a file that gets mailed back.
 */

/** The design's four, in its order. */
type Format = 'csv' | 'xlsx' | 'pdf' | '1c';

/**
 * Who writes each format.
 *
 * `browser` is the floor rather than the whole story: a CSV download prefers
 * the server's file when the caller named a report and the reader left the
 * columns alone (see `fromServer`), and falls back here when it cannot. The
 * other three have exactly one writer each and no fallback — which is why
 * pressing them without a `server` prop has to say so rather than quietly
 * handing over the table on screen under the wrong extension.
 */
type Source = 'browser' | 'server' | 'print';

const FORMATS: readonly { key: Format; label: string; source: Source }[] = [
  { key: 'csv', label: 'CSV', source: 'browser' },
  { key: 'xlsx', label: 'Excel', source: 'browser' },
  { key: 'pdf', label: 'PDF', source: 'print' },
  { key: '1c', label: '1C', source: 'server' },
];

/**
 * A brand name, not a label.
 *
 * It reads "Telegram" in Uzbek, Russian and English alike, which is exactly
 * what `i18n.test.ts` rejects from the catalogue: a row identical in all three
 * is data, and the next person to edit it would edit one of the three copies.
 * It lives here with the format names for the same reason.
 */
const TELEGRAM = 'Telegram';

type Destination = 'dl' | 'mail' | 'tg';

/** What the server is asked to write. `pdf` never reaches it — it is a page. */
type Dialect = 'csv' | '1c';

/** The outcome of a delivery, with the API's own sentence when it refused. */
type Delivered = { ok: true } | { ok: false; message: string | null };

export function ExportDialog({
  open,
  onClose,
  filename,
  columns,
  rows,
  scopes,
  server,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  /** Without an extension — the format adds its own. */
  filename: string;
  columns: readonly string[];
  /** One array per row, already formatted the way the screen shows it. */
  rows: readonly (readonly string[])[];
  /**
   * The three sizes the reader can choose between, when the caller knows them.
   *
   * Omitted, the dialog offers only what it can honestly count: the rows it was
   * handed. Offering "all orders" against a number nobody supplied would be a
   * count invented at the last moment, on the screen whose whole job is to say
   * how much is coming.
   */
  scopes?: readonly { key: string; label: string; count: number }[];
  /**
   * The table this dialog is looking at, where the API has a file for it.
   *
   * Only the five standard reports do — `exportTarget()` in
   * `analytics/reports/reports-server.ts` is the one place those names are
   * spelled. Screens whose rows are not a standard report (the orders table)
   * leave it out and keep the browser's writer, which is the honest split:
   * `POST /api/v1/reports/export` validates `kind` against a closed set and
   * would refuse anything else.
   *
   * It is also what decides whether three of the four formats are reachable at
   * all. 1C, PDF and both remote destinations are the server's and the printed
   * sheet's, and neither can be built out of an anonymous table of strings.
   */
  server?: { kind: string; period: string };
  labels: {
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
}) {
  const t = useTranslations('console.exportDialog');
  /*
   * The API refuses in three languages and the dialog has to pick one. Its own
   * catalogue is resolved by `useTranslations`, but the refusal sentence is not
   * in the catalogue — it comes down the wire as `message_uz` / `message_ru` /
   * `message_en`, so the current locale has to be read directly.
   */
  const locale = useLocale();

  const [format, setFormat] = useState<Format>('csv');
  const [scope, setScope] = useState(0);
  const [chosen, setChosen] = useState<Destination>('dl');
  /** Column indexes the reader has switched **off**. Empty is the design's default. */
  const [dropped, setDropped] = useState<readonly number[]>([]);
  const dialog = useRef<HTMLDivElement | null>(null);

  /* Escape closes it. A dialog over a table that can only be dismissed by
     finding a small ✕ is a dialog people close by reloading the page. */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    dialog.current?.focus();

    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const scopePage = t('scopePage');
  const choices = useMemo(
    () => scopes ?? [{ key: 'page', label: scopePage, count: rows.length }],
    [scopes, scopePage, rows.length],
  );

  const kept = columns.map((_, index) => index).filter((index) => !dropped.includes(index));
  const rowCount = choices[Math.min(scope, choices.length - 1)]?.count ?? rows.length;

  /* The design's own estimate: eleven bytes a cell, floored at 2 KB so a
     three-row export does not claim to weigh nothing. */
  const kb = Math.max(2, Math.round((rowCount * kept.length * 11) / 1024));
  const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  const name = `${filename}.${format}`;

  const source = FORMATS.find((entry) => entry.key === format)?.source ?? 'browser';

  /**
   * Can this format be addressed to somebody who is not at this screen?
   *
   * Only for the two the server writes. Excel is a browser dialect and PDF is a
   * page, and neither has a form the endpoint could put in an inbox — so the
   * reader's chosen destination is honoured for those two and ignored for the
   * rest, rather than the buttons promising a delivery that would silently
   * become a download.
   */
  const sendable = format === 'csv' || format === '1c';
  const destination: Destination = sendable ? chosen : 'dl';

  /** A press the browser cannot answer on its own, whatever happens upstream. */
  const needsServer = source !== 'browser' || destination !== 'dl';

  /** …and the caller never told us which report this is, so it cannot happen. */
  const unavailable = needsServer && server === undefined;

  /**
   * Would this download come off the server?
   *
   * Three conditions and each is a promise the dialog would otherwise break:
   * the caller has to know which report this is, the format has to be the one
   * the endpoint produces, and the reader must not have narrowed the columns —
   * because the server sends the report's own set and honouring their choice
   * matters more than the better number formatting.
   */
  const fromServer =
    server !== undefined && format === 'csv' && destination === 'dl' && dropped.length === 0;

  /*
   * The note has to be true for all twelve squares of the grid, so it is read
   * top-down: nothing to export, then nothing that can produce it, then the
   * column picker being ignored, then where it is going, then what it is.
   */
  const note =
    kept.length === 0
      ? t('noteNoColumns')
      : unavailable
        ? t('serverOnly')
        : needsServer && dropped.length > 0
          ? t('noteServerColumns')
          : destination === 'mail'
            ? t('noteMail')
            : destination === 'tg'
              ? t('noteTelegram')
              : format === 'pdf'
                ? t('notePdf')
                : format === '1c'
                  ? t('note1c')
                  : fromServer
                    ? t('noteServer')
                    : t('noteDefault');

  if (!open) return null;

  /** Hand a blob to the browser under a name somebody can find again. */
  const save = (blob: Blob, as: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = as;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  /**
   * The name the server gave the file — `voids-2026-07-23_2026-08-21.csv`.
   *
   * Worth taking, because those dates are the API's own answer to "which
   * window is a month" and the local name only knows the button that was
   * pressed. Anything with a path separator in it is refused rather than
   * cleaned: `download` is a filename and a value that looked like a path would
   * be a header deciding where a file lands.
   */
  const namedByServer = (disposition: string | null): string | null => {
    const match = disposition === null ? null : /filename="([^"]+)"/.exec(disposition);
    const named = match?.[1] ?? null;

    return named === null || /[/\\]/.test(named) ? null : named;
  };

  /**
   * The server's file, or `false` if it did not arrive.
   *
   * Never throws and never reports the reason. For a CSV the caller falls back
   * to the browser's writer, so the reader gets a file either way and a toast
   * naming an HTTP status would be noise about a failure that had no
   * consequence; for 1C there is no fallback and the caller says so itself.
   */
  const downloadFromServer = async (
    target: { kind: string; period: string },
    dialect: Dialect,
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, format: dialect, deliver: 'download' }),
      });

      if (!response.ok) return false;

      save(
        await response.blob(),
        namedByServer(response.headers.get('Content-Disposition')) ?? `${filename}.csv`,
      );

      return true;
    } catch {
      return false;
    }
  };

  /**
   * The same report, put in front of somebody who is not here.
   *
   * Unlike a download this one does report its reason, because there is nothing
   * to fall back to and the reasons are all things the reader can act on: the
   * restaurant has no Telegram chat configured, the mailer is not set up, the
   * address bounced. The API answers those as its own sentence in three
   * languages and this hands the reader's own back untouched — a toast saying
   * "502" would leave them with no idea which end to fix.
   *
   * `delivered` is checked and not just the status. The endpoint answers how
   * many destinations actually received the file, and a 200 carrying zero is a
   * report that went nowhere: flashing "sent" over it would be the one lie this
   * dialog must never tell.
   */
  const deliverFromServer = async (
    target: { kind: string; period: string },
    dialect: Dialect,
    deliver: 'email' | 'telegram',
  ): Promise<Delivered> => {
    let response: Response;

    try {
      response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, format: dialect, deliver }),
      });
    } catch {
      return { ok: false, message: null };
    }

    let body: {
      data?: { delivered?: number };
      error?: { message_uz?: string; message_ru?: string; message_en?: string };
    };

    try {
      body = (await response.json()) as typeof body;
    } catch {
      return { ok: false, message: null };
    }

    if (response.ok && (body.data?.delivered ?? 0) > 0) return { ok: true };

    const sentence: Record<string, string | undefined> = {
      uz: body.error?.message_uz,
      ru: body.error?.message_ru,
      en: body.error?.message_en,
    };

    // Uzbek as the last resort before giving up: it is this platform's default
    // and a sentence somebody can read beats a generic one they cannot act on.
    return { ok: false, message: sentence[locale] ?? sentence.uz ?? null };
  };

  const writeFile = () => {
    const separator = format === 'xlsx' ? ';' : ',';

    const escape = (cell: string) =>
      /["\n;,]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

    const pick = (row: readonly string[]) => kept.map((index) => row[index] ?? '');

    const body = [pick(columns), ...rows.map(pick)]
      .map((row) => row.map(escape).join(separator))
      .join('\r\n');

    /* U+FEFF, so Excel reads it as UTF-8 rather than as the local code page. */
    save(new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
  };

  const go = () => {
    if (kept.length === 0) {
      flash.problem(t('needColumn'));
      return;
    }

    /*
     * Three of the four formats and two of the three destinations leave this
     * browser, and every one of them needs the report's name to do it.
     *
     *   **PDF** is the printable sheet at `/documents?d=report`, which is
     *   addressed by `kind` and `period` and nothing else — there is no way to
     *   put an anonymous table of strings on it.
     *
     *   **1C** is a ledger posting: accounts, counterparties and VAT on its own
     *   line. That mapping lives in `finance` on the server and the browser
     *   holds none of it.
     *
     *   **Email and Telegram** are `deliver` on the same endpoint, and it works
     *   from the report it is naming rather than from anything sent up.
     *
     * A screen whose rows are not a standard report has none of that, so the
     * press says so — the note under the picker already did — rather than
     * downloading the table on screen under the wrong extension, which is the
     * failure that gets a file mailed back a week later.
     */
    if (needsServer) {
      if (server === undefined) {
        flash.problem(t('serverOnly'));
        return;
      }

      /*
       * A page, not a file, and therefore a tab rather than a download. The
       * reader prints it or saves it as PDF from the browser's own dialogue,
       * which is also where they pick the printer — a choice no page can make
       * for them. `noopener` because a named window handed a reference back to
       * this one is a tab that can navigate the console away.
       */
      if (format === 'pdf') {
        window.open(
          `/documents?d=report&kind=${encodeURIComponent(server.kind)}&period=${encodeURIComponent(
            server.period,
          )}`,
          '_blank',
          'noopener,noreferrer',
        );
        onClose();
        return;
      }

      const dialect: Dialect = format === '1c' ? '1c' : 'csv';

      if (destination !== 'dl') {
        const target = server;

        onClose();

        void deliverFromServer(target, dialect, destination === 'mail' ? 'email' : 'telegram').then(
          (sent) => {
            if (sent.ok) {
              flash(`${name} · ${destination === 'mail' ? t('sentMail') : t('sentTelegram')}`);
              return;
            }

            flash.problem(sent.message ?? t('serverFailed'));
          },
        );

        return;
      }

      /*
       * 1C, downloaded. The only path here with no local fallback — the browser
       * cannot write a posting — so a failure is a failure and is said out
       * loud, unlike the CSV below.
       */
      const target = server;

      onClose();

      void downloadFromServer(target, dialect).then((delivered) => {
        if (delivered) flash(`${name} ${t('downloaded')}`);
        else flash.problem(t('serverFailed'));
      });

      return;
    }

    /*
     * The dialog closes first and the toast lands when the file does.
     *
     * Holding it open behind a spinner would be a modal a reader cannot leave
     * over a request that succeeds almost always and costs them nothing when it
     * does not — the browser writes the same table locally on any failure.
     */
    if (fromServer && server !== undefined) {
      const target = server;

      onClose();

      void downloadFromServer(target, 'csv').then((delivered) => {
        if (!delivered) writeFile();

        flash(`${name} ${t('downloaded')}`);
      });

      return;
    }

    writeFile();
    flash(`${name} ${t('downloaded')}`);
    onClose();
  };

  const chip = (on: boolean) =>
    on
      ? 'border-brand-500 bg-brand-50 text-brand-700'
      : 'border-border-strong bg-surface text-fg-muted';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5">
      <button
        type="button"
        aria-label={labels.cancel}
        onClick={onClose}
        data-scrim
        className="absolute inset-0 bg-black/40"
      />

      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        tabIndex={-1}
        data-sheet
        data-scroll
        className="bg-surface-raised relative max-h-[86vh] w-full max-w-[440px] overflow-y-auto rounded-xl border p-6 shadow-xl"
      >
        <h2 className="font-display text-xl font-bold tracking-tight">{labels.title}</h2>
        <p className="text-fg-muted mt-1.5 text-sm leading-normal">{labels.body}</p>

        {/* ---------------------------------------------------------- format */}
        <fieldset className="mt-5">
          <legend className="text-fg-subtle text-xs font-semibold">{labels.format}</legend>

          <div className="mt-2 flex gap-2">
            {FORMATS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={format === entry.key}
                onClick={() => setFormat(entry.key)}
                className={`h-[38px] flex-1 rounded-md border text-sm font-semibold ${chip(
                  format === entry.key,
                )}`}
              >
                {entry.key === 'csv'
                  ? labels.csv
                  : entry.key === 'xlsx'
                    ? labels.excel
                    : entry.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* ----------------------------------------------------------- scope */}
        <fieldset className="mt-[18px]">
          <legend className="text-fg-subtle text-xs font-semibold">{t('scope')}</legend>

          <div className="mt-2 flex flex-col gap-[7px]">
            {choices.map((choice, index) => (
              <button
                key={choice.key}
                type="button"
                aria-pressed={scope === index}
                onClick={() => setScope(index)}
                className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left ${chip(
                  scope === index,
                )}`}
              >
                <span
                  aria-hidden
                  className={`rounded-pill grid size-[15px] flex-none place-items-center border-[1.5px] ${
                    scope === index ? 'border-brand-500' : 'border-border-strong'
                  }`}
                >
                  <span
                    className={`rounded-pill size-[7px] ${scope === index ? 'bg-brand-500' : ''}`}
                  />
                </span>
                <span className="text-fg flex-1 text-sm font-medium">{choice.label}</span>
                <span data-num className="text-fg-subtle text-xs">
                  {choice.count}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* --------------------------------------------------------- columns */}
        <div className="mt-[18px] flex items-baseline justify-between">
          <span className="text-fg-subtle text-xs font-semibold">{t('columns')}</span>
          <button
            type="button"
            onClick={() => setDropped(dropped.length === 0 ? columns.map((_, i) => i) : [])}
            className="text-fg-brand text-xs font-semibold hover:underline"
          >
            {dropped.length === 0 ? t('clearAll') : t('selectAll')}
          </button>
        </div>

        <div className="mt-[9px] flex flex-wrap gap-1.5">
          {columns.map((column, index) => {
            const on = !dropped.includes(index);

            return (
              <button
                key={`${column}-${index}`}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDropped(
                    on ? [...dropped, index] : dropped.filter((dropIndex) => dropIndex !== index),
                  )
                }
                className={`rounded-pill flex h-[30px] items-center gap-[7px] border px-[11px] text-xs font-semibold ${
                  on
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-border-strong bg-surface text-fg-muted'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid size-[13px] flex-none place-items-center rounded-[4px] border-[1.5px] ${
                    on ? 'border-brand-500 bg-brand-500' : 'border-border-strong'
                  }`}
                >
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: on ? 1 : 0 }}
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {column}
              </button>
            );
          })}
        </div>

        {/* ----------------------------------------------------- destination */}
        <fieldset className="mt-[18px]">
          <legend className="text-fg-subtle text-xs font-semibold">{t('deliverTo')}</legend>

          <div className="mt-2 flex gap-2">
            {(
              [
                ['dl', t('destDownload')],
                ['mail', t('destMail')],
                ['tg', TELEGRAM],
              ] as const
            ).map(([key, label]) => {
              /* Disabled rather than hidden: the design draws three and a row
                 that loses a button when a format is picked reads as a bug.
                 Greyed, it reads as what it is — not available for this file. */
              const off = key !== 'dl' && !sendable;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={off}
                  aria-pressed={destination === key}
                  onClick={() => setChosen(key)}
                  className={`h-9 flex-1 rounded-md border text-xs font-semibold ${
                    destination === key
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-border-strong bg-surface text-fg-muted'
                  } ${off ? 'opacity-45' : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* ---------------------------------------------------- the file card */}
        <div className="bg-bg-subtle mt-4 flex items-center justify-between gap-3 rounded-md border px-3.5 py-3">
          <div className="min-w-0">
            <div data-num className="truncate font-mono text-xs font-semibold">
              {name}
            </div>
            <div data-num className="text-fg-subtle text-2xs mt-[3px]">
              {rowCount} {t('rows')} × {kept.length} {t('cols')}
            </div>
          </div>
          <span data-num className="text-fg-muted flex-none text-xs font-semibold">
            {size}
          </span>
        </div>

        <p className="text-fg-subtle mt-2.5 text-xs leading-normal">{note}</p>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="border-border-strong bg-surface text-fg h-[42px] flex-1 rounded-md border text-sm font-semibold"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={go}
            disabled={rows.length === 0}
            className="bg-brand-500 hover:bg-brand-600 h-[42px] flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-45"
          >
            {labels.download}
          </button>
        </div>

        <p className="text-fg-subtle mt-3 text-xs leading-normal">{labels.note}</p>
      </div>
    </div>
  );
}

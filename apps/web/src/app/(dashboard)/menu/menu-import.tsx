'use client';

import { useRef, useState } from 'react';
import { flash } from '@restaurant/ui';

import { ACTION, ACTION_PRIMARY, Pill } from '../screen';

/**
 * The Import tab's three steps, against `POST /api/v1/menu/import`.
 *
 * The design draws one button and a toast that reads "41 loaded · 2 skipped".
 * That sentence is the whole feature and it is not something a client can
 * compute: the sheet says "42 000" and only the server may decide that is
 * 4 200 000 tiyin, because every other price on this platform was decided by
 * the same function. So the panel is three presses of one endpoint —
 *
 *   1. **Choose a file.** Uploaded with no mapping and no `dry_run=false`,
 *      which is the API's default: it answers with the sheet's own header row,
 *      the mapping it recognised, and a full rehearsal of the import.
 *   2. **Map the columns.** Only needed when the headers are not ones the
 *      server knows — it says so with `menu.import_columns_unmapped` and sends
 *      the columns back, which is exactly what the dialog below is drawn from.
 *      Pressing it again re-runs the rehearsal with the chosen mapping.
 *   3. **Import.** The same file again with `dry_run=false`. Nothing is written
 *      before this press, and the numbers above it are what will happen.
 *
 * The file is re-uploaded each time rather than parked on the server behind an
 * upload id. A menu CSV is a few tens of kilobytes over a restaurant's own
 * Wi-Fi, and the alternative is server-side state with an expiry that will one
 * day catch a manager mid-dialog.
 */

/** What the API answers with — the same shape for a rehearsal and a write. */
export type ImportReport = {
  dry_run: boolean;
  locale: string;
  columns: string[];
  /** Sheet column name → field. What the server resolved, not what was asked. */
  mapping: Record<string, string>;
  summary: { rows: number; created: number; updated: number; skipped: number };
  /** Sections the sheet named that the restaurant did not have. */
  categories_created: string[];
  /** Per-row refusals, capped by the API — see `rows_truncated`. */
  rows: { row: number; reason: string }[];
  rows_truncated: boolean;
};

/**
 * The eight fields a column may feed.
 *
 * Mirrors `MenuSheetImporter::FIELDS` and is only ever used to draw the
 * dialog's options — the server resolves the mapping again on arrival, so a
 * browser that sent a ninth would be refused rather than believed.
 */
const FIELDS = [
  'name',
  'category',
  'price',
  'cost',
  'station',
  'allergens',
  'sku',
  'description',
] as const;

type Labels = {
  upload: string;
  map: string;
  recheck: string;
  apply: string;
  checking: string;
  writing: string;
  hint: string;
  file: string;
  reportDry: string;
  reportWritten: string;
  rows: string;
  created: string;
  updated: string;
  skipped: string;
  newCategories: string;
  refusals: string;
  /** `{n}-qator` — the sheet's own row number, header counted as row 1. */
  rowNumber: string;
  /** `Faqat birinchi {n} tasi ko'rsatilgan.` */
  truncated: string;
  /** `{created} ta yangi · {updated} ta yangilandi · {skipped} ta o'tkazib yuborildi` */
  done: string;
  failed: string;
  nothing: string;
  mapTitle: string;
  ignore: string;
  /** Field key → the word the console calls it, e.g. `price` → `Narx`. */
  fields: Record<string, string>;
};

/** The API's error envelope, narrowed to what this panel reads. */
type Envelope = {
  error?: {
    code?: string;
    message_uz?: string;
    message_ru?: string;
    message_en?: string;
    /** `menu.import_columns_unmapped` sends the header row back with it. */
    columns?: string[];
    mapping?: Record<string, string>;
  };
};

export function MenuImport({ labels, lang }: { labels: Labels; lang: 'uz' | 'ru' | 'en' }) {
  const picker = useRef<HTMLInputElement>(null);

  /*
   * The chosen file stays in state because every step re-sends it. A `File`
   * handle is a reference to something on disk rather than the bytes, so
   * holding one across a mapping dialog costs nothing.
   */
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'checking' | 'writing' | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mapOpen, setMapOpen] = useState(false);

  async function send(chosen: File, columnMap: Record<string, string>, dryRun: boolean) {
    setBusy(dryRun ? 'checking' : 'writing');

    const body = new FormData();
    body.append('file', chosen);
    body.append('dry_run', dryRun ? 'true' : 'false');

    // Only when a human answered the dialog. An empty object would still be
    // sent and read as "map nothing", which is not the same as "guess".
    if (Object.keys(columnMap).length > 0) {
      body.append('mapping', JSON.stringify(columnMap));
    }

    let response: Response;
    let payload: unknown = null;

    try {
      response = await fetch('/api/menu/import', { method: 'POST', body });
      payload = await response.json();
    } catch {
      // The network, not the API. A different sentence, because one is "try
      // again" and the other is "this file cannot be imported".
      setBusy(null);
      flash.problem(labels.failed);

      return;
    }

    setBusy(null);

    if (!response.ok) {
      const envelope = (payload ?? {}) as Envelope;
      const error = envelope.error;

      /*
       * The one refusal that is a question rather than a no: the server did not
       * recognise the headers and sent them back so somebody can point at them.
       * Opening the dialog IS the answer to it.
       */
      if (error?.code === 'menu.import_columns_unmapped' && Array.isArray(error.columns)) {
        setColumns(error.columns);
        setMapping(error.mapping ?? {});
        setMapOpen(true);
      }

      // The API's own sentence when it sent one — it carries the reason in the
      // reader's language, which is more use than anything this panel could
      // invent about a file it never parsed.
      flash.problem(error?.[`message_${lang}`] ?? labels.failed);

      return;
    }

    const answer = (payload as { data: ImportReport }).data;

    setReport(answer);
    setColumns(answer.columns);
    // The server's resolution, not the request's: a column the browser mapped
    // to a field another column already holds is dropped upstream, and the
    // dialog has to show what actually happened.
    setMapping(answer.mapping);

    if (!dryRun) {
      setMapOpen(false);
    }

    const { created, updated, skipped } = answer.summary;

    if (dryRun && created + updated === 0) {
      flash.problem(labels.nothing);

      return;
    }

    flash(
      labels.done
        .replace('{created}', String(created))
        .replace('{updated}', String(updated))
        .replace('{skipped}', String(skipped)),
    );
  }

  function choose(chosen: File | undefined) {
    if (chosen === undefined) return;

    setFile(chosen);
    setReport(null);
    setMapOpen(false);
    // No mapping on the first press: the server guesses, and only says
    // otherwise when it cannot.
    setMapping({});
    void send(chosen, {}, true);
  }

  // Nothing to write is not a failure — it is a sheet whose every row was
  // refused, and the list below already says why for each of them.
  const writable = report !== null && report.summary.created + report.summary.updated > 0;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          ref={picker}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          aria-label={labels.file}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            // Cleared so choosing the SAME file again re-runs: an accountant
            // fixes two rows in Excel and picks the identical filename, and a
            // change event that never fires reads as a broken button.
            event.target.value = '';
          }}
        />

        <button
          type="button"
          data-press
          className={ACTION_PRIMARY}
          disabled={busy !== null}
          onClick={() => picker.current?.click()}
        >
          {busy === 'checking' ? labels.checking : labels.upload}
        </button>

        {columns.length > 0 && (
          <button
            type="button"
            data-press
            className={ACTION}
            disabled={busy !== null || file === null}
            onClick={() => {
              if (!mapOpen) {
                setMapOpen(true);

                return;
              }

              if (file !== null) void send(file, mapping, true);
            }}
          >
            {mapOpen ? labels.recheck : labels.map}
          </button>
        )}

        <button
          type="button"
          data-press
          className={ACTION}
          disabled={busy !== null || file === null || !writable}
          onClick={() => {
            if (file !== null) void send(file, mapping, false);
          }}
        >
          {busy === 'writing' ? labels.writing : labels.apply}
        </button>

        <span className="text-fg-subtle text-xs">{file === null ? labels.hint : file.name}</span>
      </div>

      {mapOpen && columns.length > 0 && (
        <section className="border-divider mt-4 rounded-lg border p-4">
          <h4 className="text-2xs tracking-caps text-fg-subtle mb-2.5 font-semibold uppercase">
            {labels.mapTitle}
          </h4>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {columns.map((column) => (
              <label key={column} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{column}</span>
                <select
                  className="bg-surface h-8 rounded-md border px-2 text-sm"
                  value={mapping[column] ?? ''}
                  onChange={(event) => {
                    const field = event.target.value;

                    setMapping((current) => {
                      const next = { ...current };

                      // An empty option means "ignore this column", and that
                      // has to delete the key rather than store a blank: the
                      // API validates every value against its eight fields.
                      if (field === '') delete next[column];
                      else next[column] = field;

                      return next;
                    });
                  }}
                >
                  <option value="">{labels.ignore}</option>
                  {FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {labels.fields[field] ?? field}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {report !== null && (
        <section className="border-divider mt-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={report.dry_run ? 'warning' : 'success'}>
              {report.dry_run ? labels.reportDry : labels.reportWritten}
            </Pill>

            <Figure label={labels.rows} value={report.summary.rows} />
            <Figure label={labels.created} value={report.summary.created} />
            <Figure label={labels.updated} value={report.summary.updated} />
            <Figure label={labels.skipped} value={report.summary.skipped} />
          </div>

          {report.categories_created.length > 0 && (
            <p className="text-fg-muted mt-3 text-xs leading-normal">
              {labels.newCategories} · {report.categories_created.join(' · ')}
            </p>
          )}

          {report.rows.length > 0 && (
            <>
              <h4 className="text-2xs tracking-caps text-fg-subtle mt-4 mb-2 font-semibold uppercase">
                {labels.refusals}
              </h4>

              <ul className="flex flex-col gap-1.5">
                {report.rows.map((row) => (
                  <li key={row.row} className="flex gap-2.5 text-xs leading-normal">
                    <span data-num className="text-fg-subtle shrink-0">
                      {labels.rowNumber.replace('{n}', String(row.row))}
                    </span>
                    <span className="text-fg-muted">{row.reason}</span>
                  </li>
                ))}
              </ul>

              {report.rows_truncated && (
                <p className="text-fg-subtle mt-2 text-xs">
                  {labels.truncated.replace('{n}', String(report.rows.length))}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** One figure of the summary, said as a number and the word for it. */
function Figure({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-fg-muted text-xs">
      <span data-num className="text-fg font-semibold">
        {value}
      </span>{' '}
      {label}
    </span>
  );
}

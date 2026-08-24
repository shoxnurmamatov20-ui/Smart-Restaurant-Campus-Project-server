import type { ReportSheet } from './report-server';

/**
 * A standard report on A4 — the sheet behind the export dialog's PDF button.
 *
 * Not one of the design's seven, and it does not pretend to be: those are
 * statutory forms with a settled layout, and this is whatever table
 * `GET /analytics/reports/{kind}` answered. So it borrows the surface's paper,
 * its ink and its print button, and draws nothing of its own beyond a heading
 * and a table.
 *
 * **It is also the only sheet here that does not fit on one page**, which is
 * why the page wraps it in `data-paper="a4-flow"` rather than `a4`. The other
 * seven were each designed to fill exactly one sheet and `documents.css` clips
 * them on purpose; a report clipped at the fold is a printed table missing its
 * last forty rows with nothing on the paper to say so. See the `a4-flow` block
 * in `documents.css` — the header row repeats and rows are kept whole.
 */
const HEAD: React.CSSProperties = {
  padding: '7px 8px',
  fontSize: '7.5pt',
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--doc-fg-subtle)',
};

export function Report({ sheet }: { sheet: ReportSheet }) {
  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 12,
          borderBottom: '2px solid var(--doc-900)',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '18pt',
              fontWeight: 700,
              letterSpacing: '-.022em',
            }}
          >
            {sheet.title}
          </h1>
          {/* The window the API actually used, not the word that was asked for.
              "Oylik" is a button; `23.07.2026 — 21.08.2026` is what the figures
              below are about, and it is the only thing a reader can check. */}
          <div style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', marginTop: 3 }}>
            {sheet.window}
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontFamily: 'var(--font-mono)',
            fontSize: '9pt',
            lineHeight: 1.6,
            color: 'var(--doc-fg-muted)',
          }}
        >
          {/* A report runs to several pages, so the count is on the paper: it is
              how somebody holding sheet three of four knows sheet four exists. */}
          <div>{sheet.rows.length} qator</div>
        </div>
      </header>

      {sheet.rows.length === 0 ? (
        <p style={{ margin: '14px 0 0', fontSize: '10pt', color: 'var(--doc-fg-muted)' }}>
          Bu davrda hisobotda birorta ham qator yo‘q.
        </p>
      ) : (
        <table className="doc-table" style={{ marginTop: 12, fontSize: '9pt' }}>
          <thead>
            <tr
              style={{
                borderTop: '1px solid var(--doc-900)',
                borderBottom: '1px solid var(--doc-900)',
              }}
            >
              {sheet.columns.map((column, index) => (
                <th
                  key={`${column.label}-${index}`}
                  scope="col"
                  style={{ ...HEAD, textAlign: column.numeric ? 'right' : 'left' }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sheet.rows.map((row, index) => (
              <tr key={index} style={{ borderBottom: '1px solid var(--doc-divider)' }}>
                {row.map((value, cell) => (
                  <td
                    key={cell}
                    style={{
                      padding: '5px 8px',
                      textAlign: sheet.columns[cell]?.numeric ? 'right' : 'left',
                      /* Figures in the mono face so a column of them lines up
                         on the decimal, exactly as the other six sheets set
                         every amount they print. */
                      fontFamily: sheet.columns[cell]?.numeric ? 'var(--font-mono)' : undefined,
                    }}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          {sheet.totals === null ? null : (
            <tfoot>
              <tr
                style={{
                  borderTop: '1px solid var(--doc-900)',
                  background: 'var(--doc-25)',
                  fontWeight: 700,
                }}
              >
                {sheet.totals.map((value, cell) => (
                  <td
                    key={cell}
                    style={{
                      padding: '7px 8px',
                      textAlign: sheet.columns[cell]?.numeric ? 'right' : 'left',
                      fontFamily: sheet.columns[cell]?.numeric ? 'var(--font-mono)' : undefined,
                    }}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}

      <footer
        style={{
          marginTop: 'auto',
          paddingTop: 14,
          borderTop: '1px solid var(--doc-border)',
          fontSize: '8pt',
          lineHeight: 1.6,
          color: 'var(--doc-fg-muted)',
        }}
      >
        {/*
         * Two facts a reader needs before they act on the sheet, and neither is
         * visible in the table itself: what the amounts are in, and where the
         * day boundary falls. The console's export dialog says the same thing
         * about the file it writes — a report and its file disagreeing about
         * the business day is the disagreement that is found by whoever trusted
         * the paper.
         */}
        Summalar so‘mda, QQS bilan. Ish kuni 06:00 dan boshlanadi — kunlik qatorlar ertasi kuni
        05:59 gacha bo‘lgan cheklarni ham o‘z ichiga oladi.
      </footer>
    </>
  );
}

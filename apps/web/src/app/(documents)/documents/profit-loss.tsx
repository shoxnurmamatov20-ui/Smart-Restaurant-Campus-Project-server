import { deltaTone, money, type PlRow, type ProfitLossDoc } from './documents-data';

/**
 * 07 · profit and loss — `Hujjatlar.dc.html:491-547` and the `PL` table in its
 * script at :558-598.
 *
 * The only document here addressed to someone outside the restaurant who is not
 * a supplier: the owner and the bank. That decides its shape — VAT-exclusive
 * throughout, July beside June, a share-of-revenue column so a line can be read
 * without doing arithmetic, and four subtotals that are the four questions a
 * lender asks in order.
 *
 * Two places where this build departs from the design file's script, both
 * deliberate and both narrow:
 *
 *   **The net-profit row prints white on black.** The file computes its ink as
 *   `r[2] < 0 ? fg-muted : fg` and its background as `n-900` for that row —
 *   dark ink on a dark band, which renders the most important figure in the
 *   document invisible. `specs/02-documents.md §4.7` asks for "net profit on a
 *   black row", and the payslip's own black band two pages earlier sets its
 *   text to `#fff`. Both agree, and an unreadable row cannot be what was drawn.
 *
 *   **The change column colours by the sign of the row, not by whether it is a
 *   subtotal.** The file's `good = isTot ? up : !up` treats every detail row as
 *   a cost and prints the four revenue lines' growth in red. The build reads
 *   the row's own figure — positive is income, negative is cost — which is the
 *   discriminator the file's data already carries. Twenty rows agree with the
 *   file; four are corrected; `documents-fidelity.test.ts` pins exactly which.
 *   See `deltaTone` in `documents-data.ts`.
 *
 * `?period=today|week|month` builds the statement from `analytics/summary` and
 * `finance/expenses`. It is always shorter than the specimen and always marked
 * incomplete, because the cost of sales, the depreciation, the interest and the
 * tax have no module behind them — `documents-server.ts` sets out each gap and
 * why filling it from the specimen was refused.
 */
const HEAD: React.CSSProperties = {
  padding: '7px 8px',
  fontSize: '7.5pt',
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--doc-fg-subtle)',
  textAlign: 'right',
};

const COLUMN_WIDTH: readonly (number | undefined)[] = [undefined, 104, 56, 104, 64];

const DELTA_INK = {
  neutral: 'var(--doc-fg-subtle)',
  good: 'var(--doc-success-600)',
  bad: 'var(--doc-danger-600)',
} as const;

export function ProfitLoss({
  statement,
  rows,
}: {
  statement: ProfitLossDoc;
  rows: readonly PlRow[];
}) {
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
            {statement.title}
          </h1>
          <div style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', marginTop: 3 }}>
            {statement.subtitle}
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontSize: '8.5pt',
            color: 'var(--doc-fg-muted)',
            lineHeight: 1.55,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '11pt',
              fontWeight: 800,
              color: 'var(--doc-fg)',
              letterSpacing: '-.02em',
            }}
          >
            {statement.venue}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', marginTop: 3 }}>{statement.number}</div>
          <div>{statement.issued}</div>
        </div>
      </header>

      <table className="doc-table" style={{ marginTop: 11, fontSize: '8.5pt' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--doc-900)' }}>
            {statement.columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                style={{
                  ...HEAD,
                  /* The measure's name is the only left-aligned cell; every
                     other column is a figure and reads down its right edge. */
                  textAlign: index === 0 ? 'left' : 'right',
                  padding: index === 0 ? '5px 8px' : '7px 8px',
                  width: COLUMN_WIDTH[index],
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <Row key={row.label} row={row} />
          ))}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          marginTop: 11,
          padding: '9px 12px',
          border: '1px solid var(--doc-border)',
          background: 'var(--doc-25)',
          fontSize: '8pt',
        }}
      >
        {/* The three ratios a restaurant is actually run on, each against the
            number it is supposed to beat. A percentage with nothing to compare
            it to is a fact; with the target beside it, it is a decision. */}
        {statement.ratios.map((ratio) => (
          <span key={ratio.label}>
            <span style={{ color: 'var(--doc-fg-subtle)' }}>{ratio.label}</span>{' '}
            <b style={{ fontFamily: 'var(--font-mono)' }}>{ratio.value}</b>{' '}
            <span
              style={{
                color: ratio.tone === 'good' ? 'var(--doc-success-600)' : 'var(--doc-warning-600)',
              }}
            >
              {ratio.against}
            </span>
          </span>
        ))}
      </div>

      <p
        style={{
          margin: '9px 0 0',
          padding: '9px 12px',
          border: '1px solid var(--doc-border)',
          borderLeft: '3px solid var(--doc-brand)',
          fontSize: '7.5pt',
          lineHeight: 1.55,
          color: 'var(--doc-fg-muted)',
        }}
      >
        <b style={{ color: 'var(--doc-fg)' }}>{statement.method.lead}</b> {statement.method.body}
      </p>

      <footer
        style={{
          marginTop: 'auto',
          paddingTop: 14,
          borderTop: '1px solid var(--doc-border)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20mm',
        }}
      >
        {statement.signatures.map((signature) => (
          <div key={signature}>
            <div className="doc-sign" />
            <div style={{ fontSize: '8pt', color: 'var(--doc-fg-muted)', marginTop: 4 }}>
              {signature}
            </div>
          </div>
        ))}
      </footer>
    </>
  );
}

function Row({ row }: { row: PlRow }) {
  const heading = row.kind === 'h';
  const total = row.kind === 't' || row.kind === 'f';
  const net = row.kind === 'f';

  const pad = heading ? '6px' : total ? '5px' : '2.5px';
  const cell: React.CSSProperties = {
    padding: `${pad} 8px`,
    textAlign: 'right',
    fontFamily: 'var(--font-mono)',
  };

  /* See the note at the top of the file: on the black band every ink token in
     the design's own formula resolves to something invisible, so the whole row
     is set in white. */
  const ink = (colour: string): string | undefined => (net ? '#fff' : colour);

  return (
    <tr
      style={{
        borderBottom: `1px solid ${heading || total ? 'var(--doc-900)' : 'var(--doc-divider)'}`,
        background: net ? 'var(--doc-900)' : total ? 'var(--doc-25)' : undefined,
        color: net ? '#fff' : undefined,
      }}
    >
      <td
        style={{
          padding: `${pad} 8px`,
          fontWeight: heading || total ? (heading ? 600 : 700) : 400,
          /* Detail lines are indented ten points past their heading, which is
             the whole visual hierarchy of the statement. */
          paddingLeft: total || heading ? 8 : 18,
        }}
      >
        {row.label}
      </td>

      {heading ? (
        <>
          <td style={cell} />
          <td style={cell} />
          <td style={cell} />
          <td style={cell} />
        </>
      ) : (
        <>
          <td
            style={{
              ...cell,
              fontWeight: total ? 700 : 400,
              color: ink(row.value < 0 ? 'var(--doc-fg-muted)' : 'var(--doc-fg)'),
            }}
          >
            {row.value < 0 ? `−${money(row.value)}` : money(row.value)}
          </td>
          <td style={{ ...cell, fontSize: '8.5pt', color: ink('var(--doc-fg-subtle)') }}>
            {row.share}%
          </td>
          {/* Blank, not zero, when there is nothing to compare against — see
              `PlRow.previous`. A live statement has a June column for its
              revenue subtotal and for nothing else. */}
          <td style={{ ...cell, color: ink('var(--doc-fg-muted)') }}>
            {row.previous === null
              ? ''
              : row.previous < 0
                ? `−${money(row.previous)}`
                : money(row.previous)}
          </td>
          <td
            style={{
              ...cell,
              fontSize: '8.5pt',
              fontWeight: 600,
              color: ink(DELTA_INK[deltaTone(row)]),
            }}
          >
            {row.delta}
          </td>
        </>
      )}
    </tr>
  );
}

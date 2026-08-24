import type { StockCountDoc } from './documents-data';

/**
 * 05 · the count sheet — `Hujjatlar.dc.html:363-424`.
 *
 * The one document in the folder that is printed **empty**, and the only one
 * whose empty state is the design rather than a failure. `specs/02-documents.md
 * §5` records it exactly that way: "stock count sheet is the empty state by
 * design".
 *
 * The warning band explains the whole sheet and is the reason it exists: a
 * count sheet carrying the system's own figure stops being a count. The
 * storekeeper reads 40 kg, sees roughly forty kilos of meat, and writes 40 —
 * and the 3 kg that walked out of the cold room on Tuesday is now confirmed
 * rather than found. So the quantity columns are ruled blanks and the system's
 * number stays on the system's side of the door until the sheet comes back.
 *
 * Which makes this the easiest of the seven to wire and the one with the most
 * to lose from wiring it carelessly: the endpoint must never be asked for
 * on-hand quantities, only for the list. `?store=` names a store room and
 * `documents-server.ts` reads `GET /inventory/ingredients` for it — a row type
 * with nowhere to put a quantity is what keeps the rule from being undone by a
 * later change.
 */
const HEAD: React.CSSProperties = {
  padding: '7px 8px',
  fontSize: '7.5pt',
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--doc-fg-subtle)',
};

/** `№`, name, place, unit, counted, spoiled, note — the design's own widths. */
const COLUMNS: readonly {
  readonly width?: number;
  readonly align: 'left' | 'center';
}[] = [
  { width: 26, align: 'left' },
  { align: 'left' },
  { width: 70, align: 'left' },
  { width: 52, align: 'left' },
  { width: 88, align: 'center' },
  { width: 88, align: 'center' },
  { width: 74, align: 'left' },
];

export function StockCount({ sheet }: { sheet: StockCountDoc }) {
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
          <div style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', marginTop: 3 }}>
            {sheet.subtitle}
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontFamily: 'var(--font-mono)',
            fontSize: '9pt',
            lineHeight: 1.6,
          }}
        >
          <div>{sheet.number}</div>
          <div style={{ color: 'var(--doc-fg-muted)' }}>{sheet.date}</div>
          {/* After the shift closes, not during it: a count taken while the
              kitchen is still drawing stock measures nothing. */}
          <div style={{ color: 'var(--doc-fg-muted)' }}>{sheet.time}</div>
        </div>
      </header>

      <p
        style={{
          display: 'flex',
          gap: 10,
          margin: '12px 0 0',
          padding: '10px 12px',
          border: '1px solid var(--doc-border)',
          borderLeft: '3px solid var(--doc-warning-500)',
          background: 'var(--doc-warning-50)',
          fontSize: '9pt',
          lineHeight: 1.6,
        }}
      >
        <span>
          <b>{sheet.warning.lead}</b> {sheet.warning.body}
        </span>
      </p>

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
                key={column}
                scope="col"
                style={{
                  ...HEAD,
                  textAlign: COLUMNS[index]?.align ?? 'left',
                  width: COLUMNS[index]?.width,
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sheet.rows.map((row, index) => (
            <tr key={row.name} style={{ borderBottom: '1px solid var(--doc-divider)' }}>
              <td
                style={{
                  padding: '7px 8px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--doc-fg-subtle)',
                }}
              >
                {index + 1}
              </td>
              <td style={{ padding: '7px 8px', fontWeight: 500 }}>{row.name}</td>
              <td style={{ padding: '7px 8px', color: 'var(--doc-fg-muted)', fontSize: '8.5pt' }}>
                {row.location}
              </td>
              <td
                style={{
                  padding: '7px 8px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--doc-fg-muted)',
                }}
              >
                {row.unit}
              </td>
              {/* Three blanks, and the third is fainter: counted and spoiled are
                  required, the note is not. */}
              <td style={{ padding: '7px 8px' }}>
                <span className="doc-blank" />
              </td>
              <td style={{ padding: '7px 8px' }}>
                <span className="doc-blank" />
              </td>
              <td style={{ padding: '7px 8px' }}>
                <span className="doc-blank" style={{ borderBottomColor: 'var(--doc-200)' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer
        style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--doc-border)' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14mm' }}>
          {sheet.signatures.map((signature) => (
            <div key={signature}>
              <div className="doc-sign" />
              <div style={{ fontSize: '8pt', color: 'var(--doc-fg-muted)', marginTop: 4 }}>
                {signature}
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            margin: '12px 0 0',
            fontSize: '8pt',
            lineHeight: 1.6,
            color: 'var(--doc-fg-muted)',
          }}
        >
          {sheet.footnote}
        </p>
      </footer>
    </>
  );
}

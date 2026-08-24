import { formatNumber } from '@restaurant/utils';

import { money, type InvoiceDoc, type PartyBlock } from './documents-data';

/**
 * 04 · the purchase order — `Hujjatlar.dc.html:291-361`.
 *
 * Titled "Xarid buyurtmasi" in the design file while `specs/02-documents.md
 * §4.6` calls this page an invoice. The file wins, and the difference is not
 * cosmetic: an invoice is a demand for money and this is an order for goods,
 * which is why it carries acceptance conditions, a receiving window and two
 * signatures rather than bank details.
 *
 * It is also the one document here a stranger reads. Everything on it is
 * addressed outward — the supplier's sales manager, their driver, and whoever
 * refuses the delivery at 07:00 if the meat arrives at the wrong temperature.
 *
 * `?po=` names a real order; `documents-server.ts` reads it from
 * `GET /suppliers/purchase-orders/{id}`.
 */
const HEAD: React.CSSProperties = {
  padding: '7px 8px',
  fontSize: '7.5pt',
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--doc-fg-subtle)',
};

const COLUMN_WIDTH: readonly (number | undefined)[] = [26, undefined, 60, 52, 78, 88];

export function Invoice({ invoice }: { invoice: InvoiceDoc }) {
  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '11pt',
              fontWeight: 800,
              letterSpacing: '-.02em',
            }}
          >
            {invoice.seller.name}
          </div>
          <div
            style={{
              fontSize: '8.5pt',
              color: 'var(--doc-fg-muted)',
              lineHeight: 1.5,
              marginTop: 3,
            }}
          >
            {invoice.seller.legal}
            <br />
            {invoice.seller.address}
            <br />
            {invoice.seller.registration}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18pt',
              fontWeight: 700,
              letterSpacing: '-.022em',
            }}
          >
            {invoice.title}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9pt', marginTop: 3 }}>
            {invoice.number}
          </div>
          <div style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', marginTop: 2 }}>
            {invoice.date}
          </div>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          marginTop: 14,
          paddingTop: 12,
          borderTop: '2px solid var(--doc-900)',
        }}
      >
        <Party block={invoice.supplier} />
        <Party block={invoice.delivery} />
      </div>

      <table className="doc-table" style={{ marginTop: 14, fontSize: '9pt' }}>
        <thead>
          <tr
            style={{
              borderTop: '1px solid var(--doc-900)',
              borderBottom: '1px solid var(--doc-900)',
            }}
          >
            {invoice.columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                style={{
                  ...HEAD,
                  /* Money and counts right, words left — the design's split, and
                     the reason a column of totals can be added up by eye. */
                  textAlign: index >= 3 ? 'right' : 'left',
                  width: COLUMN_WIDTH[index],
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody style={{ fontFamily: 'var(--font-mono)' }}>
          {invoice.lines.map((line, index) => (
            <tr key={line.name} style={{ borderBottom: '1px solid var(--doc-divider)' }}>
              <td style={{ padding: '6px 8px' }}>{index + 1}</td>
              {/* The name is the one cell set in the text face: it is read, not
                  compared, and a mono column of ingredient names is slower. */}
              <td style={{ padding: '6px 8px', fontFamily: 'var(--font-sans)' }}>{line.name}</td>
              <td style={{ padding: '6px 8px' }}>{line.unit}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                {formatNumber(line.quantity, 'uz')}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(line.price)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <div style={{ width: '78mm', fontFamily: 'var(--font-mono)', fontSize: '9pt' }}>
          <div className="doc-line" style={{ padding: '4px 8px' }}>
            <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--doc-fg-muted)' }}>
              {invoice.netLabel}
            </span>
            <span>{money(invoice.net)}</span>
          </div>
          <div className="doc-line" style={{ padding: '4px 8px' }}>
            <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--doc-fg-muted)' }}>
              {invoice.vatLabel}
            </span>
            <span>{money(invoice.vat)}</span>
          </div>
          {/*
           * VAT is added here, unlike everywhere else in this folder. A menu
           * price contains its VAT (Q1); a supplier quotes net and adds it. The
           * two conventions sit two documents apart and mixing them up is worth
           * 12% of a meat order.
           */}
          <div
            className="doc-line"
            style={{ padding: 8, borderTop: '1px solid var(--doc-900)', marginTop: 3 }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '11pt', fontWeight: 700 }}>
              {invoice.dueLabel}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '13pt', fontWeight: 800 }}>
              {money(invoice.due)}
            </span>
          </div>
        </div>
      </div>

      <p
        style={{
          margin: '12px 0 0',
          padding: '10px 12px',
          border: '1px solid var(--doc-border)',
          background: 'var(--doc-25)',
          fontSize: '8.5pt',
          lineHeight: 1.6,
          color: 'var(--doc-fg-muted)',
        }}
      >
        <b style={{ color: 'var(--doc-fg)' }}>{invoice.terms.lead}</b> {invoice.terms.body}
      </p>

      <footer
        style={{
          marginTop: 'auto',
          paddingTop: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20mm',
        }}
      >
        {invoice.signatures.map((signature) => (
          <div key={signature.line}>
            <div style={{ borderBottom: '1px solid var(--doc-900)', height: 26 }} />
            <div style={{ fontSize: '8pt', color: 'var(--doc-fg-muted)', marginTop: 4 }}>
              {signature.line}
            </div>
            <div style={{ fontSize: '8pt', color: 'var(--doc-fg-subtle)', marginTop: 10 }}>
              {signature.below}
            </div>
          </div>
        ))}
      </footer>
    </>
  );
}

function Party({ block }: { block: PartyBlock }) {
  return (
    <div>
      <div
        style={{
          fontSize: '7.5pt',
          fontWeight: 600,
          letterSpacing: '.09em',
          textTransform: 'uppercase',
          color: 'var(--doc-fg-subtle)',
        }}
      >
        {block.label}
      </div>
      <div style={{ fontSize: '11pt', fontWeight: 700, marginTop: 4 }}>{block.name}</div>
      <div
        style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', lineHeight: 1.55, marginTop: 3 }}
      >
        {block.lines.map((line, index) => (
          <span key={line}>
            {index > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

import {
  money,
  signedMoney,
  type PayslipDoc,
  type PayslipFacts,
  type PayslipRow,
} from './documents-data';

/**
 * 06 · the payslip — `Hujjatlar.dc.html:426-489`.
 *
 * Written to be argued with. Every earned line carries its working in the
 * middle column — `144 × 26 000`, `46 800 000 × 3%`, `144 / 1 042 soat` —
 * because the alternative is a waiter who is told a number and has no way to
 * check it, and the one line nobody can reconstruct on their own is the service
 * charge: their hours over the whole branch's hours, against a pool that only
 * exists once the month is closed.
 *
 * The deductions carry the same burden and two of them are red, which is the
 * design's judgement rather than a tone choice: a late arrival and a broken
 * plate are things the employee can change, an advance and income tax are not.
 *
 * `?member=` names an employee and `?month=` a period. A live sheet is always
 * incomplete and the surface says so: hours and basic pay come from attendance,
 * and every other row on this design — the service-charge share above all — has
 * no table behind it. `documents-server.ts` sets out which and why.
 */
export function Payslip({ payslip }: { payslip: PayslipDoc }) {
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
            {payslip.title}
          </h1>
          <div style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', marginTop: 3 }}>
            {payslip.subtitle}
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
            {payslip.venue}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', marginTop: 3 }}>{payslip.number}</div>
          <div>{payslip.issued}</div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <Facts block={payslip.employee} />
        <Facts block={payslip.period} />
      </div>

      <table className="doc-table" style={{ marginTop: 14, fontSize: '9.5pt' }}>
        <tbody>
          <tr style={{ borderTop: '1px solid var(--doc-900)' }}>
            <th colSpan={3} scope="colgroup" style={SECTION}>
              {payslip.earnedTitle}
            </th>
          </tr>
          {payslip.earned.map((row) => (
            <Row key={row.label} row={row} />
          ))}
          <Total label={payslip.earnedTotal.label} amount={payslip.earnedTotal.amount} />

          <tr>
            <th colSpan={3} scope="colgroup" style={{ ...SECTION, padding: '12px 8px 8px' }}>
              {payslip.deductedTitle}
            </th>
          </tr>
          {payslip.deducted.map((row) => (
            <Row key={row.label} row={row} />
          ))}
          <Total label={payslip.deductedTotal.label} amount={payslip.deductedTotal.amount} />
        </tbody>
      </table>

      {/*
       * The one figure the employee actually looks for, on a black band so the
       * eye lands on it before anything else. Its payment details sit under it
       * rather than beside it — "which card, which day" is the second question,
       * and it is always asked.
       */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginTop: 14,
          padding: '14px 16px',
          background: 'var(--doc-900)',
          color: '#fff',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '8pt',
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
          >
            {payslip.netLabel}
          </div>
          <div style={{ fontSize: '8pt', opacity: 0.7, marginTop: 2 }}>{payslip.netNote}</div>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22pt',
            fontWeight: 800,
            letterSpacing: '-.022em',
          }}
        >
          {money(payslip.net)}
        </div>
      </div>

      <footer style={{ marginTop: 'auto', paddingTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20mm' }}>
          {payslip.signatures.map((signature) => (
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
          {payslip.footnote}
        </p>
      </footer>
    </>
  );
}

const SECTION: React.CSSProperties = {
  padding: 8,
  fontSize: '7.5pt',
  fontWeight: 600,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--doc-fg-subtle)',
  textAlign: 'left',
};

const TONE: Readonly<Record<'accent' | 'danger', string>> = {
  accent: 'var(--doc-accent-600)',
  danger: 'var(--doc-danger-600)',
};

function Row({ row }: { row: PayslipRow }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--doc-divider)' }}>
      <td style={{ padding: '7px 8px' }}>
        {row.label}
        {row.note === undefined ? null : (
          <div style={{ fontSize: '8pt', color: 'var(--doc-fg-subtle)', marginTop: 2 }}>
            {row.note}
          </div>
        )}
      </td>
      <td
        style={{
          padding: '7px 8px',
          textAlign: 'right',
          color: 'var(--doc-fg-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: '8.5pt',
        }}
      >
        {row.working ?? ''}
      </td>
      <td
        style={{
          padding: '7px 8px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          width: 100,
          color: row.tone === undefined ? undefined : TONE[row.tone],
        }}
      >
        {/* Deductions are stored negative and print with their sign, so the two
            halves of the sheet can never be confused for one another. */}
        {row.amount < 0 ? signedMoney(row.amount) : money(row.amount)}
      </td>
    </tr>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--doc-900)', background: 'var(--doc-25)' }}>
      <td style={{ padding: 8 }} colSpan={2}>
        <b>{label}</b>
      </td>
      <td
        style={{
          padding: 8,
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
        }}
      >
        {amount < 0 ? signedMoney(amount) : money(amount)}
      </td>
    </tr>
  );
}

function Facts({ block }: { block: PayslipFacts }) {
  return (
    <div style={{ border: '1px solid var(--doc-border)', padding: '12px 14px' }}>
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
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14pt',
          fontWeight: 700,
          letterSpacing: '-.02em',
          marginTop: 4,
        }}
      >
        {block.name}
      </div>
      <div
        style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', lineHeight: 1.6, marginTop: 4 }}
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

import { money, signedMoney, Z_HEAD, Z_NOTES, type ZReportDoc, type ZRow } from './documents-data';

/**
 * 03 · the Z report — `Hujjatlar.dc.html:203-289`.
 *
 * The document that closes a service day, and the only one of the seven that a
 * person signs before it is filed. Everything about how it is set follows from
 * that: the variance is the last figure and it is red, there is a ruled space
 * for the reason in the cashier's own handwriting, and two signature lines
 * below it.
 *
 * The three panels beside it are the design explaining the document, so they
 * are screen-only. The middle one is worth reading before touching any of this:
 * five different systems each count the same day, and the Z is one of the five.
 * If a change here makes the Z disagree with the fiscal module, the restaurant
 * finds out at an audit rather than at close.
 *
 * `?shift=` makes it a real shift's Z, read from
 * `GET /finance/shifts/{id}/report` by `documents-server.ts`. Nothing on this
 * page recomputes a figure of it — the closed document is frozen server-side so
 * that refunding one of yesterday's bills this afternoon cannot restate
 * yesterday's Z, and a printer deriving its own totals would undo exactly that.
 */
export function ZReport({ report, live }: { report: ZReportDoc; live: boolean }) {
  return (
    <>
      <header
        className="doc-screen-only"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          paddingBottom: 8,
          borderBottom: '1px solid var(--doc-900)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15pt',
            fontWeight: 700,
            letterSpacing: '-.02em',
          }}
        >
          {Z_HEAD.title}
        </div>
        <div
          style={{ fontFamily: 'var(--font-mono)', fontSize: '8pt', color: 'var(--doc-fg-subtle)' }}
        >
          {Z_HEAD.note}
        </div>
      </header>

      <div style={{ display: 'flex', gap: '12mm', marginTop: '10mm', alignItems: 'flex-start' }}>
        <Roll z={report} />
        <Explainers live={live} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------- the roll */

function Roll({ z }: { z: ZReportDoc }) {
  return (
    <article className="doc-strip">
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '14pt',
            fontWeight: 800,
            letterSpacing: '-.02em',
          }}
        >
          {z.title}
        </div>
        <div style={{ marginTop: 2 }}>{z.venue}</div>
        <div>{z.register}</div>
      </div>

      <div className="doc-rule" />

      {z.meta.map(([label, value]) => (
        <div className="doc-line" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}

      <div className="doc-rule" />

      <div style={{ fontWeight: 700 }}>{z.turnoverTitle}</div>
      {/* A count, printed as a count. Everything else on this roll is tiyin. */}
      <div className="doc-line">
        <span>{z.bills.label}</span>
        <span>{z.bills.count}</span>
      </div>
      {z.turnover.map((row) => (
        <Line key={row.label} row={row} />
      ))}
      <div
        className="doc-line"
        style={{
          fontWeight: 700,
          borderTop: '1px solid var(--doc-900)',
          marginTop: 4,
          paddingTop: 4,
        }}
      >
        <span>{z.turnoverTotal.label}</span>
        <span>{money(z.turnoverTotal.amount)}</span>
      </div>
      {/* The shift report carries no tax figure, so a live roll has no such
          row — see `ZReportDoc.turnoverVat`. */}
      {z.turnoverVat === null ? null : <Line row={z.turnoverVat} />}

      <div className="doc-rule" />

      <div style={{ fontWeight: 700 }}>{z.methodsTitle}</div>
      {z.methods.map((row) => (
        <Line key={row.label} row={row} />
      ))}

      <div className="doc-rule" />

      <div style={{ fontWeight: 700 }}>{z.drawerTitle}</div>
      {z.drawer.map((row) => (
        <Line key={row.label} row={row} />
      ))}
      {/*
       * Expected, then counted, then the gap — in that order and never the
       * other way round. The console's Z flow makes the same point at greater
       * length (`finance/till/till-reports.tsx`): a cashier who reads the
       * expected figure before counting counts towards it.
       */}
      <div className="doc-line" style={{ fontWeight: 700, marginTop: 3 }}>
        <span>{z.expected.label}</span>
        <span>{money(z.expected.amount)}</span>
      </div>
      <div className="doc-line" style={{ fontWeight: 700 }}>
        <span>{z.counted.label}</span>
        <span>{money(z.counted.amount)}</span>
      </div>
      <div
        className="doc-line"
        style={{
          fontWeight: 700,
          color: 'var(--doc-danger-600)',
          borderTop: '1px solid var(--doc-900)',
          marginTop: 4,
          paddingTop: 4,
        }}
      >
        <span>{z.variance.label}</span>
        <span>{signedMoney(z.variance.amount)}</span>
      </div>

      <div className="doc-rule" />

      <div style={{ fontWeight: 700 }}>{z.correctionsTitle}</div>
      {z.corrections.map(([label, count, amount]) => (
        <div className="doc-line" key={label}>
          <span>{label}</span>
          <span>
            {count} · {money(amount)}
          </span>
        </div>
      ))}
      <Line row={z.cardTips} />

      <div className="doc-rule" />

      {/* Ruled, not a text field: the reason is written on the paper the
          manager signs, so the two cannot be separated afterwards. */}
      <div style={{ lineHeight: 1.5 }}>
        {z.reasonLabel}
        <span className="doc-blank" style={{ height: 12 }} />
        <span className="doc-blank" style={{ height: 12 }} />
      </div>

      <div style={{ display: 'flex', gap: '6mm', marginTop: 8 }}>
        {z.signatures.map((name) => (
          <div key={name} style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid var(--doc-900)', height: 14 }} />
            <div style={{ fontSize: '7pt', marginTop: 2 }}>{name}</div>
          </div>
        ))}
      </div>
    </article>
  );
}

function Line({ row }: { row: ZRow }) {
  return (
    <div className="doc-line">
      <span>{row.label}</span>
      <span>{row.signed === true ? signedMoney(row.amount) : money(row.amount)}</span>
    </div>
  );
}

/* --------------------------------------------------------- the three notes */

function Explainers({ live }: { live: boolean }) {
  const chain: readonly ZRow[] = live ? [] : Z_NOTES.chain.rows;

  return (
    <div className="doc-screen-only" style={{ flex: 1, minWidth: 0 }}>
      <section
        style={{
          border: '1px solid var(--doc-border)',
          borderLeft: '3px solid var(--doc-danger-500)',
          background: 'var(--doc-danger-50)',
          padding: '12px 14px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '10.5pt', fontWeight: 700 }}>{Z_NOTES.variance.title}</h3>
        <p
          style={{
            margin: '5px 0 0',
            fontSize: '9pt',
            lineHeight: 1.6,
            color: 'var(--doc-fg-muted)',
          }}
        >
          {Z_NOTES.variance.body}
        </p>
      </section>

      <section
        style={{ marginTop: 12, border: '1px solid var(--doc-border)', padding: '12px 14px' }}
      >
        <h3 style={{ margin: 0, fontSize: '10.5pt', fontWeight: 700 }}>{Z_NOTES.chain.title}</h3>
        <p
          style={{
            margin: '5px 0 0',
            fontSize: '9pt',
            lineHeight: 1.6,
            color: 'var(--doc-fg-muted)',
          }}
        >
          {Z_NOTES.chain.body}
        </p>

        {/*
         * The five links are shown for the specimen and withheld from a real
         * shift's Z, which is the one place this panel changes with the data.
         *
         * They are the design's illustration of the concept — five equal figures
         * meaning "reconciled" — and beside a live roll they would stop being an
         * illustration and become a claim: five systems asserted to agree on a
         * total none of them was asked for. A reader comparing them against the
         * roll's own turnover would be reading a disagreement that does not
         * exist. The two sentences above still explain the chain; only the
         * numbers, which this surface cannot vouch for, go.
         */}
        <div
          style={{
            display: 'grid',
            gap: 5,
            marginTop: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: '8.5pt',
          }}
        >
          {chain.map((row, index) => {
            /* The books are the last link and the one that has to agree with
               the other four; the design tints only that row. */
            const posted = index === chain.length - 1;

            return (
              <div
                key={row.label}
                className="doc-line"
                style={{
                  padding: '5px 8px',
                  background: posted ? 'var(--doc-success-50)' : 'var(--doc-50)',
                  color: posted ? 'var(--doc-success-700)' : undefined,
                  fontWeight: posted ? 700 : undefined,
                }}
              >
                <span>{row.label}</span>
                <span>{money(row.amount)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section
        style={{ marginTop: 12, border: '1px solid var(--doc-border)', padding: '12px 14px' }}
      >
        <h3 style={{ margin: 0, fontSize: '10.5pt', fontWeight: 700 }}>{Z_NOTES.x.title}</h3>
        <p
          style={{
            margin: '5px 0 0',
            fontSize: '9pt',
            lineHeight: 1.6,
            color: 'var(--doc-fg-muted)',
          }}
        >
          {Z_NOTES.x.body}
        </p>
      </section>
    </div>
  );
}

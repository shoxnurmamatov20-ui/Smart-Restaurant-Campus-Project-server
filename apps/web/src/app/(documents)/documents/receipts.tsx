import {
  money,
  RECEIPT_NOTES,
  RECEIPTS_HEAD,
  type ReceiptDoc,
  type TicketDoc,
} from './documents-data';

/**
 * 02 · the two thermal receipts — `Hujjatlar.dc.html:103-201`.
 *
 * The design draws them side by side on an A4 specimen sheet, at real 80 mm,
 * with a header and two paragraphs explaining the difference. That framing is
 * the handoff talking to a developer: on this surface it stays on screen and
 * never reaches paper, because a guest's receipt does not carry a note about
 * why the kitchen's copy has no prices. The strips themselves print, one per
 * page — see `documents.css`.
 *
 * The one rule worth restating: **the kitchen ticket has no money on it.** Not
 * omitted, forbidden. A line cook comparing a plate's price to their hourly
 * rate is a conversation no restaurant wants happening over the pass, and the
 * ticket is also handled by runners, guests who wander in, and whoever empties
 * the bin.
 *
 * Both strips are handed in rather than imported: `?bill=` and `?ticket=` make
 * them the real ones, no parameter leaves them the specimen. `documents-server.ts`
 * decides which, and this file never learns the difference — a document that
 * rendered differently when it was live would be a document nobody could check
 * against the design.
 */
export function Receipts({ receipt, ticket }: { receipt: ReceiptDoc; ticket: TicketDoc }) {
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
          {RECEIPTS_HEAD.title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '8pt',
            color: 'var(--doc-fg-subtle)',
          }}
        >
          {RECEIPTS_HEAD.note}
        </div>
      </header>

      <div className="doc-strips" style={{ marginTop: '10mm' }}>
        <CustomerReceipt r={receipt} />
        <KitchenTicket k={ticket} />
      </div>

      <footer
        className="doc-screen-only"
        style={{
          marginTop: 'auto',
          paddingTop: 10,
          borderTop: '1px solid var(--doc-border)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          fontSize: '8pt',
          color: 'var(--doc-fg-muted)',
          lineHeight: 1.55,
        }}
      >
        {RECEIPT_NOTES.map((note) => (
          <div key={note.lead}>
            <b style={{ color: 'var(--doc-fg)' }}>{note.lead}</b> {note.body}
          </div>
        ))}
      </footer>
    </>
  );
}

/* ---------------------------------------------------------- guest receipt */

function CustomerReceipt({ r }: { r: ReceiptDoc }) {
  return (
    <article className="doc-strip">
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '13pt',
            fontWeight: 800,
            letterSpacing: '-.02em',
          }}
        >
          {r.venue}
        </div>
        <div style={{ marginTop: 2 }}>{r.branch}</div>
        <div>{r.address}</div>
        <div>{r.registration}</div>
      </div>

      <div className="doc-rule" />

      {r.meta.map(([label, value]) => (
        <div className="doc-line" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}

      <div className="doc-rule" />

      {r.lines.map((line, index) => (
        <div key={line.name}>
          <div className="doc-line" style={{ fontWeight: 700, marginTop: index === 0 ? 0 : 3 }}>
            <span>
              {line.quantity} × {line.name}
            </span>
            <span>{money(line.amount)}</span>
          </div>
          {/* The modifier sheet, indented under its line. `m1 · m4` are seat
              codes — which guest asked for it — and they are why a runner can
              put the right plate in front of the right person. */}
          <div style={{ paddingLeft: 8, color: 'var(--doc-fg-subtle)' }}>{line.note}</div>
        </div>
      ))}

      <div className="doc-rule" />

      <div className="doc-line">
        <span>Taomlar</span>
        <span>{money(r.items)}</span>
      </div>
      <div className="doc-line">
        <span>{r.serviceLabel}</span>
        <span>{money(r.service)}</span>
      </div>
      <div className="doc-line" style={{ color: 'var(--doc-fg-subtle)' }}>
        <span>Taomlar + xizmat</span>
        <span>{money(r.itemsWithService)}</span>
      </div>
      {/*
       * The discount line prints whether or not there was one. That is the
       * design's rule and it is a guest-trust rule: a bill that shows the
       * discount only when it applies gives a guest no way to notice the
       * evening it silently did not.
       */}
      <div className="doc-line">
        <span>{r.discountLabel}</span>
        <span>
          {'−'}
          {money(r.discount)}
        </span>
      </div>

      <div className="doc-rule-solid" />

      <div
        className="doc-line"
        style={{ fontFamily: 'var(--font-display)', fontSize: '13pt', fontWeight: 800 }}
      >
        <span>JAMI</span>
        <span>{money(r.total)}</span>
      </div>
      {/* VAT is shown, not added: the menu price already contains it (Q1). */}
      <div className="doc-line" style={{ marginTop: 3 }}>
        <span>{r.vatLabel}</span>
        <span>{money(r.vat)}</span>
      </div>

      <div className="doc-rule" />

      {r.tender.map(([label, amount]) => (
        <div className="doc-line" key={label}>
          <span>{label}</span>
          <span>{money(amount)}</span>
        </div>
      ))}

      <div className="doc-rule" />

      <div className="doc-line">
        <span>Fiskal modul</span>
        <span>{r.fiscalModule}</span>
      </div>
      <div className="doc-line">
        <span>Fiskal belgi</span>
        <span>{r.fiscalSign}</span>
      </div>

      <div style={{ display: 'flex', gap: '5mm', alignItems: 'center', marginTop: 6 }}>
        {/*
         * TODO(integration): needs FISCAL_OFD_TOKEN — see docs/GO-LIVE.md
         *
         * Everything on this side is built: `finance.fiscal_receipts.qr_url`
         * exists, `FiscalReceiptResource` publishes it beside `fiscal_sign` and
         * `module_no`, and `documents-server.ts` already reads the row — the
         * strip prints the sign and the module serial from it today. The queue,
         * the 24-hour window, the retry backoff and the NUSXA duplicate counter
         * are all P11 work that shipped.
         *
         * What is missing is a contract: a licensed fiscal data operator, and
         * the credential it issues. When the driver answers, `qr_url` holds the
         * soliq.uz address that OFD minted for THIS receipt and this element
         * becomes a QR of that string. Not before — a QR generated from anything
         * else scans to a page that does not know the receipt, and a guest who
         * checks and finds nothing concludes the restaurant is evading tax. An
         * obvious chequerboard is the honest placeholder, and `documents.css`
         * says the same thing about the same square.
         */}
        <div className="doc-qr" aria-hidden />
        <div style={{ lineHeight: 1.4 }}>{r.qrNote}</div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 7, lineHeight: 1.45 }}>
        {r.thanks.map((line, index) => (
          <span key={line}>
            {index > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 4, color: 'var(--doc-fg-muted)' }}>
        {r.phones}
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 3,
          fontSize: '7pt',
          color: 'var(--doc-fg-subtle)',
        }}
      >
        {r.phonesNote}
      </div>
    </article>
  );
}

/* --------------------------------------------------------- kitchen ticket */

function KitchenTicket({ k }: { k: TicketDoc }) {
  return (
    <article className="doc-strip" data-ticket>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          {/* 26 pt. The number is what a chef shouts across a pass, so it is
              the largest thing on any of the seven documents. */}
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '26pt',
              fontWeight: 800,
              letterSpacing: '-.03em',
              lineHeight: 1,
            }}
          >
            {k.number}
          </div>
          <div style={{ fontSize: '11pt', fontWeight: 700, marginTop: 2 }}>{k.where}</div>
        </div>
        <div style={{ fontSize: '9pt', fontWeight: 700, textAlign: 'right' }}>
          {k.reference.map((line, index) => (
            <span key={line}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </div>
      </div>

      <div className="doc-line" style={{ marginTop: 2 }}>
        <span>{k.station}</span>
        <span>{k.firedAt}</span>
      </div>

      <div style={{ borderTop: '2px solid var(--doc-900)', margin: '5px 0' }} />

      {k.lines.map((line, index) => (
        <div key={line.name}>
          {index > 0 ? (
            <div style={{ borderTop: '1px dashed var(--doc-300)', margin: '5px 0' }} />
          ) : null}

          <div style={{ fontSize: '13pt', fontWeight: 700, lineHeight: 1.25 }}>
            {line.quantity} × {line.name}
          </div>

          {line.modifiers.map((modifier) => (
            <div
              key={modifier.text}
              style={{
                paddingLeft: 6,
                fontSize: '9.5pt',
                /* Red and bold only for the ones that ruin a plate. An
                   "extra meat" set in the same alarm colour as "no onion,
                   allergy" trains a kitchen to stop reading both. */
                fontWeight: modifier.alert ? 700 : 400,
                color: modifier.alert ? 'var(--doc-danger-600)' : undefined,
              }}
            >
              {modifier.text}
            </div>
          ))}

          <div style={{ paddingLeft: 6, fontSize: '9pt', color: 'var(--doc-fg-subtle)' }}>
            {line.seat}
          </div>
        </div>
      ))}

      <div style={{ borderTop: '2px solid var(--doc-900)', margin: '6px 0' }} />

      {k.foot.map(([label, value]) => (
        <div className="doc-line" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}

      <div
        style={{
          marginTop: 6,
          padding: '4px 6px',
          border: '1.5px solid var(--doc-900)',
          textAlign: 'center',
          fontSize: '10pt',
          fontWeight: 700,
        }}
      >
        {k.stamp}
      </div>
    </article>
  );
}

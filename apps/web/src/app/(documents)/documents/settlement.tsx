import { formatNumber } from '@restaurant/utils';

import { money } from './documents-data';
import type { StatementDoc } from './settlement-server';

/**
 * The marketplace settlement statement — the paper behind "download invoice"
 * and "download act" on `/merchant/settlement`.
 *
 * Built in the shape of `invoice.tsx` because it is the same kind of object: an
 * A4 sheet a stranger reads. The difference is which way it points. A purchase
 * order is addressed OUT of the restaurant to a supplier; this is addressed IN,
 * from the platform to the restaurant, and it is the document a merchant hands
 * to their accountant and quotes at their bank. So it carries what those two
 * need — the invoice number, the period, every delivered order with its
 * commission, the advertising billed against the same week, and the account the
 * balance is paid into.
 *
 * **One sheet, two documents.** `?sheet=invoice` prints the demand for the
 * commission; `?sheet=act` prints the reconciliation both sides sign. They
 * differ in their title, their closing block and their signatures and in
 * nothing else, because the figures are the same figures — issuing two
 * documents from two renderings of one statement is how a merchant ends up with
 * an act that does not add up to the invoice beside it.
 *
 * **Every number comes off the statement row, never off live orders.** That is
 * what makes a statement quotable: a merchant reading it a month later gets the
 * figures they reconciled their bank account against, whatever has happened to
 * the orders behind it since. The API resource makes the same promise on its
 * own side.
 *
 * The PDF pipeline is genuinely absent and this page is the deliverable: the
 * browser's own print dialogue puts it on A4 through the `@page doc-a4` box in
 * `documents.css`, which is exactly how the other six sheets are printed.
 */
const HEAD: React.CSSProperties = {
  padding: '7px 8px',
  fontSize: '7.5pt',
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--doc-fg-subtle)',
};

/** Which of the two the reader asked for. Same figures, different paperwork. */
export type SettlementSheet = 'invoice' | 'act';

const TITLE: Readonly<Record<SettlementSheet, string>> = {
  invoice: 'HISOB-FAKTURA',
  act: 'HISOB-KITOB DALOLATNOMASI',
};

/**
 * The closing sentence, and it is not decoration.
 *
 * An invoice states a demand and a due date; an act states that both sides
 * agree the period is closed. A merchant signing the second believes the first
 * has already been checked, so the two sentences must not be swapped.
 */
const CLOSING: Readonly<Record<SettlementSheet, { lead: string; body: string }>> = {
  invoice: {
    lead: 'To‘lov tartibi.',
    body:
      'Balans har payshanba, o‘tgan hafta uchun quyidagi hisob raqamiga o‘tkaziladi. ' +
      'Bank kuni bo‘lmasa keyingi ish kuniga suriladi. Nizo ochiq bo‘lgan buyurtma summasi ' +
      'keyingi davrga o‘tkaziladi va bu hujjatda ko‘rsatilmaydi.',
  },
  act: {
    lead: 'Tomonlarning tasdig‘i.',
    body:
      'Tomonlar yuqoridagi davr bo‘yicha yetkazilgan buyurtmalar, hisoblangan komissiya va ' +
      'reklama xarajatlari bo‘yicha o‘zaro da’vosi yo‘qligini tasdiqlaydi. E’tiroz hujjat ' +
      'olingan kundan boshlab 5 ish kuni ichida yozma ravishda bildiriladi.',
  },
};

const SIGNATURES: Readonly<Record<SettlementSheet, readonly { line: string; below: string }[]>> = {
  invoice: [
    { line: 'Platforma nomidan', below: 'MyPOS Marketplace' },
    { line: 'Qabul qildim', below: 'Do‘kon vakili · sana' },
  ],
  act: [
    { line: 'Platforma nomidan', below: 'MyPOS Marketplace · M.O‘.' },
    { line: 'Do‘kon nomidan', below: 'Imzo · sana · M.O‘.' },
  ],
};

export function Settlement({
  statement,
  sheet,
}: {
  statement: StatementDoc;
  sheet: SettlementSheet;
}) {
  const closing = CLOSING[sheet];

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
            MyPOS Marketplace
          </div>
          <div
            style={{
              fontSize: '8.5pt',
              color: 'var(--doc-fg-muted)',
              lineHeight: 1.5,
              marginTop: 3,
            }}
          >
            Platforma operatori
            <br />
            Toshkent · O‘zbekiston
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
            {TITLE[sheet]}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9pt', marginTop: 3 }}>
            {statement.invoiceNumber}
          </div>
          <div style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', marginTop: 2 }}>
            {statement.issuedOn}
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
        <Block
          label="Do‘kon"
          name={statement.storeName}
          lines={[statement.tenantName, `INN ${statement.tenantInn}`]}
        />
        <Block label="Hisob-kitob davri" name={statement.period} lines={[]} />
      </div>

      {/* ------------------------------------------------------ the summary */}
      <table className="doc-table" style={{ marginTop: 14, fontSize: '9pt' }}>
        <thead>
          <tr
            style={{
              borderTop: '1px solid var(--doc-900)',
              borderBottom: '1px solid var(--doc-900)',
            }}
          >
            <th scope="col" style={{ ...HEAD, width: 26 }}>
              №
            </th>
            <th scope="col" style={HEAD}>
              Nomi
            </th>
            <th scope="col" style={{ ...HEAD, textAlign: 'right', width: 60 }}>
              Soni
            </th>
            <th scope="col" style={{ ...HEAD, textAlign: 'right', width: 96 }}>
              Summa
            </th>
          </tr>
        </thead>

        <tbody style={{ fontFamily: 'var(--font-mono)' }}>
          {statement.lines.map((line, index) => (
            <tr key={line.label} style={{ borderBottom: '1px solid var(--doc-divider)' }}>
              <td style={{ padding: '6px 8px' }}>{index + 1}</td>
              <td style={{ padding: '6px 8px', fontFamily: 'var(--font-sans)' }}>{line.label}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                {formatNumber(line.count, 'uz')}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* --------------------------------------------------------- the sum */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <div style={{ width: '78mm', fontFamily: 'var(--font-mono)', fontSize: '9pt' }}>
          <Total label="Aylanma" value={money(statement.gross)} />
          {/*
           * The commission and the adjustments are subtractions and are printed
           * as such. A column where a deduction looks like a receipt is a
           * column an accountant adds up wrong once and never trusts again.
           */}
          <Total label="Komissiya" value={`− ${money(statement.commission)}`} negative />
          {statement.adjustments === 0 ? null : (
            <Total
              label="Tuzatishlar"
              value={`${statement.adjustments < 0 ? '− ' : ''}${money(statement.adjustments)}`}
              negative={statement.adjustments < 0}
            />
          )}
          {statement.placements.length === 0 ? null : (
            <Total
              label="Reklama"
              value={`− ${money(statement.placements.reduce((sum, row) => sum + row.amount, 0))}`}
              negative
            />
          )}

          <div
            className="doc-line"
            style={{ padding: 8, borderTop: '1px solid var(--doc-900)', marginTop: 3 }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '11pt', fontWeight: 700 }}>
              To‘lanadi
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '13pt', fontWeight: 800 }}>
              {money(statement.payable)}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- what it is made of */}
      {statement.orders.length === 0 ? null : (
        <>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: '7.5pt',
              fontWeight: 600,
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              color: 'var(--doc-fg-subtle)',
            }}
          >
            Yetkazilgan buyurtmalar
          </p>

          <table className="doc-table" style={{ marginTop: 6, fontSize: '8.5pt' }}>
            <thead>
              <tr
                style={{
                  borderTop: '1px solid var(--doc-900)',
                  borderBottom: '1px solid var(--doc-900)',
                }}
              >
                <th scope="col" style={{ ...HEAD, width: 26 }}>
                  №
                </th>
                <th scope="col" style={{ ...HEAD, width: 92 }}>
                  Buyurtma
                </th>
                <th scope="col" style={{ ...HEAD, width: 78 }}>
                  Sana
                </th>
                <th scope="col" style={{ ...HEAD, textAlign: 'right' }}>
                  Aylanma
                </th>
                <th scope="col" style={{ ...HEAD, textAlign: 'right', width: 88 }}>
                  Komissiya
                </th>
                <th scope="col" style={{ ...HEAD, textAlign: 'right', width: 96 }}>
                  Do‘konga
                </th>
              </tr>
            </thead>

            <tbody style={{ fontFamily: 'var(--font-mono)' }}>
              {statement.orders.map((order, index) => (
                <tr key={order.number} style={{ borderBottom: '1px solid var(--doc-divider)' }}>
                  <td style={{ padding: '5px 8px' }}>{index + 1}</td>
                  <td style={{ padding: '5px 8px' }}>{order.number}</td>
                  <td style={{ padding: '5px 8px' }}>{order.delivered}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{money(order.gross)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                    {money(order.commission)}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{money(order.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {statement.placements.length === 0 ? null : (
        <>
          <p
            style={{
              margin: '14px 0 0',
              fontSize: '7.5pt',
              fontWeight: 600,
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              color: 'var(--doc-fg-subtle)',
            }}
          >
            Reklama joylashuvi
          </p>

          <table className="doc-table" style={{ marginTop: 6, fontSize: '8.5pt' }}>
            <tbody style={{ fontFamily: 'var(--font-mono)' }}>
              {statement.placements.map((placement) => (
                <tr key={placement.label} style={{ borderBottom: '1px solid var(--doc-divider)' }}>
                  <td style={{ padding: '5px 8px', fontFamily: 'var(--font-sans)' }}>
                    {placement.label}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', width: 78 }}>
                    {formatNumber(placement.days, 'uz')} kun
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', width: 96 }}>
                    {money(placement.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ------------------------------------------------- where it is paid */}
      <div
        style={{
          marginTop: 14,
          padding: '10px 12px',
          border: '1px solid var(--doc-border)',
          background: 'var(--doc-25)',
          fontSize: '8.5pt',
          lineHeight: 1.6,
          color: 'var(--doc-fg-muted)',
        }}
      >
        <b style={{ color: 'var(--doc-fg)' }}>To‘lov rekvizitlari.</b>{' '}
        {statement.bank === null ? (
          /* The one line on this sheet that is a warning rather than a fact: a
             statement with nowhere to pay is a statement nobody can act on, and
             it must not print as a blank space that reads like an oversight. */
          <span style={{ color: 'var(--doc-fg)' }}>
            Rekvizitlar kiritilmagan — to‘lov amalga oshirilmaydi.
          </span>
        ) : (
          <>
            {statement.bank.name} · MFO {statement.bank.mfo} · hisob ····{' '}
            {statement.bank.accountLast4} · INN {statement.bank.inn} · {statement.bank.holder}
            {statement.bankVerified ? null : (
              <span style={{ color: 'var(--doc-fg)' }}>
                {' '}
                · rekvizitlar tekshiruvda, to‘lov tasdiqlangunga qadar to‘xtatilgan
              </span>
            )}
          </>
        )}
      </div>

      <p
        style={{
          margin: '10px 0 0',
          padding: '10px 12px',
          border: '1px solid var(--doc-border)',
          background: 'var(--doc-25)',
          fontSize: '8.5pt',
          lineHeight: 1.6,
          color: 'var(--doc-fg-muted)',
        }}
      >
        <b style={{ color: 'var(--doc-fg)' }}>{closing.lead}</b> {closing.body}
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
        {SIGNATURES[sheet].map((signature) => (
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

function Total({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="doc-line" style={{ padding: '4px 8px' }}>
      <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--doc-fg-muted)' }}>{label}</span>
      <span style={negative ? { color: 'var(--doc-fg)' } : undefined}>{value}</span>
    </div>
  );
}

function Block({ label, name, lines }: { label: string; name: string; lines: readonly string[] }) {
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
        {label}
      </div>
      <div style={{ fontSize: '11pt', fontWeight: 700, marginTop: 4 }}>{name}</div>
      <div
        style={{ fontSize: '8.5pt', color: 'var(--doc-fg-muted)', lineHeight: 1.55, marginTop: 3 }}
      >
        {lines.map((line, index) => (
          <span key={line}>
            {index > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

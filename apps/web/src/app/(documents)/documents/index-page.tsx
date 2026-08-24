import Link from 'next/link';

import {
  COVER,
  COVER_CARDS,
  COVER_RULES,
  COVER_WIDE,
  type CoverCard,
  type DocumentKey,
  type Rail,
} from './documents-data';

/**
 * 01 · the cover — `Hujjatlar.dc.html:39-101`.
 *
 * A contents page that is itself one of the seven printed documents: it goes in
 * the front of the folder a new manager is handed, which is why it names each
 * document's paper, its audience and the reason it looks the way it does rather
 * than just listing titles.
 *
 * On screen each card is also the way in. That costs nothing on paper — a link
 * prints as its text — and it saves the reader from reading a card about the
 * count sheet and then hunting for it in the switcher.
 *
 * Typography is inline and in points, deliberately. Tailwind's scale is a
 * screen scale in rem; this is a document measured in millimetres and set in
 * points, and every value below is the one the design file writes. A `text-sm`
 * that renders at 13.7 px is not 9.5 pt, and on paper the difference shows.
 */
const RAIL: Readonly<Record<Rail, string>> = {
  brand: 'var(--doc-brand)',
  warning: 'var(--doc-warning-500)',
  ink: 'var(--doc-900)',
  accent: 'var(--doc-accent-500)',
};

export function IndexPage({ available }: { available: readonly DocumentKey[] }) {
  /*
   * The contents sheet lists what the reader can actually open.
   *
   * `specs/02-documents.md §7` gives four roles four different sets, so a fixed
   * list of seven would offer a cashier the accountant's P&L and a warehouseman
   * a colleague's payslip — every one of those links landing back here, which
   * reads as a broken page rather than as a boundary.
   */
  const cards = COVER_CARDS.filter((card) => available.includes(card.goes));
  const wide = available.includes(COVER_WIDE.goes);

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 10,
          borderBottom: '2px solid var(--doc-900)',
        }}
      >
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
            {COVER.eyebrow}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22pt',
              fontWeight: 700,
              letterSpacing: '-.022em',
              marginTop: 3,
            }}
          >
            {COVER.title}
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontSize: '8.5pt',
            color: 'var(--doc-fg-muted)',
            lineHeight: 1.5,
          }}
        >
          <div>{COVER.where}</div>
          <div style={{ fontFamily: 'var(--font-mono)' }}>{COVER.version}</div>
        </div>
      </header>

      <p
        style={{
          margin: '14px 0 0',
          fontSize: '10.5pt',
          lineHeight: 1.6,
          color: 'var(--doc-fg-muted)',
          maxWidth: '150mm',
        }}
      >
        {COVER.lede}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 9,
          marginTop: 16,
        }}
      >
        {cards.map((card) => (
          <Card key={card.name} card={card} />
        ))}
      </div>

      {/* The seventh sits alone across the full measure: its note is a
          sentence, not a phrase, and it would set the whole grid two lines
          taller if it shared a row. */}
      {wide ? (
        <Link
          href={`/documents?d=${COVER_WIDE.goes}`}
          style={{
            display: 'block',
            color: 'inherit',
            textDecoration: 'none',
            border: '1px solid var(--doc-border)',
            borderLeft: `3px solid ${RAIL[COVER_WIDE.rail]}`,
            padding: '11px 13px',
            marginTop: 9,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '7.5pt',
                  color: 'var(--doc-fg-subtle)',
                }}
              >
                {COVER_WIDE.paper}
              </div>
              <div style={{ fontSize: '11pt', fontWeight: 700, marginTop: 2 }}>
                {COVER_WIDE.name}
              </div>
            </div>
            <div
              style={{
                fontSize: '8.5pt',
                color: 'var(--doc-fg-muted)',
                lineHeight: 1.5,
                maxWidth: '110mm',
              }}
            >
              {COVER_WIDE.note}
            </div>
          </div>
        </Link>
      ) : null}

      <footer
        style={{
          marginTop: 'auto',
          paddingTop: 14,
          borderTop: '1px solid var(--doc-border)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 14,
          fontSize: '8pt',
          color: 'var(--doc-fg-muted)',
          lineHeight: 1.55,
        }}
      >
        {COVER_RULES.map((rule) => (
          <div key={rule.lead}>
            <b style={{ color: 'var(--doc-fg)' }}>{rule.lead}</b>
            <br />
            {rule.body}
          </div>
        ))}
      </footer>
    </>
  );
}

function Card({ card }: { card: CoverCard }) {
  return (
    <Link
      href={`/documents?d=${card.goes}`}
      style={{
        display: 'block',
        color: 'inherit',
        textDecoration: 'none',
        border: '1px solid var(--doc-border)',
        borderLeft: `3px solid ${RAIL[card.rail]}`,
        padding: '11px 13px',
      }}
    >
      <div
        style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5pt', color: 'var(--doc-fg-subtle)' }}
      >
        {card.paper}
      </div>
      <div style={{ fontSize: '11pt', fontWeight: 700, marginTop: 2 }}>{card.name}</div>
      <div
        style={{
          fontSize: '8.5pt',
          color: 'var(--doc-fg-muted)',
          lineHeight: 1.5,
          marginTop: 4,
        }}
      >
        <Note note={card.note} emphasis={card.emphasis} />
      </div>
    </Link>
  );
}

/**
 * The one bold word inside a note, put back where the design has it.
 *
 * Split on the phrase rather than shipped as HTML, so the copy in
 * `documents-data.ts` stays a sentence a person can read and translate — see
 * the field's own note there.
 */
function Note({ note, emphasis }: { note: string; emphasis?: string }) {
  if (emphasis === undefined) return <>{note}</>;

  const at = note.indexOf(emphasis);

  if (at < 0) return <>{note}</>;

  return (
    <>
      {note.slice(0, at)}
      <b style={{ color: 'var(--doc-fg)' }}>{emphasis}</b>
      {note.slice(at + emphasis.length)}
    </>
  );
}

import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { copy, LINE_STATE, SHARED, TABLE_STATE, TABLES_COPY } from '@restaurant/surfaces/crew/copy';
import {
  isCrewRole,
  MINUTE_WORD,
  MY_TABLES,
  say,
  type LineState,
} from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../../../crew-session';
import { tableDetail } from '../../../../crew-server';
import { Som } from '../../../../crew-money';
import { EmptyState, SectionLabel } from '../../../../panels/bits';
import { TableActions } from '../../../../panels/table-actions';

/**
 * One table, and what is on it.
 *
 * What is here is what a waiter actually needs mid-service and cannot get from
 * the grid: the line-by-line state. `Ready · collect it` in green is the reason
 * to open this screen at all, and it comes off the order's own show call.
 *
 * The design gives the table five actions and they are not all the same kind of
 * thing — `table-actions.tsx` carries which of them reaches the server and why
 * the rest do not. What matters here is that the table is found on the **live**
 * floor first: `floorFrom()` keys a table by its database id, so looking it up
 * in `MY_TABLES` alone turned every real table into a 404 the moment the grid
 * went live.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const lang = crewLang((await headers()).get('accept-language'));
  const found = MY_TABLES.find((row) => row.id === table);
  const word = copy(TABLES_COPY, lang).table;

  return {
    title: found === undefined ? word : `${word} ${found.number}`,
    robots: { index: false, follow: false },
  };
}

export default async function CrewTablePage({
  params,
}: {
  params: Promise<{ role: string; table: string }>;
}) {
  const { role, table } = await params;
  if (!isCrewRole(role)) notFound();

  const lang = crewLang((await headers()).get('accept-language'));
  const detail = await tableDetail(table, lang);
  if (detail === null) notFound();

  const found = detail.table;
  const t = copy(TABLES_COPY, lang);
  const s = copy(SHARED, lang);
  const states = copy(TABLE_STATE, lang);
  const lineStates = copy(LINE_STATE, lang);

  const lines = detail.lines;
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return (
    <section>
      <Link
        href={`/crew/${role}/tables`}
        data-press
        className="text-fg-subtle -ml-1 inline-flex min-h-[var(--tap-min)] items-center gap-1.5 text-sm font-semibold"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 6-6 6 6 6" />
        </svg>
        {s.back}
      </Link>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        {/* The word as well as the number. On the grid a bare "12" is
            unambiguous because it sits in a grid of tables; on its own screen,
            arrived at from a push notification, it is just a numeral. */}
        <h1 className="font-display text-2xl font-bold tracking-tight">
          <span className="text-fg-muted text-lg font-semibold">{t.table}</span> {found.number}
        </h1>
        <span className="text-fg-subtle text-2xs font-semibold">{states[found.state]}</span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2.5">
        <Kpi label={t.guests} value={String(found.seats)} />
        <Kpi label={t.elapsed} value={`${found.minutes} ${say(MINUTE_WORD, lang)}`} />
        <Kpi
          label={t.lines}
          value={String(lines.reduce((count, line) => count + line.quantity, 0))}
        />
      </dl>

      <SectionLabel>{t.orderLines}</SectionLabel>

      {lines.length === 0 ? (
        <EmptyState>{t.noLines}</EmptyState>
      ) : (
        <>
          <ul>
            {lines.map((line) => (
              <li
                /* The dish name, which is unique on a bill: two lines of the
                   same dish are one row with a quantity, both on the fixture
                   and on the server, so there is nothing to collide with. */
                key={say(line.name, 'en')}
                className="border-divider flex items-start gap-3 border-b py-2.5"
              >
                <span data-num className="text-fg-subtle w-6 flex-none text-sm font-semibold">
                  {line.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{say(line.name, lang)}</p>
                  <p className={`text-2xs mt-0.5 font-semibold ${lineTone(line.state)}`}>
                    {lineStates[line.state]}
                  </p>
                </div>
                <Som
                  tiyin={line.price * line.quantity}
                  lang={lang}
                  unit={false}
                  className="flex-none text-sm font-semibold"
                />
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold">{s.total}</span>
            {/*
             * Summed from the lines on this screen rather than carried
             * alongside them. Two figures for the same money is how a screen
             * ends up disagreeing with the bill a guest is handed — and the
             * guest is holding the one that counts.
             */}
            <Som tiyin={total} lang={lang} className="font-display text-xl font-bold" />
          </div>
        </>
      )}

      {/*
       * The five actions the design puts under a table. They used to be one
       * sentence saying none of them existed, which told a waiter to walk to a
       * tablet without saying which of the five they could have done there.
       */}
      <TableActions
        lang={lang}
        tableLabel={`${t.table} ${found.number}`}
        orderHref={`/crew/${role}/table/${found.id}/order`}
        orderId={found.orderId}
        live={detail.live}
      />
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-subtle rounded-[14px] px-3 py-2.5">
      <dt className="text-fg-subtle text-2xs truncate">{label}</dt>
      <dd data-num className="font-display mt-0.5 text-lg font-bold">
        {value}
      </dd>
    </div>
  );
}

/** Only `ready` shouts. The other two are information; this one is an errand. */
function lineTone(state: LineState): string {
  switch (state) {
    case 'served':
      return 'text-fg-subtle';
    case 'cooking':
      return 'text-warning-600';
    case 'ready':
      return 'text-success-600';
  }
}

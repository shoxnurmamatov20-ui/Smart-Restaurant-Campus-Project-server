import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { PageHead, Pill, Row, TableCard, type Tone } from '../screen';
import { EmptyState } from '@restaurant/ui';

import {
  averageOrder,
  ORDER_HISTORY,
  visitsPerMonth,
  type CustomerRow,
  type FeedbackRow,
  type FeedbackStatus,
} from './customers-data';
import { getCustomers, getFeedback, getGuestOrders } from './crm-server';
import { OpenCase } from './open-case';

export const generateMetadata = () => moduleMetadata('crm');

/**
 * Known guests.
 *
 * Built to the design's Customers screen: a 340px list on the left, the
 * selected guest filling the right. The first guest is shown open, which is
 * what the design draws and what a manager wants when the page loads.
 *
 * The note is the point of the screen. Spend and visit counts are what a report
 * gives you; "always asks for table 12, no coriander" is what makes a regular
 * feel recognised, and it belongs where the floor will actually see it.
 *
 * Both halves are live now. The list used to stay on fixtures because the
 * endpoint answered neither `segment` nor a last-visit date, and both are drawn
 * on this card; both are columns as of `2026_08_22_180000`.
 *
 * Under the card, the review queue — and beside each row, the one button that
 * turns a one-star into something somebody has to answer. A review has no
 * amount, no channel and no record of what was decided; `crm.cases` has all
 * three, so "open a case" is not a status change, it is a different table.
 *
 * TODO — Phase 1 · crm, once the module is built:
 *   - Loyalty: tiers, points, what earns and what redeems
 *   - The order history beside a guest, which is an Orders read this screen
 *     does not have — `ORDER_HISTORY` below is the design's four rows
 *   - Consent, because this is personal data under Uzbek law
 */
const FB_COLUMNS = '[grid-template-columns:150px_70px_120px_minmax(0,1fr)_110px_170px]';

/** The four states, and how loudly each is drawn. */
const FB_TONE: Readonly<Record<FeedbackStatus, Tone>> = {
  new: 'brand',
  in_review: 'warning',
  resolved: 'success',
  dismissed: 'neutral',
};

const FB_LABEL = {
  new: 'fbNew',
  in_review: 'fbInReview',
  resolved: 'fbResolved',
  dismissed: 'fbDismissed',
} as const;

/**
 * The aspects the catalogue knows.
 *
 * The column is free text on the server, so anything else is printed as it was
 * stored — a review tagged with a word nobody has translated yet is still a
 * review, and showing `aspAtmosphere` instead of the word would lose it.
 */
const ASPECT_LABEL = {
  food: 'aspFood',
  service: 'aspService',
  speed: 'aspSpeed',
  cleanliness: 'aspCleanliness',
  price: 'aspPrice',
} as const;

type Dict = Awaited<ReturnType<typeof getTranslations<'console.customers'>>>;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, locale, blank, list] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.customers'),
    getLocale(),
    getTranslations('console.empty'),
    // The API when there is a session, the fixtures when there is not.
    getCustomers(),
  ]);

  const customers = list.rows;

  /*
   * Which customer the panel shows, from the URL.
   *
   * The list was drawn as buttons with no handler, so the panel beside it
   * always showed the first customer and the other rows were decoration. A
   * link rather than a click handler because nothing else on this screen needs
   * the browser: the selection is a place, it survives a refresh, and it can be
   * sent to somebody.
   *
   * `undefined` is now reachable: a live restaurant with no guests on file gets
   * an empty list rather than the design's six, so everything below has to
   * survive there being nobody to show.
   */
  const asked = (await searchParams).c;
  const selected: CustomerRow | undefined =
    customers.find((customer) => customer.id === asked) ?? customers[0];

  // The API when there is a session, the fixtures when there is not.
  const [reviews, history] = await Promise.all([
    getFeedback(),
    // Only for a live row. A fixture id is a word (`kamola`) and would be
    // posted at an API that has never heard of it.
    getGuestOrders(list.live && selected !== undefined ? apiId(selected.id) : null),
  ]);
  const stamp = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
  const lang = locale as 'uz' | 'ru' | 'en';

  /*
   * The header counts what the restaurant actually has.
   *
   * `t('subtitle')` states "2 148 known guests · 312 loyalty members · 41 at
   * risk" — the design's own CRM, printed over an empty one. It survives only
   * where the list below it is the design's too.
   */
  const subtitle =
    list.live && list.total !== null
      ? t('subtitleLive', {
          total: list.total,
          loyalty: list.loyalty ?? 0,
          risk: list.atRisk ?? 0,
        })
      : t('subtitle');

  return (
    <>
      <PageHead title={nav('crm')} subtitle={subtitle} />

      {selected === undefined ? (
        <div className="bg-surface rounded-lg border px-7 py-10 text-center">
          <p className="text-md font-semibold">{blank('crm')}</p>
          <p className="text-fg-subtle mt-1.5 text-sm">{blank('crmSub')}</p>
        </div>
      ) : (
        <div
          data-split
          className="grid [grid-template-columns:340px_minmax(0,1fr)] items-start gap-5"
        >
          <div className="flex flex-col gap-2">
            {customers.map((customer) => {
              const active = customer.id === selected.id;

              return (
                <Link
                  key={customer.id}
                  href={`/crm?c=${customer.id}`}
                  scroll={false}
                  data-tile
                  aria-current={active ? 'true' : undefined}
                  className={`flex items-center gap-3 rounded-md border px-4 py-3.5 text-left ${
                    active ? 'bg-brand-50 border-brand-200' : 'bg-surface'
                  }`}
                >
                  <span className="bg-bg-muted text-fg-muted rounded-pill grid size-9 flex-none place-items-center text-xs font-semibold">
                    {initialsOf(customer.name)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{customer.name}</span>
                    <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                      {t(customer.segment)} · {customer.visits} {t('visitsShort')}
                    </span>
                  </span>

                  <span data-num className="text-sm font-semibold">
                    {(customer.spend / 100_000_000).toFixed(1)}M
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="bg-surface rounded-lg border px-7 py-[26px]">
            <div className="border-divider flex items-start gap-4 border-b pb-[22px]">
              <span className="bg-brand-100 text-brand-700 rounded-pill text-md grid size-[52px] flex-none place-items-center font-semibold">
                {initialsOf(selected.name)}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="font-display tracking-snug text-xl font-semibold">
                  {selected.name}
                </h3>
                <p data-num className="text-fg-muted mt-1.5 text-sm">
                  {selected.phone} · {t('lastVisit')} {lastSeen(selected, t)}
                </p>
              </div>

              <div className="flex flex-none gap-2">
                <Pill tone="success">{t(selected.tier)}</Pill>
                <Pill tone="neutral">{t(selected.segment)}</Pill>
              </div>
            </div>

            {/* Four figures in a hairline grid — the same device the branch
              switcher and the stock summary use. */}
            <div className="bg-divider my-[22px] grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
              {[
                { label: t('totalSpend'), value: formatTiyinAmount(selected.spend) },
                { label: t('visits'), value: String(selected.visits) },
                { label: t('averageOrder'), value: formatTiyinAmount(averageOrder(selected)) },
                {
                  label: t('frequency'),
                  value: `${visitsPerMonth(selected)} ${t('perMonth')}`,
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-[18px] py-4">
                  <div className="text-fg-subtle mb-[7px] text-xs">{stat.label}</div>
                  <div data-num className="text-md font-semibold">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-fg-subtle text-2xs tracking-caps mb-2.5 font-semibold uppercase">
              {t('note')}
            </div>
            <p className="text-fg-muted mb-6 text-sm leading-relaxed text-pretty">
              {noteOf(selected, t)}
            </p>

            <div className="text-fg-subtle text-2xs tracking-caps mb-1.5 font-semibold uppercase">
              {t('history')}
            </div>

            {/*
            The guest's own bills where the list is live, and the design's four
            rows only where the guest is the design's too. A real regular used
            to be shown four visits they never made, with dates and amounts, in
            the panel a manager uses to decide how to treat them.
          */}
            {list.live ? (
              history.length === 0 ? (
                <EmptyState className="py-4">{t('historyEmpty')}</EmptyState>
              ) : (
                history.map((order) => (
                  <div
                    key={order.number}
                    data-row
                    className="border-divider -mx-2 flex items-center gap-3.5 rounded-sm border-b px-2 py-[11px]"
                  >
                    <span className="text-fg-subtle w-14 font-mono text-xs">{order.number}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{order.where}</span>
                    <span data-num className="text-fg-subtle flex-none text-xs">
                      {order.at === null ? '' : stamp.format(new Date(order.at))}
                    </span>
                    <span data-num className="text-sm font-semibold">
                      {formatTiyinAmount(order.total)}
                    </span>
                  </div>
                ))
              )
            ) : (
              ORDER_HISTORY.map((order) => (
                <div
                  key={order.id}
                  data-row
                  className="border-divider -mx-2 flex items-center gap-3.5 rounded-sm border-b px-2 py-[11px]"
                >
                  <span className="text-fg-subtle w-14 font-mono text-xs">{order.id}</span>
                  <span className="min-w-0 flex-1 text-sm">{t(order.where)}</span>
                  <span data-num className="text-sm font-semibold">
                    {formatTiyinAmount(order.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <h3 className="font-display tracking-snug mt-7 mb-4 text-lg font-semibold">{t('fbTitle')}</h3>

      <TableCard
        columns={FB_COLUMNS}
        head={[
          t('fbColGuest'),
          { label: t('fbColScore'), align: 'right' },
          t('fbColAspect'),
          t('fbColComment'),
          t('fbColWhen'),
          t('fbColStatus'),
        ]}
        empty={{ title: blank('crm'), body: blank('crmSub') }}
      >
        {reviews.map((review) => (
          <Row key={review.id} columns={FB_COLUMNS} className="py-3">
            <span className="truncate text-sm font-semibold">
              {review.guest ?? t('fbUnknownGuest')}
            </span>

            <span
              data-num
              className={`text-right text-sm font-semibold ${scoreTone(review.score)}`}
            >
              {review.score}
            </span>

            <span className="text-fg-muted text-sm">{aspectOf(review, t)}</span>

            {/* The whole review, wrapped rather than clipped. A complaint cut
                off at the column edge is a complaint nobody read. */}
            <span className="text-fg-muted text-sm text-pretty">{review.comment}</span>

            <span data-num className="text-fg-subtle text-sm">
              {review.at === null ? '—' : stamp.format(new Date(review.at))}
            </span>

            <span className="flex flex-wrap items-center gap-1.5">
              {review.urgent ? <Pill tone="danger">{t('fbUrgent')}</Pill> : null}
              <Pill tone={FB_TONE[review.status]}>{t(FB_LABEL[review.status])}</Pill>

              {/*
                Only where there is something to answer. A resolved review is
                closed and a dismissed one was judged not to be a complaint;
                putting the button on either would reopen an argument somebody
                already finished.
              */}
              {review.status === 'new' || review.status === 'in_review' ? (
                <OpenCase
                  feedbackId={apiId(review.id)}
                  lang={lang}
                  label={t('fbOpenCase')}
                  done={t('fbCaseOpened')}
                />
              ) : null}
            </span>
          </Row>
        ))}
      </TableCard>
    </>
  );
}

/**
 * How a score is coloured.
 *
 * Three bands, not five: what a manager needs from this column at a glance is
 * whether the review is a problem, a nudge or a thank-you.
 */
function scoreTone(score: number): string {
  if (score <= 2) return 'text-danger-700';
  if (score === 3) return 'text-warning-700';

  return 'text-success-700';
}

/** The aspect in the reader's language, or as it was stored. */
function aspectOf(review: FeedbackRow, t: Dict): string {
  if (review.aspect === null) return '—';

  const key = ASPECT_LABEL[review.aspect as keyof typeof ASPECT_LABEL];

  return key === undefined ? review.aspect : t(key);
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}

/**
 * A row's own id, or null when the row is a fixture.
 *
 * Live ids are the API's integers stringified; the fixtures are words
 * (`kamola`, `SH-2418`). Parsing rather than a flag, because a fixture that
 * happened to be given a numeric id would then be posted at an API that has
 * never heard of it.
 */
function apiId(id: string): number | null {
  const parsed = Number(id);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * When a guest was last in, in words.
 *
 * A live row carries the date and a fixture carries one of six catalogue
 * phrases — see `CustomerRow.lastVisitAt` for why the two cannot be one thing.
 * The buckets stop at months because a guest last seen in March is not somebody
 * this screen is going to get back with a chip.
 */
function lastSeen(customer: CustomerRow, t: Dict): string {
  if (customer.lastVisitAt === undefined) return t(customer.lastVisit);
  if (customer.lastVisitAt === null) return t('lastNever');

  const then = Date.parse(customer.lastVisitAt);

  if (Number.isNaN(then)) return t('lastNever');

  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));

  if (days === 0) return t('lastToday');
  if (days === 1) return t('lastYesterday');
  if (days < 14) return t('lastDaysAgo', { n: days });
  if (days < 60) return t('lastWeeksAgo', { n: Math.round(days / 7) });

  return t('lastMonthsAgo', { n: Math.round(days / 30) });
}

/**
 * The note, as somebody typed it.
 *
 * An empty string is an answer — this guest has no note — and gets the "no
 * note" line rather than a fixture's sentence about somebody else. Only a row
 * with no `noteText` at all falls back to the catalogue, which is exactly the
 * fixtures.
 */
function noteOf(customer: CustomerRow, t: Dict): string {
  if (customer.noteText === undefined) return t(customer.note);

  return customer.noteText === '' ? t('noteEmpty') : customer.noteText;
}

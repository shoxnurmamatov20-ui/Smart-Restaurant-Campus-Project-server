import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount, formatTiyinCompact } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { PageHead, Rail, Row, TableCard } from '../screen';

import { GROUP_STYLE } from './analytics-data';
import { getAnalytics, GROUPS, marginOfView, peakHour, profitOfView } from './analytics-server';

export const generateMetadata = () => moduleMetadata('analytics');

/**
 * Thirty days, read four ways — `Smart Restaurant OS.dc.html:3175-3252`.
 *
 * The design's Analytics screen is exactly four blocks: covers by hour against
 * revenue by category, four service figures, then menu engineering with every
 * dish placed in one of four groups by how much it sells and what it keeps.
 *
 * It is four and not six. An earlier build opened this screen with a twelve-
 * month revenue trend and a labour-share chart taken from `specs/01-os.md`,
 * neither of which the design file draws here — and the labour chart it drew
 * was a second, invented copy of one that already exists in its right place.
 * The file puts labour cost by hour on the **branches** screen (`atBranches`,
 * `:3509-3531`), where it sits beside each branch's labour and food-cost
 * columns and can be read against them; `settings/branches` builds it there
 * from the design's own fourteen hours. `README.md`'s rule settles the
 * disagreement: where the document and the file differ, the file wins.
 *
 * The covers chart shades its bars by height rather than colouring them all the
 * same: the two peaks are the point of the chart, and a flat blue row makes a
 * reader count instead of see.
 *
 * Live against `GET /api/v1/analytics/summary` and
 * `/analytics/menu-engineering`, both windowed on `business_date` and cached
 * for a minute server-side — see analytics-server.ts for the seam and for why
 * an uncosted dish appears in no quadrant.
 *
 * TODO — Phase 1 · analytics, once the module is built:
 *   - The period picker, and comparison against the previous one
 *   - Per-branch and per-channel breakdowns
 *   - Turn time, ticket time and repeat share: kitchen timestamps and CRM,
 *     neither of which Analytics is permitted to read
 */
const COLUMNS = '[grid-template-columns:minmax(0,1.4fr)_80px_110px_120px_150px_130px_120px]';
const CARD = 'bg-surface rounded-lg border';
const H3 = 'text-md font-semibold tracking-snug';

export default async function AnalyticsPage() {
  const [nav, t, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.analytics'),
    getLocale(),
  ]);

  // The fixture's labels are message keys and a live menu's are proper nouns.
  // Resolving both to strings in one place is what lets everything below stay
  // a single rendering path — see analytics-server.ts.
  const view = await getAnalytics(t, locale);

  /*
   * Every caption on this screen is derived when the figures are real.
   *
   * The catalogue's sentences interpret the DESIGN's thirty days — "45 minutes
   * shorter than the evening peak", "national dishes carry the business",
   * "updated 12 minutes ago" — and each one was printed under a live number
   * with nothing to say it was about a different restaurant. They stay only
   * where the figures above them are the fixture too.
   */
  const busiest = peakHour(view.covers);
  const biggestCategory = view.categories[0] ?? null;

  const subtitle = view.live ? t('subtitleLive', { days: view.days }) : t('subtitle');

  const coversSub = view.live
    ? busiest === null
      ? t('noData')
      : t('coversSubLive', { hour: busiest.hour, guests: busiest.guests })
    : t('coversSub');

  const categorySub = view.live
    ? biggestCategory === null
      ? t('noData')
      : t('categorySubLive', {
          name: biggestCategory.label,
          percent: biggestCategory.percent,
        })
    : t('categorySub');

  /* A figure the platform cannot reach draws an em dash and says so, rather
     than borrowing the design's constant. See `analytics-server.ts`. */
  const figure = (value: string | null, note: string) => ({
    value: value ?? '—',
    note: value === null ? t('notMeasured') : note,
    faded: value === null,
  });

  return (
    <>
      <PageHead title={nav('analytics')} subtitle={subtitle} />

      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.3fr)_minmax(0,1fr)] gap-5"
      >
        {/* -------------------------------------------------- covers by hour */}
        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={H3}>{t('coversTitle')}</h3>
          <p className="text-fg-subtle mt-1 mb-[22px] text-xs">{coversSub}</p>

          <div className="flex h-[180px] items-end gap-2.5">
            {view.covers.map((covers, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <span data-num className="text-fg-subtle text-2xs">
                  {covers}
                </span>

                {/*
                 * Height in pixels against a fixed row — a percentage would
                 * resolve against a parent with no resolved height. The 1.6
                 * multiplier is the design's own (`hourBars`, `:14726`), so the
                 * tallest hour lands at 140.8px inside a 180px box.
                 */}
                <span
                  data-bar="1"
                  className={`w-full rounded-t-[4px] ${
                    covers >= 70 ? 'bg-brand-500' : covers >= 40 ? 'bg-brand-300' : 'bg-brand-100'
                  }`}
                  style={{ height: `${covers * 1.6}px` }}
                />

                <span data-num className="text-fg-subtle text-2xs">
                  {9 + index}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------- revenue by category */}
        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={H3}>{t('categoryTitle')}</h3>
          <p className="text-fg-subtle mt-1 mb-5 text-xs">{categorySub}</p>

          {/*
           * Six rails, which is what the design draws (`catMix`, `:3198`).
           *
           * A donut stood here for a while on the argument that a category mix
           * is parts of one whole. It is — but the question this card answers
           * is not "what share is each" so much as "which of these is worth
           * fixing", and that is a ranked comparison: the money reads left to
           * right on one baseline, and desserts at 6% next to national at 38%
           * is legible in a way a 6° slice is not. Every rail is `--brand-500`
           * for the same reason: colouring six categories invites a reader to
           * think the colours mean something.
           */}
          {view.categories.map((category) => (
            <div key={category.key} className="py-[9px]">
              <div className="mb-[7px] flex justify-between">
                <span className="text-sm">{category.label}</span>
                <span className="flex gap-3">
                  <span data-num className="text-fg-subtle text-sm">
                    {formatTiyinCompact(category.revenue)}
                  </span>
                  <span data-num className="w-[34px] text-right text-sm font-semibold">
                    {category.percent}%
                  </span>
                </span>
              </div>

              <Rail percent={category.percent} colour="var(--brand-500)" />
            </div>
          ))}
        </section>
      </div>

      {/* ------------------------------------------------- the four figures */}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-5">
        {[
          {
            label: t('kTurn'),
            ...figure(view.service.turnMinutes, view.live ? '' : t('kTurnNote')),
            tone: 'text-success-700',
          },
          {
            label: t('kTicket'),
            ...figure(view.service.ticketTime, view.live ? '' : t('kTicketNote')),
            tone: 'text-warning-700',
          },
          {
            label: t('kRepeat'),
            ...figure(view.service.repeatShare, view.live ? '' : t('kRepeatNote')),
            tone: 'text-success-700',
          },
          {
            label: t('kVoid'),
            ...figure(view.service.voidRate, view.live ? '' : t('kVoidNote')),
            tone: 'text-fg-subtle',
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`${CARD} px-[22px] py-5`}>
            <div className="text-fg-subtle mb-[9px] text-xs">{kpi.label}</div>
            <div data-num className="font-display text-2xl font-semibold tracking-tight">
              {kpi.value}
            </div>
            <div
              className={`mt-1.5 text-xs font-semibold ${kpi.faded ? 'text-fg-subtle' : kpi.tone}`}
            >
              {kpi.note}
            </div>
          </div>
        ))}
      </div>

      {/* --------------------------------------------------- menu engineering */}
      <section className={`${CARD} mt-5 overflow-hidden`}>
        <div className="border-divider border-b px-[22px] pt-5 pb-4">
          <h3 className={H3}>{t('menuTitle')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{t('menuSub')}</p>
        </div>

        <div className="border-divider grid [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-3 border-b px-[22px] py-[18px]">
          {GROUPS.map((group) => {
            const style = GROUP_STYLE[group];
            const count = view.dishes.filter((dish) => dish.group === group).length;

            return (
              <div key={group} className={`rounded-md border px-4 py-3.5 ${style.tint}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm font-semibold ${style.text}`}>{t(group)}</span>
                  <span data-num className={`font-display text-xl font-bold ${style.text}`}>
                    {count}
                  </span>
                </div>
                <p className="text-fg-muted mt-1.5 text-xs leading-normal">{t(`${group}Sub`)}</p>
              </div>
            );
          })}
        </div>

        <TableCard
          columns={COLUMNS}
          className="rounded-none border-0"
          head={[
            t('colDish'),
            { label: t('colSold'), align: 'right' },
            { label: t('colPrice'), align: 'right' },
            { label: t('colCost'), align: 'right' },
            t('colMargin'),
            { label: t('colProfit'), align: 'right' },
            t('colGroup'),
          ]}
        >
          {view.dishes.map((dish) => {
            const style = GROUP_STYLE[dish.group];
            const margin = marginOfView(dish);

            return (
              <Row key={dish.key} columns={COLUMNS} className="py-3">
                <span className="min-w-0 text-sm font-semibold">{dish.label}</span>

                <span data-num className="text-fg-muted text-right text-sm">
                  {dish.sold}
                </span>
                <span data-num className="text-fg-muted text-right text-sm">
                  {formatTiyinAmount(dish.price)}
                </span>
                <span data-num className="text-fg-muted text-right text-sm">
                  {formatTiyinAmount(dish.cost)}
                </span>

                <span className="flex items-center gap-2.5">
                  <span className="flex-1">
                    <Rail percent={margin} colour={style.rail} />
                  </span>
                  <span data-num className="w-[34px] flex-none text-right text-xs font-semibold">
                    {margin}%
                  </span>
                </span>

                {/*
                 * The design prints profit in full — `this.f(...)`, grouped, no
                 * suffix (`dishRows`, `:16841`). It was shortened to "9.6M"
                 * here, which loses the comparison the column exists for: tea
                 * and plov are the two stars and their profits differ by a
                 * factor a rounded million hides.
                 */}
                <span data-num className="text-right text-sm font-semibold">
                  {formatTiyinAmount(profitOfView(dish))}
                </span>

                <span>
                  <span
                    className={`rounded-pill text-2xs inline-flex h-[22px] items-center px-[9px] font-semibold ${style.tint} ${style.text}`}
                  >
                    {t(dish.group)}
                  </span>
                </span>
              </Row>
            );
          })}
        </TableCard>
      </section>
    </>
  );
}

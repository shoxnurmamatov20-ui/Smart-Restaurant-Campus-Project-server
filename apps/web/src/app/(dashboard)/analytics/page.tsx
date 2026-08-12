import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { PageHead, Rail, Row, TableCard } from '../screen';
import { GROUP_STYLE, GROUPS, marginOf, profitOf, SERVICE } from './analytics-data';
import { getCategoryMix, getCoversByHour, getMenuEngineering } from './analytics-server';

export const generateMetadata = () => moduleMetadata('analytics');

/**
 * Thirty days, read four ways.
 *
 * Built to the design's Analytics screen: covers by hour against revenue by
 * category, four service figures, then menu engineering — every dish placed in
 * one of four groups by how much it sells and what it keeps.
 *
 * The covers chart shades its bars by height rather than colouring them all the
 * same: the two peaks are the point of the chart, and a flat blue row makes a
 * reader count instead of see.
 *
 * TODO — Phase 1 · analytics, once the module is built:
 *   - The period picker, and comparison against the previous one
 *   - Per-branch and per-channel breakdowns
 *   - Food cost from recipe cards rather than from a stored figure
 *   - Export, which Reports already offers on a schedule
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

  // The API when there is a session, the fixtures when there is not.
  const [dishes, covers, categories] = await Promise.all([
    getMenuEngineering(t),
    getCoversByHour(),
    getCategoryMix(t, locale),
  ]);

  const peak = Math.max(...covers, 1);

  return (
    <>
      <PageHead title={nav('analytics')} subtitle={t('subtitle')} />

      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.3fr)_minmax(0,1fr)] gap-5"
      >
        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={H3}>{t('coversTitle')}</h3>
          <p className="text-fg-subtle mt-1 mb-[22px] text-xs">{t('coversSub')}</p>

          <div className="flex h-[180px] items-end gap-2.5">
            {covers.map((covers, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <span data-num className="text-fg-subtle text-2xs">
                  {covers}
                </span>
                {/* Height in px against a fixed row — a percentage would resolve
                    against a parent with no resolved height. */}
                <span
                  className={`w-full rounded-t-[4px] ${
                    covers >= 70 ? 'bg-brand-500' : covers >= 40 ? 'bg-brand-300' : 'bg-brand-100'
                  }`}
                  style={{ height: Math.round((covers / peak) * 140) }}
                />
                <span data-num className="text-fg-subtle text-2xs">
                  {9 + index}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={H3}>{t('categoryTitle')}</h3>
          <p className="text-fg-subtle mt-1 mb-5 text-xs">{t('categorySub')}</p>

          {categories.map((category) => (
            <div key={category.id} className="py-[9px]">
              <div className="mb-[7px] flex justify-between">
                <span className="text-sm">{category.name}</span>
                <span className="flex gap-3">
                  <span data-num className="text-fg-subtle text-sm">
                    {(category.revenue / 100_000_000).toFixed(1)}M
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

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-5">
        {[
          {
            label: t('kTurn'),
            value: SERVICE.turnMinutes,
            note: t('kTurnNote'),
            tone: 'text-success-700',
          },
          {
            label: t('kTicket'),
            value: SERVICE.ticketTime,
            note: t('kTicketNote'),
            tone: 'text-warning-700',
          },
          {
            label: t('kRepeat'),
            value: SERVICE.repeatShare,
            note: t('kRepeatNote'),
            tone: 'text-success-700',
          },
          {
            label: t('kVoid'),
            value: SERVICE.voidRate,
            note: t('kVoidNote'),
            tone: 'text-fg-subtle',
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`${CARD} px-[22px] py-5`}>
            <div className="text-fg-subtle mb-[9px] text-xs">{kpi.label}</div>
            <div data-num className="font-display text-2xl font-semibold tracking-tight">
              {kpi.value}
            </div>
            <div className={`mt-1.5 text-xs font-semibold ${kpi.tone}`}>{kpi.note}</div>
          </div>
        ))}
      </div>

      <section className={`${CARD} mt-5 overflow-hidden`}>
        <div className="border-divider border-b px-[22px] pt-5 pb-4">
          <h3 className={H3}>{t('menuTitle')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{t('menuSub')}</p>
        </div>

        <div className="border-divider grid [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))] gap-3 border-b px-[22px] py-[18px]">
          {GROUPS.map((group) => {
            const style = GROUP_STYLE[group];
            const count = dishes.filter((dish) => dish.group === group).length;

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
          {dishes.map((dish) => {
            const style = GROUP_STYLE[dish.group];
            const margin = marginOf(dish);

            return (
              <Row key={dish.id} columns={COLUMNS} className="py-3">
                <span className="min-w-0 text-sm font-semibold">{dish.name}</span>

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

                <span data-num className="text-right text-sm font-semibold">
                  {(profitOf(dish) / 100_000_000).toFixed(1)}M
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

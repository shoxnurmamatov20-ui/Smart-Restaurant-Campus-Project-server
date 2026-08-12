import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { ACTION_PRIMARY, PageHead, Rail, Row, TableCard } from '../../screen';
import {
  attainment,
  BRANCH_PERFORMANCE,
  foodCostTone,
  LABOUR_BY_HOUR,
  LABOUR_SUMMARY,
  labourTone,
} from './branches-data';

export const generateMetadata = () => moduleMetadata('branches');

/**
 * Every venue side by side.
 *
 * Built to the design's Branches screen: the monthly target and how far each
 * branch has got, the comparison table, and payroll by hour underneath.
 *
 * Labour and food cost are shown as percentages of each branch's own revenue,
 * which is the only honest way to compare a 96-seat room in Chilonzor with a
 * 52-seat one in Termiz. The colours carry the thresholds a manager acts on —
 * over 30% labour is a rota to redraw, not a number to admire.
 *
 * TODO — Phase 1 · settings/branches, once the module is built:
 *   - Setting a target, which the steppers below already draw
 *   - The period switch, against the same period last year
 *   - Opening and archiving a branch
 *   - Per-branch overrides: menu, prices, opening hours
 */
const COLUMNS =
  '[grid-template-columns:minmax(0,1.1fr)_110px_130px_90px_120px_80px_90px_100px_90px]';
const CARD = 'bg-surface rounded-lg border';
const STEP =
  'border-border-strong bg-surface text-fg-muted hover:bg-bg-muted grid size-[26px] flex-none place-items-center rounded-sm border text-sm font-semibold';

export default async function BranchesPage() {
  const [nav, t, shell] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.branches'),
    getTranslations('console.shell'),
  ]);

  const peakLabour = Math.max(...LABOUR_BY_HOUR.map((hour) => hour.percent));

  return (
    <>
      <PageHead title={nav('branches')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION_PRIMARY}>
          {t('add')}
        </button>
      </PageHead>

      <section className={`${CARD} mb-[18px] overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-4 pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{t('targetTitle')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{t('targetSub')}</p>
        </div>

        {BRANCH_PERFORMANCE.map((branch) => {
          const percent = attainment(branch);

          return (
            <div
              key={branch.id}
              data-row
              className="border-divider grid [grid-template-columns:minmax(0,1fr)_150px_minmax(140px,1.1fr)_62px] items-center gap-4 border-b px-5 py-[13px]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{branch.name}</span>
                <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                  {formatTiyinAmount(branch.revenue * 30)}
                </span>
              </span>

              <span className="flex items-center justify-end gap-1.5">
                <button type="button" className={STEP} aria-label="−">
                  −
                </button>
                <span data-num className="font-display text-md min-w-16 text-center font-semibold">
                  {(branch.targetTiyin / 100_000_000).toFixed(0)}M
                </span>
                <button type="button" className={STEP} aria-label="+">
                  +
                </button>
              </span>

              <Rail
                percent={percent}
                colour={percent >= 95 ? 'var(--success-500)' : 'var(--warning-500)'}
              />

              <span
                data-num
                className={`text-right text-sm font-semibold ${
                  percent >= 95 ? 'text-success-700' : 'text-warning-700'
                }`}
              >
                {percent}%
              </span>
            </div>
          );
        })}
      </section>

      <TableCard
        columns={COLUMNS}
        head={[
          t('colBranch'),
          t('colShare'),
          { label: t('colRevenue'), align: 'right' },
          { label: t('colDelta'), align: 'right' },
          { label: t('colAov'), align: 'right' },
          { label: t('colMargin'), align: 'right' },
          { label: t('colLabour'), align: 'right' },
          { label: t('colFoodCost'), align: 'right' },
          { label: t('colStaff'), align: 'right' },
        ]}
      >
        {BRANCH_PERFORMANCE.map((branch) => (
          <Row key={branch.id} columns={COLUMNS}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{branch.name}</span>
              <span className="text-fg-subtle mt-0.5 block text-xs">
                {shell(branch.city === 'tashkent' ? 'cityTashkent' : 'cityTermiz')}
              </span>
            </span>

            <Rail
              percent={Math.round((branch.revenue / BRANCH_PERFORMANCE[0].revenue) * 100)}
              colour="var(--brand-500)"
            />

            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(branch.revenue)}
            </span>

            <span
              data-num
              className={`text-right text-sm font-medium ${
                branch.deltaPercent > 0 ? 'text-success-700' : 'text-danger-700'
              }`}
            >
              {branch.deltaPercent > 0 ? '+' : '−'}
              {Math.abs(branch.deltaPercent).toFixed(1)}%
            </span>

            <span data-num className="text-fg-muted text-right text-sm">
              {formatTiyinAmount(branch.averageOrder)}
            </span>
            <span data-num className="text-fg-muted text-right text-sm">
              {branch.margin.toFixed(1)}%
            </span>
            <span
              data-num
              className={`text-right text-sm font-medium ${labourTone(branch.labour)}`}
            >
              {branch.labour.toFixed(1)}%
            </span>
            <span
              data-num
              className={`text-right text-sm font-medium ${foodCostTone(branch.foodCost)}`}
            >
              {branch.foodCost.toFixed(1)}%
            </span>
            <span data-num className="text-fg-muted text-right text-sm">
              {branch.staff}
            </span>
          </Row>
        ))}
      </TableCard>

      <section className={`${CARD} mt-5 px-6 py-[22px]`}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h3 className="text-md tracking-snug font-semibold">{t('labourTitle')}</h3>
            <p className="text-fg-subtle mt-1 text-xs">{t('labourSub')}</p>
          </div>

          <div className="flex gap-7">
            <span>
              <span className="text-fg-subtle block text-xs">{t('labourTotal')}</span>
              <span data-num className="font-display mt-[3px] block text-xl font-bold">
                {LABOUR_SUMMARY.total}
              </span>
            </span>
            <span>
              <span className="text-fg-subtle block text-xs">{t('labourOver')}</span>
              <span
                data-num
                className="font-display text-warning-700 mt-[3px] block text-xl font-bold"
              >
                {LABOUR_SUMMARY.overstaffedHours}
              </span>
            </span>
          </div>
        </div>

        <div className="mt-[22px] flex h-[150px] items-end gap-2">
          {LABOUR_BY_HOUR.map((hour) => (
            <div key={hour.hour} className="flex flex-1 flex-col items-center gap-2">
              <span data-num className="text-fg-subtle text-2xs">
                {hour.percent}%
              </span>
              <span
                className={`w-full rounded-t-[4px] ${
                  hour.percent > 35
                    ? 'bg-warning-500'
                    : hour.percent > 25
                      ? 'bg-brand-300'
                      : 'bg-brand-500'
                }`}
                style={{ height: Math.round((hour.percent / peakLabour) * 110) }}
              />
              <span data-num className="text-fg-subtle text-2xs">
                {hour.hour}
              </span>
            </div>
          ))}
        </div>

        <p className="text-fg-subtle mt-3.5 text-xs">{t('labourBench')}</p>
      </section>
    </>
  );
}

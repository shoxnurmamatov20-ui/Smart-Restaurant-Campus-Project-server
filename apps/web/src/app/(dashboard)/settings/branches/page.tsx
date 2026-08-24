import { getLocale, getTranslations } from 'next-intl/server';

import type { Lang } from '@/lib/console-post';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { ACTION_PRIMARY, PageHead, Rail, Row, TableCard } from '../../screen';
import { foodCostTone, LABOUR_BY_HOUR, LABOUR_SUMMARY, labourTone } from './branches-data';
import { attainmentPercent, branchesScreen } from './branches-server';
import { AddBranch } from './add-branch';
import { DeliveryTermsRow } from './delivery-terms';
import { TargetStepper } from './target-stepper';

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
 * All nine columns are the restaurant's own, from one report —
 * `GET /api/v1/analytics/branches?period=month`, which reads the venue register
 * and `analytics.daily_facts` together. Six of them used to be dashes;
 * `branches-server.ts` says which three still can be, and why those three are
 * withheld rather than drawn as a zero.
 *
 * Still to build:
 *   - The period switch, against the same period last year
 *   - Archiving a branch (`DELETE /api/v1/branches/{branch}` exists; the screen
 *     has nowhere to put it, because the design draws no row menu here)
 *   - Per-branch overrides: menu, prices, opening hours
 *   - Per-hour labour for ONE venue. The curve below is the whole business's
 *     week; narrowing it needs the branch switcher in the shell, which reads
 *     every screen in the console and is not this file's to change.
 */
const COLUMNS =
  '[grid-template-columns:minmax(0,1.1fr)_110px_130px_90px_120px_80px_90px_100px_90px]';
const CARD = 'bg-surface rounded-lg border';
const STEP =
  'border-border-strong bg-surface text-fg-muted hover:bg-bg-muted grid size-[26px] flex-none place-items-center rounded-sm border text-sm font-semibold';

export default async function BranchesPage() {
  const [nav, t, shell, blank, screen, city, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.branches'),
    getTranslations('console.shell'),
    getTranslations('console.empty'),
    branchesScreen(),
    getTranslations('console.city'),
    getLocale(),
  ]);

  /*
   * The labour curve: the restaurant's own hours where they exist, the design's
   * fourteen bars where the screen is the demo.
   *
   * `screen.labour` is null on a live console with no attendance for the week —
   * see `labourFrom()` — and the panel is hidden for that, which is the same
   * answer this screen gave before the endpoint existed. What changed is that
   * it is now a fact about this restaurant rather than about the platform.
   */
  const curve =
    screen.labour?.hours.map((hour) => ({ hour: hour.hour, percent: hour.percent ?? 0 })) ??
    (screen.live ? [] : LABOUR_BY_HOUR);
  const peakLabour = Math.max(1, ...curve.map((hour) => hour.percent));
  const branches = screen.rows;

  /*
   * The header counts the venues on the table under it.
   *
   * `t('subtitle')` says "5 filial · 330 o'rin · 69 xodim · avgust oyi" — the
   * design's own group — so a one-branch restaurant opened this screen to
   * manage its single venue and was told it had five. Seats are not on the
   * report, so the clause is dropped rather than guessed; the staff count is,
   * per venue, and a venue the projection has no payroll for reads null and is
   * left out of the sum rather than counted as zero.
   */
  const staffCount = branches.reduce((total, branch) => total + (branch.staff ?? 0), 0);

  const subtitle = screen.live
    ? t('subtitleLive', { branches: branches.length, staff: staffCount })
    : t('subtitle');
  /* The rail is drawn against the leader, and the list arrives biggest first. */
  const leader = branches[0]?.revenue ?? 0;

  /* A column nobody publishes per branch. The dash is the answer — see the
     file comment above and `branches-server.ts`. */
  const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);

  return (
    <>
      <PageHead title={nav('branches')} subtitle={subtitle}>
        {/* `POST /api/v1/branches` through `/api/branches`. It is core and has
            always existed; the note this button used to show — go and do it in
            the platform console — was wrong about where a branch is opened. */}
        <AddBranch
          label={t('add')}
          field={t('colBranch')}
          offline={shell('offline')}
          className={ACTION_PRIMARY}
        />
      </PageHead>

      {/*
       * What each venue charges to deliver.
       *
       * Above the target card because it is the one panel on this screen a
       * guest feels: `PublicOrderController` prices every delivery from these
       * three keys, and until they were declared in `config/settings.php` a
       * restaurant could not set them at all — the write was validated away,
       * the storefront quoted zero and the bill charged whatever was on the
       * row. Fee, the basket that makes it free, and the smallest order the
       * kitchen will take.
       */}
      <section className={`${CARD} mb-[18px] overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-4 pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{t('deliveryTitle')}</h3>
          <p className="text-fg-subtle mt-1 text-xs">{t('deliverySub')}</p>
        </div>

        {branches.map((branch) => (
          <div
            key={branch.id}
            data-row
            className="border-divider grid [grid-template-columns:minmax(0,1fr)_minmax(320px,1.4fr)] items-center gap-4 border-b px-5 py-[13px] last:border-b-0"
          >
            <span className="min-w-0 text-sm font-semibold">{branch.name}</span>

            <DeliveryTermsRow
              branchId={branch.id}
              initial={branch.delivery}
              live={screen.live}
              lang={locale as Lang}
              labels={{
                fee: t('deliveryFee'),
                freeOver: t('deliveryFreeOver'),
                minimum: t('deliveryMinimum'),
                kitchen: t('deliveryKitchen'),
                travel: t('deliveryTravel'),
                pickup: t('deliveryPickup'),
                saved: t('deliverySaved'),
                failed: t('deliveryFailed'),
              }}
            />
          </div>
        ))}
      </section>

      <section className={`${CARD} mb-[18px] overflow-hidden`}>
        <div className="border-divider border-b px-5 pt-4 pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{t('targetTitle')}</h3>
          {/* The stepper moves in 1M so'm — `TargetStepper.STEP_TIYIN` is
              100 000 000 tiyin — and the catalogue's sentence said five. */}
          <p className="text-fg-subtle mt-1 text-xs">{t('targetSubLive')}</p>
        </div>

        {branches.map((branch) => {
          const attained = attainmentPercent(branch);

          return (
            <div
              key={branch.id}
              data-row
              className="border-divider grid [grid-template-columns:minmax(0,1fr)_150px_minmax(140px,1.1fr)_62px] items-center gap-4 border-b px-5 py-[13px]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{branch.name}</span>
                <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                  {formatTiyinAmount(branch.revenue)}
                </span>
              </span>

              <span className="flex items-center justify-end gap-1.5">
                <TargetStepper
                  branchId={branch.id}
                  initialTiyin={branch.targetTiyin}
                  live={screen.live}
                  lang={locale as Lang}
                  stepClassName={STEP}
                  minusLabel={t('targetDown')}
                  plusLabel={t('targetUp')}
                  note={t.raw('targetSet') as string}
                  failed={t('targetFailed')}
                />
              </span>

              <Rail
                percent={attained}
                colour={attained >= 95 ? 'var(--success-500)' : 'var(--warning-500)'}
              />

              <span
                data-num
                className={`text-right text-sm font-semibold ${
                  attained >= 95 ? 'text-success-700' : 'text-warning-700'
                }`}
              >
                {attained}%
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
        empty={{ title: blank('branches'), body: blank('branchesSub') }}
      >
        {branches.map((branch) => (
          <Row key={branch.id} columns={COLUMNS}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{branch.name}</span>
              {/* The console has a word for two cities; a venue anywhere else
                  keeps whatever the register stores, which is a proper noun and
                  reads the same in all three languages. */}
              <span className="text-fg-subtle mt-0.5 block text-xs">
                {branch.cityKey === null ? (branch.cityLabel ?? '') : city(branch.cityKey)}
              </span>
            </span>

            <Rail
              percent={leader === 0 ? 0 : Math.round((branch.revenue / leader) * 100)}
              colour="var(--brand-500)"
            />

            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(branch.revenue)}
            </span>

            <span
              data-num
              className={`text-right text-sm font-medium ${
                branch.deltaPercent === null
                  ? 'text-fg-subtle'
                  : branch.deltaPercent > 0
                    ? 'text-success-700'
                    : 'text-danger-700'
              }`}
            >
              {branch.deltaPercent === null
                ? '—'
                : `${branch.deltaPercent > 0 ? '+' : '−'}${Math.abs(branch.deltaPercent).toFixed(1)}%`}
            </span>

            <span data-num className="text-fg-muted text-right text-sm">
              {formatTiyinAmount(branch.averageOrder)}
            </span>
            <span data-num className="text-fg-muted text-right text-sm">
              {percent(branch.margin)}
            </span>
            <span
              data-num
              className={`text-right text-sm font-medium ${
                branch.labour === null ? 'text-fg-subtle' : labourTone(branch.labour)
              }`}
            >
              {percent(branch.labour)}
            </span>
            <span
              data-num
              className={`text-right text-sm font-medium ${
                branch.foodCost === null ? 'text-fg-subtle' : foodCostTone(branch.foodCost)
              }`}
            >
              {percent(branch.foodCost)}
            </span>
            <span data-num className="text-fg-muted text-right text-sm">
              {branch.staff ?? '—'}
            </span>
          </Row>
        ))}
      </TableCard>

      {/*
       * Labour by hour, from the restaurant's own attendance.
       *
       * Every figure in it used to be `LABOUR_BY_HOUR` and `LABOUR_SUMMARY`
       * from `branches-data.ts` — drawn beside real revenue and real staff
       * counts, under a caption that tells a manager to cut shifts.
       * `GET /analytics/labour-by-hour` answers it now: the labour half comes
       * through `App\Contracts\Staff\Roster` as twenty-four totals with no
       * names on them, which is what makes an hourly chart something Analytics
       * may have at all.
       */}
      <section className={`${CARD} mt-5 px-6 py-[22px]`} hidden={curve.length === 0}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h3 className="text-md tracking-snug font-semibold">{t('labourTitle')}</h3>
            <p className="text-fg-subtle mt-1 text-xs">{t('labourSub')}</p>
          </div>

          <div className="flex gap-7">
            <span>
              <span className="text-fg-subtle block text-xs">{t('labourTotal')}</span>
              <span data-num className="font-display mt-[3px] block text-xl font-bold">
                {/* The window's own share, or a dash. A week that took nothing
                    has no labour percentage — the ratio is undefined, not 100. */}
                {screen.labour === null
                  ? LABOUR_SUMMARY.total
                  : screen.labour.sharePercent === null
                    ? '—'
                    : `${screen.labour.sharePercent.toFixed(1)}%`}
              </span>
            </span>
            <span>
              <span className="text-fg-subtle block text-xs">{t('labourOver')}</span>
              <span
                data-num
                className="font-display text-warning-700 mt-[3px] block text-xl font-bold"
              >
                {screen.labour === null
                  ? LABOUR_SUMMARY.overstaffedHours
                  : screen.labour.overstaffed}
              </span>
            </span>
          </div>
        </div>

        <div className="mt-[22px] flex h-[150px] items-end gap-2">
          {curve.map((hour) => (
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

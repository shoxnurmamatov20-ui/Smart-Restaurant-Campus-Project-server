import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { getOverview } from '../../(dashboard)/dashboard/overview-data';

export async function generateMetadata() {
  const t = await getTranslations('console.mobile');
  return { title: t('title') };
}

/**
 * The owner's phone.
 *
 * Built to the design's mobile surface: one column, 390px wide, everything an
 * owner checks between meetings — today's takings with its sparkline, orders
 * and covers, the one thing that needs attention, then the branches and two
 * buttons.
 *
 * A route rather than a native screen. The React Native app is Phase 2, and
 * until it ships an owner opening this on a phone gets the real figures rather
 * than nothing; when the app lands, this is the shape it is built to.
 *
 * `max-w-[390px]` and `mx-auto`, so on a phone it fills the screen and on a
 * desktop it sits in the middle at the width it was drawn for — the design
 * frames it the same way.
 *
 * TODO — Phase 2 · mobile:
 *   - The React Native app in apps/mobile, to this shape
 *   - Push notifications, which is the real reason an owner installs it
 *   - Biometric sign-in
 */
const CARD = 'rounded-lg border p-4';

export default async function MobilePage() {
  const [data, t, dashboard, nav] = await Promise.all([
    getOverview(),
    getTranslations('console.mobile'),
    getTranslations('console.dashboard'),
    getTranslations('console.nav'),
  ]);

  const revenue = data.kpis.find((kpi) => kpi.key === 'revenue');
  const orders = data.kpis.find((kpi) => kpi.key === 'orders');

  /* The sparkline: today's hours, in the viewBox the design uses. */
  const peak = Math.max(...data.hours.map((point) => point.today));
  const spark = data.hours
    .map((point, index) => {
      const x = (index / (data.hours.length - 1)) * 300;
      const y = 52 - (point.today / peak) * 45;
      return `${x.toFixed(0)},${y.toFixed(0)}`;
    })
    .join(' ');

  return (
    <div className="bg-bg-muted flex min-h-screen justify-center p-0 sm:p-8">
      <div className="bg-surface w-full max-w-[390px] flex-none overflow-hidden border sm:rounded-2xl sm:shadow-xl">
        <div className="flex h-11 items-end justify-between px-[22px] pb-1.5 text-xs font-semibold">
          <span data-num>11:24</span>
          <span className="text-fg-muted flex gap-1.5">····· ▮</span>
        </div>

        <div className="px-5 pt-3 pb-5">
          <div className="mb-[18px] flex items-center justify-between">
            <div>
              <div className="text-fg-subtle text-xs">{t('today')}</div>
              <div className="font-display tracking-snug mt-0.5 text-xl font-semibold">
                {t('live')}
              </div>
            </div>
            <Link
              href="/dashboard"
              className="bg-brand-100 text-brand-700 rounded-pill grid size-9 place-items-center text-xs font-semibold"
            >
              RK
            </Link>
          </div>

          <div className={`${CARD} mb-3 px-5 py-[18px]`}>
            <div className="text-fg-subtle text-xs">{dashboard('kRevenue')}</div>
            <div data-num className="font-display mt-1.5 text-3xl font-semibold tracking-tight">
              {formatTiyinAmount(revenue?.value ?? 0)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-fg-subtle text-xs">{dashboard('som')}</span>
              <span data-num className="text-success-700 text-xs font-semibold">
                {t('versusYesterday')}
              </span>
            </div>

            <svg
              viewBox="0 0 300 60"
              preserveAspectRatio="none"
              className="mt-3.5 h-[52px] w-full"
              role="img"
              aria-label={dashboard('chartAlt')}
            >
              <polyline
                points={spark}
                fill="none"
                stroke="var(--brand-500)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className={CARD}>
              <div className="text-fg-subtle text-xs">{dashboard('kOrders')}</div>
              <div data-num className="font-display mt-[5px] text-xl font-semibold">
                {orders?.value ?? 0}
              </div>
            </div>
            <div className={CARD}>
              <div className="text-fg-subtle text-xs">{t('tablesSeated')}</div>
              <div data-num className="font-display mt-[5px] text-xl font-semibold">
                14 / 32
              </div>
            </div>
          </div>

          <div className={`${CARD} bg-warning-50 mb-4 flex gap-3`}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--warning-600)"
              strokeWidth="2"
              strokeLinecap="round"
              className="mt-px flex-none"
              aria-hidden
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" />
            </svg>
            <div>
              <div className="text-warning-700 text-sm font-semibold">{t('alertTitle')}</div>
              <div className="text-warning-700 mt-[3px] text-xs opacity-85">{t('alertBody')}</div>
            </div>
          </div>

          <div className="text-fg-subtle text-2xs tracking-caps mb-2.5 font-semibold uppercase">
            {t('branches')}
          </div>

          {data.branches.map((branch) => (
            <div
              key={branch.id}
              className="border-divider flex items-center justify-between border-b py-[11px]"
            >
              <span className="text-sm font-medium">{branch.name}</span>
              <span className="flex items-baseline gap-2.5">
                <span data-num className="text-sm font-semibold">
                  {formatTiyinAmount(branch.revenue)}
                </span>
                <span
                  data-num
                  className={`w-[52px] text-right text-xs font-semibold ${
                    branch.deltaPercent > 0 ? 'text-success-700' : 'text-danger-700'
                  }`}
                >
                  {branch.deltaPercent > 0 ? '+' : '−'}
                  {Math.abs(branch.deltaPercent).toFixed(1)}%
                </span>
              </span>
            </div>
          ))}

          {/* 48px targets, thumb-sized, as the design has them. */}
          <div className="mt-5 flex gap-2 border-t pt-4">
            <Link
              href="/pos"
              className="bg-brand-500 grid h-12 flex-1 place-items-center rounded-md text-sm font-semibold text-white"
            >
              {t('openPos')}
            </Link>
            <Link
              href="/kitchen"
              className="grid h-12 flex-1 place-items-center rounded-md border text-sm font-semibold"
            >
              {nav('kitchen')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

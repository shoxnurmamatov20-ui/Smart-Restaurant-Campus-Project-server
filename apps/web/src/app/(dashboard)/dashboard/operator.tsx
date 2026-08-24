import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';
import {
  EmptyState,
  KpiCard,
  KpiRow,
  PageHead,
  Panel,
  PanelHead,
  ProgressRail,
} from '@restaurant/ui';

import { type Period } from './overview-data';
import { PeriodToggle } from './period-toggle';

import { hourLabel, peakHour, type IntakeChannelKey } from './operator-data';
import { getOperatorLive } from './dashboard-server';
import { peakOf, rail, show } from './figures';

/**
 * The order-intake desk.
 *
 * The seventh dashboard variant, and the one this console did not have — the
 * design names nine roles and six dashboards were built, so an operator signing
 * in landed on the owner's revenue chart.
 *
 * Four figures across the top, and all four are speed or its consequences.
 * Under them, the two panels that decide the shift: which door the work is
 * coming through, and what is already late. The CTA goes to the queue rather
 * than back to a summary — the whole role is a queue, and every second on this
 * page is a second a caller is holding.
 */
export async function OperatorDashboard({ period = 'today' }: { period?: Period }) {
  const [data, t, shared] = await Promise.all([
    getOperatorLive(period),
    getTranslations('console.dashOperator'),
    getTranslations('console.dashboard'),
  ]);

  const CHANNEL_LABEL: Record<IntakeChannelKey, string> = {
    phone: t('chPhone'),
    telegram: 'Telegram',
    yandex: 'Yandex Eats',
    uzum: 'Uzum Tezkor',
    site: t('chSite'),
  };

  const CHANNEL_INK: Record<IntakeChannelKey, string> = {
    phone: 'var(--brand-500)',
    telegram: 'var(--accent-500)',
    yandex: 'var(--warning-500)',
    uzum: 'var(--danger-500)',
    site: 'var(--n-400)',
  };

  // Seeded rather than reduced over a possibly empty list, and read as a
  // divisor below — an intake desk that has taken nothing has no busiest lane.
  const busiestChannel = peakOf(data.channels.map((channel) => channel.orders));
  const peak = peakHour(data.hourly);
  const tallest = peakOf([...data.hourly]);
  const queue = data.queue ?? 0;

  /*
   * Who is reading, and where the queue is.
   *
   * Joined here rather than in the catalogue: a name and a place with a middot
   * between them reads identically in all three languages, which is the
   * definition of data rather than copy — `i18n.test.ts` refuses such a key by
   * name. The design's own line hardcoded a person from the mock-up
   * ("Dilnoza Rahimova") and a shift start nobody set ("since 12:00").
   */
  const lede = data.live
    ? `${data.greetingName} · ${data.placeName}`
    : t('lede', { name: data.greetingName });

  return (
    <>
      <PageHead
        eyebrow={t('overline')}
        title={t('title', { n: queue })}
        lede={lede}
        action={
          <PeriodToggle
            current={period}
            ariaLabel={shared('kpiLabel')}
            labels={{
              today: shared('periodToday'),
              week: shared('periodWeek'),
              month: shared('periodMonth'),
            }}
          />
        }
      />

      <KpiRow aria-label={shared('kpiLabel')}>
        {/*
          Every target and every delta on this row was a literal — a 90-order
          day, a sixty-second answer, `+12 vs yesterday`, `+4.2%`, `3.4% of
          orders`. None of them is a figure this platform recorded, so a live
          desk gets the count and no score against it.
        */}
        <KpiCard
          label={t('kTaken')}
          value={show(data.taken, formatNumber)}
          attainment={rail(data.live, data.taken, data.takenTarget ?? 0)}
          target={data.takenTarget === null ? undefined : t('targetTaken', { n: data.takenTarget })}
        />
        {/*
         * Answer time is the one figure where lower is better, so the rail
         * reads as an allowance rather than an achievement: it is how much of
         * the sixty seconds the desk is using.
         *
         * The card is not drawn at all on a live desk. Time to answer lives in
         * a telephony log this platform does not have, and it is the figure the
         * whole role is judged on — a card reading `0:38 · −0:07` on every
         * tenant every day is the worst thing on this screen.
         */}
        {data.answer === null ? null : (
          <KpiCard
            label={t('kAnswer')}
            value={data.answer}
            delta={data.live ? undefined : '−0:07'}
            attainment={
              data.answerSeconds === null || data.answerTargetSeconds === null
                ? null
                : Math.min(100, (data.answerSeconds / data.answerTargetSeconds) * 100)
            }
            railTone={
              (data.answerSeconds ?? 0) >= (data.answerTargetSeconds ?? Infinity)
                ? 'danger'
                : 'success'
            }
            target={
              data.answerTarget === null
                ? undefined
                : t('targetAnswer', { time: data.answerTarget })
            }
          />
        )}
        <KpiCard
          label={t('kAverage')}
          value={show(data.averageOrder, formatTiyinAmount)}
          unit={shared('som')}
          delta={data.live ? undefined : '+4.2%'}
          attainment={rail(data.live, data.averageOrder, data.averageOrderTarget ?? 0)}
          railTone="success"
          target={
            data.averageOrderTarget === null
              ? undefined
              : t('targetAverage', { amount: formatTiyinAmount(data.averageOrderTarget) })
          }
        />
        <KpiCard
          label={t('kDeclined')}
          value={show(data.declined, formatNumber)}
          unit={data.live ? undefined : t('ofOrders', { percent: '3.4' })}
          attainment={rail(data.live, data.declined, data.declinedLimit ?? 0)}
          railTone={(data.declined ?? 0) >= (data.declinedLimit ?? Infinity) ? 'danger' : 'warning'}
          target={
            data.declinedLimit === null ? undefined : t('targetDeclined', { n: data.declinedLimit })
          }
        />
      </KpiRow>

      <div data-split className="grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="p-5">
            <PanelHead
              title={t('channelsHead')}
              subtitle={data.live ? t('channelsSubLive') : t('channelsSub')}
            />

            {data.channels.length === 0 ? (
              <EmptyState className="py-4">{t('channelsEmpty')}</EmptyState>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {data.channels.map((channel) => (
                  <li key={channel.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 flex-none rounded-full"
                          style={{ background: CHANNEL_INK[channel.key] }}
                          aria-hidden
                        />
                        {CHANNEL_LABEL[channel.key]}
                      </span>
                      <span data-num className="text-fg-muted text-xs">
                        {t('ordersAnd', {
                          n: channel.orders,
                          amount: formatTiyinAmount(channel.revenue),
                        })}
                      </span>
                    </div>
                    <ProgressRail
                      percent={busiestChannel === 0 ? 0 : (channel.orders / busiestChannel) * 100}
                      tone="brand"
                      label={CHANNEL_LABEL[channel.key]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-5">
            <PanelHead title={t('loadHead')} subtitle={t('loadSub')} />

            {/*
             * Twelve bars, noon to midnight, and the tallest is coloured. The
             * caption names the hour rather than leaving a reader to count
             * along the axis, because the whole panel exists to answer "when
             * does the second person start".
             */}
            {data.hourly.length === 0 || tallest === 0 ? (
              <EmptyState className="py-4">{t('loadEmpty')}</EmptyState>
            ) : (
              <>
                <div className="mt-4 flex items-end gap-1.5" style={{ height: 110 }}>
                  {data.hourly.map((count, index) => (
                    <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                      <span
                        className="w-full rounded-t-[3px]"
                        style={{
                          height: `${Math.max(6, Math.round((count / tallest) * 96))}px`,
                          background: index === peak ? 'var(--warning-500)' : 'var(--brand-200)',
                        }}
                        aria-hidden
                      />
                      <span data-num className="text-fg-subtle text-2xs">
                        {hourLabel(index)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-warning-700 mt-3 text-xs font-semibold">
                  {t('peak', { hour: `${hourLabel(peak)}:00` })}
                </p>
              </>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Link
            href="/calls"
            className="bg-brand-500 hover:bg-brand-600 flex flex-col items-center justify-center rounded-lg px-5 py-6 text-center text-white"
          >
            <span className="font-display tracking-snug text-xl font-semibold">{t('cta')}</span>
            <span className="mt-1 text-xs opacity-85">{t('ctaSub', { n: queue })}</span>
          </Link>

          <Panel className="p-5">
            <PanelHead title={t('lateHead')} subtitle={t('lateSub')} />

            {data.late.length === 0 ? (
              <EmptyState className="py-4">{t('lateEmpty')}</EmptyState>
            ) : (
              <ul className="mt-3.5 flex flex-col gap-2.5">
                {data.late.map((delivery) => (
                  <li key={delivery.order} className="flex items-center gap-3">
                    <span
                      className="h-9 w-1 flex-none rounded-full"
                      style={{
                        background:
                          delivery.severity === 'danger'
                            ? 'var(--danger-500)'
                            : 'var(--warning-500)',
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span data-num className="block text-sm font-semibold">
                        {delivery.order}
                      </span>
                      <span className="text-fg-subtle block text-xs">{delivery.where}</span>
                    </span>
                    <span className="text-right">
                      <span
                        data-num
                        className={`block text-sm font-semibold ${
                          delivery.severity === 'danger' ? 'text-danger-600' : 'text-warning-600'
                        }`}
                      >
                        {delivery.late}
                      </span>
                      <span className="text-fg-subtle block text-xs">
                        {t(`reason.${delivery.reason}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-5">
            <PanelHead title={t('topHead')} />

            {data.top.length === 0 ? (
              <EmptyState className="py-4">{t('topEmpty')}</EmptyState>
            ) : (
              <ol className="mt-3 flex flex-col gap-2">
                {data.top.map((dish, index) => (
                  <li key={dish.name} className="flex items-baseline gap-3 text-sm">
                    <span data-num className="text-fg-subtle w-4 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{dish.name}</span>
                    <span data-num className="text-fg-muted text-xs">
                      {t('sold', { n: dish.sold })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

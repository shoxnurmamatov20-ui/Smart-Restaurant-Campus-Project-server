import { getTranslations } from 'next-intl/server';

import { Chip, Head, Stats } from '../../platform-ui';
import { UPTIME, uptimePercent } from '../platform-data';
import { platformOverview } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('health') };
}

/**
 * Is the platform standing up.
 *
 * Thirty bars, one per day, and the two bad days are visible without reading a
 * number. A single "99.7% uptime" figure hides the shape entirely: one
 * two-and-a-half-hour outage and thirty slightly-degraded days produce the same
 * percentage and are completely different problems.
 *
 * The last backup is on this page and not buried in settings, because it is the
 * one number whose staleness nobody notices until the day it matters.
 */
export default async function HealthPage() {
  const [t, nav] = await Promise.all([
    getTranslations('console.platformHealth'),
    getTranslations('console.platformNav'),
  ]);

  const data = await platformOverview();
  const month = uptimePercent();

  /*
   * Counted from the same series the bars are drawn from.
   *
   * The subtitle used to assert "two days fell below target" whatever the
   * chart showed — a sentence about an SLO that could not be wrong and could
   * not be right either. 99.9% is the threshold the bars are coloured at, so it
   * is the threshold that is counted.
   */
  const below = UPTIME.days.filter((day) => day < 99.9).length;

  return (
    <>
      <Head title={nav('health')} subtitle={t('subtitle')} />

      <Stats
        items={[
          {
            label: t('kpiUptime'),
            value: `${month.toFixed(2)}%`,
            note: t('kpiUptimeNote'),
            tone: month >= 99.9 ? 'success' : 'warning',
          },
          { label: t('kpiLatency'), value: `${UPTIME.apiLatencyMs} ms`, note: t('kpiLatencyNote') },
          {
            label: t('kpiSyncErrors'),
            value: String(UPTIME.syncErrors24h),
            note: t('kpiSyncNote'),
            tone: UPTIME.syncErrors24h > 0 ? 'warning' : 'success',
          },
          { label: t('kpiBackup'), value: UPTIME.lastBackup, note: t('kpiBackupNote') },
        ]}
      />

      <section className="bg-surface mb-3 rounded-lg border p-5">
        <h3 className="text-md font-semibold">{t('uptimeTitle')}</h3>
        <p className="text-fg-subtle mt-1 text-xs">{t('uptimeSubLive', { n: below })}</p>

        <div className="mt-4 flex items-end gap-[3px]" style={{ height: 72 }}>
          {UPTIME.days.map((day, index) => (
            <span
              key={index}
              title={`${day}%`}
              className="min-w-0 flex-1 rounded-t-[2px]"
              style={{
                /* Scaled from 97, not from zero: every bar would otherwise be
                   the same height and the outage would be invisible. */
                height: `${Math.max(6, ((day - 97) / 3) * 72)}px`,
                background:
                  day >= 99.9
                    ? 'var(--success-500)'
                    : day >= 99
                      ? 'var(--warning-500)'
                      : 'var(--danger-500)',
              }}
            />
          ))}
        </div>
      </section>

      <section className="bg-surface rounded-lg border p-5">
        <h3 className="text-md font-semibold">{t('servicesTitle')}</h3>

        {data.health.length === 0 ? (
          /* Nothing measures Redis, the queue or the broadcaster yet, so the
             four rows are no longer drawn as constant green chips on the one
             screen whose job is to notice that something is not healthy. */
          <p className="text-fg-subtle mt-2 text-sm">{t('servicesUnavailable')}</p>
        ) : null}

        <ul className="mt-3.5 flex flex-col gap-2.5">
          {data.health.map((service) => (
            <li
              key={service.id}
              className="border-divider flex items-center gap-3 border-b pb-2.5 last:border-0"
            >
              <span className="flex-1 text-sm font-medium">
                {/*
                 * API and Realtime are the products' own names and read the
                 * same in all three languages, so they are not in the message
                 * catalogue — `i18n.test.ts` rejects entries that are
                 * identical across locales, and it is right to.
                 */}
                {service.id === 'api'
                  ? 'API'
                  : service.id === 'realtime'
                    ? 'Realtime'
                    : t(`service_${service.id}`)}
              </span>
              <span data-num className="text-fg-muted text-sm">
                {service.reading}
              </span>
              <Chip tone={service.status === 'healthy' ? 'success' : 'warning'}>
                {t(`status_${service.status}`)}
              </Chip>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

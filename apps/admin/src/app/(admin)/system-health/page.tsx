import { getTranslations } from 'next-intl/server';

import { HEALTH_ROWS, LOG_DOT, SYSTEM_LOG } from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('health') };
}

/** Which health row belongs to which catalogue key, in the design's order. */
const HEALTH_KEYS = [
  'uptime',
  'latency',
  'dbLoad',
  'offlineTerminals',
  'syncErrors',
  'errorRate',
] as const;

/**
 * How the platform itself is doing.
 *
 * Built to the design's health view: six measurements with bars on the left,
 * the day's events on the right.
 *
 * Every row carries a bar as well as a number. "4 / 2 380 terminals offline"
 * is unreadable as a figure — is that bad? — and obvious as a nearly-empty bar.
 *
 * TODO — once the platform API lands:
 *   - Live figures from the metrics endpoint rather than a page someone opens
 *   - Alerting, so nobody has to remember to look
 *   - Per-region and per-branch drilldown on the offline count
 */
const CARD = 'bg-surface rounded-lg border px-[26px] py-6';
const H3 = 'text-md font-semibold tracking-snug';

export default async function SystemHealthPage() {
  const t = await getTranslations('platform.overview');
  const health = await getTranslations('platform.health');

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] gap-5">
      <section className={CARD}>
        <h3 className={`${H3} mb-5`}>{t('health')}</h3>

        {HEALTH_ROWS.map((row, index) => (
          <div key={HEALTH_KEYS[index]} className="py-2.5">
            <div className="mb-2 flex justify-between gap-3">
              <span className="text-fg-muted text-sm">{health(HEALTH_KEYS[index]!)}</span>
              <span data-num className={`text-sm font-semibold ${row.tone ?? ''}`}>
                {row.value}
              </span>
            </div>

            <div className="bg-bg-muted h-[5px] overflow-hidden rounded-[3px]">
              <div
                className="bg-brand-500 h-full rounded-[3px]"
                style={{ width: `${row.percent}%` }}
              />
            </div>
          </div>
        ))}
      </section>

      <section className={CARD}>
        <h3 className={`${H3} mb-4`}>{t('logs')}</h3>

        {SYSTEM_LOG.map((entry) => (
          <div
            key={entry.time}
            className="border-divider flex gap-3 border-b py-[11px] last:border-b-0"
          >
            <span
              aria-hidden
              className={`rounded-pill mt-1.5 size-[7px] flex-none ${LOG_DOT[entry.level]}`}
            />
            <span className="min-w-0 flex-1">
              <span className="text-fg-muted block text-sm leading-normal">{entry.text}</span>
              <span data-num className="text-fg-subtle text-2xs mt-[3px] block">
                {entry.time}
              </span>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

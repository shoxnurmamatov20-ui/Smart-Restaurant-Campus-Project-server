import { getTranslations } from 'next-intl/server';

import { atLimit, PLAN_TIERS, USAGE } from '../platform-data';
import { platformOverview } from '../platform-server';
import { Chip, Head, Rail } from '../../platform-ui';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('subscription') };
}

/**
 * What each tenant is allowed and what they are actually doing.
 *
 * The screen exists to find two things, and they look different: a tenant at
 * their ceiling is a sale, and a tenant nowhere near it on the top tier is a
 * downgrade waiting to be asked for. Both are one glance if the rails are drawn
 * and neither is if the numbers are only stated.
 *
 * An unlimited row draws no rail at all rather than an empty one — there is
 * nothing to be a proportion of, and a permanently empty bar reads as zero
 * usage.
 */
export default async function SubscriptionPage() {
  const [t, nav] = await Promise.all([
    getTranslations('console.platformSub'),
    getTranslations('console.platformNav'),
  ]);

  const data = await platformOverview();
  const NAME: Record<string, string> = {
    start: 'Start',
    growth: 'Growth',
    enterprise: 'Enterprise',
  };

  const tracked = data.list.filter((tenant) => USAGE[tenant.id] !== undefined);

  return (
    <>
      <Head title={nav('subscription')} subtitle={t('subtitle')} />

      <div className="flex flex-col gap-3">
        {tracked.map((tenant) => {
          const rows = USAGE[tenant.id]!;
          const tier = PLAN_TIERS.find((entry) => entry.id === tenant.plan)!;
          const pressing = rows.filter(atLimit).length;

          return (
            <section key={tenant.id} className="bg-surface rounded-lg border p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h3 className="text-md font-semibold">{tenant.name}</h3>
                  <p className="text-fg-subtle text-xs">
                    {NAME[tier.id]} · {t('branches', { n: tenant.branches })}
                  </p>
                </div>

                {pressing > 0 ? (
                  <Chip tone="warning">{t('atLimit', { n: pressing })}</Chip>
                ) : (
                  <Chip tone="neutral">{t('withinLimits')}</Chip>
                )}
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {rows.map((row) => {
                  const unlimited = row.limit === null;
                  const percent = unlimited ? 0 : (row.used / row.limit!) * 100;

                  return (
                    <li key={row.key}>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-fg-muted">{t(`limit_${row.key}`)}</span>
                        <span
                          data-num
                          className={
                            atLimit(row) ? 'text-warning-700 font-semibold' : 'font-medium'
                          }
                        >
                          {row.used.toLocaleString('ru-RU')}
                          {unlimited ? '' : ` / ${row.limit!.toLocaleString('ru-RU')}`}
                        </span>
                      </div>

                      {unlimited ? (
                        <p className="text-fg-subtle text-2xs">{t('noCeiling')}</p>
                      ) : (
                        <Rail percent={percent} tone={atLimit(row) ? 'warning' : 'brand'} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

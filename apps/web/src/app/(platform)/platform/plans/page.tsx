import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { Chip, Head } from '../../platform-ui';
import { FEATURES } from '../platform-data';
import { platformPlans } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('plans') };
}

/**
 * Three tiers, their ceilings and what each one includes.
 *
 * Ceilings are stated as numbers and "unlimited" as a word, because a blank
 * cell reads as missing data. Every ceiling on this page is the same one the
 * subscription screen measures usage against — both read `PLAN_TIERS`, so a
 * tier raised here cannot leave a tenant marked over their limit.
 */
export default async function PlansPage() {
  const [t, nav, plans] = await Promise.all([
    getTranslations('console.platformPlans'),
    getTranslations('console.platformNav'),
    platformPlans(),
  ]);

  const NAME: Record<string, string> = {
    start: 'Start',
    growth: 'Growth',
    enterprise: 'Enterprise',
  };

  const limit = (value: number | null) => (value === null ? t('unlimited') : String(value));

  return (
    <>
      <Head title={nav('plans')} subtitle={t('subtitle')} />

      <div className="grid gap-3 lg:grid-cols-3">
        {plans.map((tier) => (
          <section key={tier.id} className="bg-surface rounded-lg border p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-lg font-semibold tracking-tight">{NAME[tier.id]}</h3>
              <Chip tone="neutral">{t('tenants', { n: tier.tenants })}</Chip>
            </div>

            <div data-num className="font-display mt-3 text-2xl font-bold tracking-tight">
              {formatTiyinAmount(tier.price)}
            </div>
            <div className="text-fg-subtle text-xs">{t('perMonth')}</div>

            <dl className="border-divider mt-5 grid grid-cols-2 gap-y-2 border-t pt-4 text-sm">
              <dt className="text-fg-subtle">{t('branches')}</dt>
              <dd data-num className="text-right font-medium">
                {limit(tier.branches)}
              </dd>
              <dt className="text-fg-subtle">{t('users')}</dt>
              <dd data-num className="text-right font-medium">
                {limit(tier.users)}
              </dd>
              <dt className="text-fg-subtle">{t('terminals')}</dt>
              <dd data-num className="text-right font-medium">
                {limit(tier.terminals)}
              </dd>
            </dl>

            <ul className="border-divider mt-4 flex flex-col gap-1.5 border-t pt-4 text-sm">
              {FEATURES.map((feature) => {
                const included = tier.features.includes(feature);

                return (
                  <li
                    key={feature}
                    className={`flex items-center gap-2.5 ${included ? '' : 'text-fg-disabled'}`}
                  >
                    <span className={included ? 'text-success-600' : 'text-fg-disabled'}>
                      {included ? '✓' : '—'}
                    </span>
                    {t(`feature_${feature}`)}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

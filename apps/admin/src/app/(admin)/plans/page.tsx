import { getTranslations } from 'next-intl/server';

import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { PLANS, PLAN_FEATURES } from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('plans') };
}

/**
 * The three plans, as the design draws them.
 *
 * Each card carries its price, what it includes, and — under the rule at the
 * foot — how many restaurants are actually on it. That last figure is the one
 * that says whether a plan is working: nineteen on Start and seven on
 * Enterprise is a different business from the reverse.
 *
 * TODO — once the platform API lands:
 *   - Editing a plan, and what happens to restaurants already on it
 *   - Custom pricing for a named account
 *   - Grandfathering, so a price change never surprises an existing tenant
 */
export default async function PlansPage() {
  const t = await getTranslations('platform.plans');

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] gap-5">
      {PLANS.map((plan) => (
        <section
          key={plan.id}
          className="bg-surface flex flex-col rounded-lg border-[1.5px] px-[26px] pt-[26px] pb-6"
        >
          <div className="flex items-center justify-between gap-2.5">
            <h3 className="font-display tracking-snug text-xl font-semibold">{plan.id}</h3>
          </div>

          <div className="mt-3.5 flex items-baseline gap-2">
            <span data-num className="font-display text-2xl font-semibold tracking-tight">
              {formatTiyinAmount(plan.priceTiyin)}
            </span>
            <span className="text-fg-subtle text-xs">
              {t('currency')} / {t('perMonth')}
            </span>
          </div>

          <div className="mt-[22px] mb-6 flex flex-col gap-2.5">
            {[
              `${formatNumber(plan.branches)} ${t('branches')}`,
              `${formatNumber(plan.users)} ${t('users')}`,
              ...PLAN_FEATURES[plan.id].map((key) => t(key)),
            ].map((feature) => (
              <span key={feature} className="text-fg-muted flex items-start gap-2.5 text-sm">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent-600)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-[3px] flex-none"
                  aria-hidden
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
                {feature}
              </span>
            ))}
          </div>

          <div className="border-divider mt-auto flex items-center justify-between gap-3 border-t pt-[18px]">
            <span data-num className="text-fg-subtle text-xs">
              {plan.count} {t('onPlan')}
            </span>
            <button
              type="button"
              className="hover:bg-bg-subtle h-9 rounded-md border px-3.5 text-sm font-semibold"
            >
              {t('select')}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

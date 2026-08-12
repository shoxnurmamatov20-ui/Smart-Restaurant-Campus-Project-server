import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { PageHead, Pill } from '../screen';
import { averageOrder, CUSTOMERS, ORDER_HISTORY, visitsPerMonth } from './customers-data';

export const generateMetadata = () => moduleMetadata('crm');

/**
 * Known guests.
 *
 * Built to the design's Customers screen: a 340px list on the left, the
 * selected guest filling the right. The first guest is shown open, which is
 * what the design draws and what a manager wants when the page loads.
 *
 * The note is the point of the screen. Spend and visit counts are what a report
 * gives you; "always asks for table 12, no coriander" is what makes a regular
 * feel recognised, and it belongs where the floor will actually see it.
 *
 * TODO — Phase 1 · crm, once the module is built:
 *   - Loyalty: tiers, points, what earns and what redeems
 *   - Campaigns and their results
 *   - Feedback, and what was done about it
 *   - Consent, because this is personal data under Uzbek law
 */
export default async function CustomersPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.customers'),
  ]);

  const selected = CUSTOMERS[0];

  return (
    <>
      <PageHead title={nav('crm')} subtitle={t('subtitle')} />

      <div
        data-split
        className="grid [grid-template-columns:340px_minmax(0,1fr)] items-start gap-5"
      >
        <div className="flex flex-col gap-2">
          {CUSTOMERS.map((customer) => {
            const active = customer.id === selected.id;

            return (
              <button
                key={customer.id}
                type="button"
                data-tile
                className={`flex items-center gap-3 rounded-md border px-4 py-3.5 text-left ${
                  active ? 'bg-brand-50 border-brand-200' : 'bg-surface'
                }`}
              >
                <span className="bg-bg-muted text-fg-muted rounded-pill grid size-9 flex-none place-items-center text-xs font-semibold">
                  {initialsOf(customer.name)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{customer.name}</span>
                  <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                    {t(customer.segment)} · {customer.visits} {t('visitsShort')}
                  </span>
                </span>

                <span data-num className="text-sm font-semibold">
                  {(customer.spend / 100_000_000).toFixed(1)}M
                </span>
              </button>
            );
          })}
        </div>

        <div className="bg-surface rounded-lg border px-7 py-[26px]">
          <div className="border-divider flex items-start gap-4 border-b pb-[22px]">
            <span className="bg-brand-100 text-brand-700 rounded-pill text-md grid size-[52px] flex-none place-items-center font-semibold">
              {initialsOf(selected.name)}
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="font-display tracking-snug text-xl font-semibold">{selected.name}</h3>
              <p data-num className="text-fg-muted mt-1.5 text-sm">
                {selected.phone} · {t('lastVisit')} {t(selected.lastVisit)}
              </p>
            </div>

            <div className="flex flex-none gap-2">
              <Pill tone="success">{t(selected.tier)}</Pill>
              <Pill tone="neutral">{t(selected.segment)}</Pill>
            </div>
          </div>

          {/* Four figures in a hairline grid — the same device the branch
              switcher and the stock summary use. */}
          <div className="bg-divider my-[22px] grid grid-cols-4 gap-px overflow-hidden rounded-md border">
            {[
              { label: t('totalSpend'), value: formatTiyinAmount(selected.spend) },
              { label: t('visits'), value: String(selected.visits) },
              { label: t('averageOrder'), value: formatTiyinAmount(averageOrder(selected)) },
              {
                label: t('frequency'),
                value: `${visitsPerMonth(selected)} ${t('perMonth')}`,
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface px-[18px] py-4">
                <div className="text-fg-subtle mb-[7px] text-xs">{stat.label}</div>
                <div data-num className="text-md font-semibold">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div className="text-fg-subtle text-2xs tracking-caps mb-2.5 font-semibold uppercase">
            {t('note')}
          </div>
          <p className="text-fg-muted mb-6 text-sm leading-relaxed text-pretty">
            {t(selected.note)}
          </p>

          <div className="text-fg-subtle text-2xs tracking-caps mb-1.5 font-semibold uppercase">
            {t('history')}
          </div>

          {ORDER_HISTORY.map((order) => (
            <div
              key={order.id}
              data-row
              className="border-divider -mx-2 flex items-center gap-3.5 rounded-sm border-b px-2 py-[11px]"
            >
              <span className="text-fg-subtle w-14 font-mono text-xs">{order.id}</span>
              <span className="min-w-0 flex-1 text-sm">{t(order.where)}</span>
              <span data-num className="text-sm font-semibold">
                {formatTiyinAmount(order.total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}

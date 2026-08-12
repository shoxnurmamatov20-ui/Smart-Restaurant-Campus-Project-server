'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import {
  BILLING_LABEL,
  PLANS,
  PLAN_BY_ID,
  STATE_LABEL,
  TENANTS,
  type Plan,
} from '../platform-data';

/**
 * Every restaurant on the platform, searchable.
 *
 * Filtering happens here rather than on the server because the whole estate is
 * a few dozen rows: a round trip per keystroke would be slower and no more
 * correct. When this list is thousands long the filter moves behind the API and
 * this component keeps its shape.
 *
 * "Muammoli" is its own chip, next to the plans. It is not a plan, but it is
 * the filter somebody actually reaches for — the accounts that owe money or are
 * suspended, in one press.
 */
type Filter = 'all' | Plan['id'] | 'issues';

/** Plan chips carry the plan's own name; the two ends are catalogue keys. */
const CHIPS: readonly { id: Filter; key?: string }[] = [
  { id: 'all', key: 'all' },
  ...PLANS.map((plan) => ({ id: plan.id as Filter })),
  { id: 'issues', key: 'issues' },
];

const COLUMNS =
  '[grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)_130px_110px_90px_140px_130px_130px] gap-4 px-5';

const CHIP_ON = 'border-brand-500 bg-brand-50 text-brand-700';
const CHIP_OFF = 'bg-surface text-fg-muted';

export function TenantList() {
  const t = useTranslations('platform.tenants');
  const col = useTranslations('platform.columns');
  const state = useTranslations('platform.state');
  const empty = useTranslations('platform.empty');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return TENANTS.filter((tenant) => {
      if (needle && !`${tenant.name} ${tenant.owner}`.toLowerCase().includes(needle)) return false;
      if (filter === 'all') return true;
      if (filter === 'issues') return tenant.billing !== 1 || tenant.state === 0;
      return tenant.plan === filter;
    });
  }, [query, filter]);

  return (
    <>
      <div className="mb-[18px] flex flex-wrap items-center gap-3">
        <div className="relative max-w-[420px] min-w-[260px] flex-1">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-[11px] -translate-y-1/2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="bg-surface focus:border-brand-300 focus:ring-focus h-[38px] w-full rounded-md border pr-3 pl-[34px] text-sm outline-none focus:ring-[3px]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              aria-pressed={filter === chip.id}
              className={`rounded-pill h-[34px] border px-3.5 text-sm font-medium ${
                filter === chip.id ? CHIP_ON : CHIP_OFF
              }`}
            >
              {chip.key ? t(chip.key) : chip.id}
            </button>
          ))}
        </div>

        <span data-num className="text-fg-subtle ml-auto text-xs">
          {formatNumber(rows.length)} / {formatNumber(TENANTS.length)}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface rounded-lg border px-8 py-16 text-center">
          <div className="text-fg-disabled mx-auto mb-4 grid size-11 place-items-center rounded-md border">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
          </div>
          <div className="text-sm font-semibold">{empty('title')}</div>
          <p className="text-fg-subtle mt-1.5 text-xs">{empty('hint')}</p>
        </div>
      ) : (
        <div className="bg-surface overflow-hidden rounded-lg border" data-table>
          <div
            className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} border-b py-[11px] text-xs font-semibold tracking-wide`}
          >
            <span>{col('restaurant')}</span>
            <span>{col('owner')}</span>
            <span>{col('plan')}</span>
            <span>{col('status')}</span>
            <span className="text-right">{col('branches')}</span>
            <span>{col('lastSeen')}</span>
            <span>{col('billing')}</span>
            <span className="text-right">{col('monthly')}</span>
          </div>

          {rows.map((tenant) => {
            const billing = BILLING_LABEL[tenant.billing];
            const tenantState = STATE_LABEL[tenant.state];

            return (
              <Link
                key={tenant.id}
                href={`/tenants/${tenant.id}`}
                data-row
                className={`border-divider grid ${COLUMNS} items-center border-b py-[13px] text-left`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{tenant.name}</span>
                  <span className="text-fg-subtle mt-0.5 block text-xs">{tenant.city}</span>
                </span>

                <span className="text-fg-muted truncate text-sm">{tenant.owner}</span>

                <span>
                  <span
                    className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold ${PLAN_BY_ID[tenant.plan].chip}`}
                  >
                    {tenant.plan}
                  </span>
                </span>

                <span>
                  <span
                    className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold whitespace-nowrap ${tenantState.tone}`}
                  >
                    {state(tenantState.key)}
                  </span>
                </span>

                <span data-num className="text-fg-muted text-right text-sm">
                  {tenant.branches}
                </span>

                <span className="text-fg-muted text-sm">{tenant.lastSeen}</span>

                <span>
                  <span
                    className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold whitespace-nowrap ${billing.tone}`}
                  >
                    {state(billing.key)}
                  </span>
                </span>

                <span data-num className="text-right text-sm font-semibold">
                  {formatTiyinAmount(tenant.mrrTiyin)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

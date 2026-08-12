import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import {
  BILLING_LABEL,
  FEATURE_FLAGS,
  PAYMENT_METHODS,
  PLAN_BY_ID,
  STAFF_NAMES,
  STATE_LABEL,
  TENANTS,
  TENANT_BY_ID,
  TENANT_STAFF,
  initials,
} from '../../platform-data';

const CARD = 'bg-surface rounded-lg border';
const H3 = 'text-md font-semibold tracking-snug';
const GHOST =
  'flex h-[38px] items-center rounded-md border px-3.5 text-sm font-medium hover:bg-bg-subtle';
const BRANCH_COLUMNS =
  '[grid-template-columns:minmax(0,1.4fr)_90px_90px_130px_120px] gap-3.5 px-[22px]';
const INVOICE_COLUMNS =
  '[grid-template-columns:150px_120px_minmax(0,1fr)_160px_130px] gap-4 px-[22px]';

export function generateStaticParams() {
  return TENANTS.map((tenant) => ({ id: tenant.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nav = await getTranslations('platform.nav');
  return { title: TENANT_BY_ID[id]?.name ?? nav('tenants') };
}

/**
 * One restaurant, everything the platform knows about it.
 *
 * Built to the design's tenant detail: identity and the four actions on top,
 * seven facts under them, then branches beside users, the invoice history, and
 * the feature flags next to the actions that cannot be undone.
 *
 * The dangerous actions sit at the bottom right, apart from the rest and drawn
 * in red — suspending an account stops a restaurant taking orders, and deleting
 * one starts a ninety-day clock. Neither belongs next to "Send invoice".
 *
 * TODO — once the platform API lands:
 *   - Impersonation, which needs its own audit entry and a way out
 *   - Suspend / resume, and the notice the restaurant gets
 *   - Feature flags that persist, and the plan rules that constrain them
 *   - Export, as a job rather than a request that times out
 */
export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = TENANT_BY_ID[id];

  if (!tenant) notFound();

  const t = await getTranslations('platform.tenants');
  const col = await getTranslations('platform.columns');
  const state = await getTranslations('platform.state');
  const method = await getTranslations('platform.method');
  const feature = await getTranslations('platform.features');
  const role = await getTranslations('platform.roles');

  const plan = PLAN_BY_ID[tenant.plan];
  const billing = BILLING_LABEL[tenant.billing];
  const tenantState = STATE_LABEL[tenant.state];
  const branchRevenue = tenant.zones.reduce((sum, zone) => sum + zone.revenueTiyin, 0);

  const facts = [
    { label: t('subscription'), value: formatTiyinAmount(tenant.mrrTiyin) },
    { label: t('branchRevenue'), value: formatTiyinAmount(branchRevenue) },
    { label: col('branches'), value: formatNumber(tenant.branches) },
    { label: col('users'), value: formatNumber(tenant.users) },
    { label: t('since'), value: tenant.since },
    { label: t('nextBill'), value: tenant.next },
    { label: col('lastSeen'), value: tenant.lastSeen },
  ];

  /* Enough rows to stand for the account without inventing a whole directory. */
  const staff = TENANT_STAFF.slice(0, Math.max(4, Math.min(6, Math.round(tenant.users / 9))));

  const invoices = [0, 1, 2, 3, 4, 5].map((back) => ({
    id: `INV-2026-${812 - back * 7 + TENANTS.indexOf(tenant)}`,
    date: ['01.08.2026', '01.07.2026', '01.06.2026', '01.05.2026', '01.04.2026', '01.03.2026'][
      back
    ]!,
    method: PAYMENT_METHODS[back % PAYMENT_METHODS.length]!,
    /* Only the current invoice can be unpaid; the history is settled. */
    billing: back === 0 ? billing : BILLING_LABEL[1],
  }));

  return (
    <>
      <Link
        href="/tenants"
        className="text-fg-muted hover:text-fg mb-[18px] flex items-center gap-2 text-sm font-medium"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 6 9 12l6 6" />
        </svg>
        {t('back')}
      </Link>

      <div className={`${CARD} mb-5 px-[26px] py-6`}>
        <div className="flex flex-wrap items-start gap-[18px]">
          <span className="font-display grid size-[52px] flex-none place-items-center rounded-md bg-[var(--n-900)] text-lg font-bold tracking-[-0.03em] text-white">
            {initials(tenant.name)}
          </span>

          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{tenant.name}</h2>
              <span className={`rounded-pill text-2xs px-[9px] py-1 font-semibold ${plan.chip}`}>
                {tenant.plan}
              </span>
              <span
                className={`rounded-pill text-2xs px-[9px] py-1 font-semibold ${tenantState.tone}`}
              >
                {state(tenantState.key)}
              </span>
            </div>

            <p className="text-fg-muted mt-2 text-sm">
              {tenant.city} · {tenant.owner} · <span data-num>{tenant.phone}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="bg-brand-500 hover:bg-brand-600 flex h-[38px] items-center rounded-md px-4 text-sm font-semibold text-white"
            >
              {t('impersonate')}
            </button>
            <Link href="/plans" className={GHOST}>
              {t('changePlan')}
            </Link>
            {tenant.billing !== 1 ? (
              <button type="button" className={GHOST}>
                {t('markPaid')}
              </button>
            ) : null}
            <button
              type="button"
              className="text-danger-700 hover:bg-danger-50 flex h-[38px] items-center rounded-md border px-3.5 text-sm font-medium"
            >
              {tenant.state === 0 ? t('resume') : t('suspend')}
            </button>
          </div>
        </div>

        <div className="mt-[22px] grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {facts.map((fact) => (
            <div key={fact.label} className="bg-surface rounded-md border px-4 py-3.5">
              <div className="text-fg-subtle text-2xs mb-1.5">{fact.label}</div>
              <div data-num className="text-md font-semibold">
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-5"
      >
        <section className={`${CARD} overflow-hidden`} data-table="s">
          <div className="border-divider border-b px-[22px] pt-[18px] pb-3.5">
            <h3 className={H3}>{t('branchesTitle')}</h3>
          </div>

          <div
            className={`bg-bg-subtle text-fg-subtle grid ${BRANCH_COLUMNS} border-b py-2.5 text-xs font-semibold`}
          >
            <span>{col('branch')}</span>
            <span className="text-right">{col('seats')}</span>
            <span className="text-right">{col('staff')}</span>
            <span className="text-right">{col('revenue')}</span>
            <span>{col('status')}</span>
          </div>

          {tenant.zones.map((zone) => {
            const zoneState = zone.settingUp
              ? { key: 'settingUp', tone: 'bg-warning-50 text-warning-700' }
              : tenant.state === 0
                ? STATE_LABEL[0]
                : STATE_LABEL[1];

            return (
              <div
                key={zone.name}
                data-row
                className={`border-divider grid ${BRANCH_COLUMNS} items-center border-b py-3`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{zone.name}</span>
                  <span className="text-fg-subtle mt-0.5 block text-xs">{zone.city}</span>
                </span>
                <span data-num className="text-fg-muted text-right text-sm">
                  {zone.seats}
                </span>
                <span data-num className="text-fg-muted text-right text-sm">
                  {zone.staff}
                </span>
                <span data-num className="text-right text-sm font-semibold">
                  {formatTiyinAmount(zone.revenueTiyin)}
                </span>
                <span>
                  <span
                    className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold whitespace-nowrap ${zoneState.tone}`}
                  >
                    {state(zoneState.key)}
                  </span>
                </span>
              </div>
            );
          })}

          <div className={`bg-bg-subtle grid ${BRANCH_COLUMNS} py-3.5`}>
            <span className="text-sm font-semibold">{col('total')}</span>
            <span />
            <span />
            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(branchRevenue)}
            </span>
            <span className="text-fg-subtle text-xs">{t('perMonth')}</span>
          </div>
        </section>

        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={`${H3} mb-1.5`}>{t('usersTitle')}</h3>
          <p className="text-fg-subtle mb-3.5 text-xs">
            <span data-num>{formatNumber(tenant.users)}</span> · {col('lastLogin').toLowerCase()}
          </p>

          {staff.map((person, index) => {
            const name = index === 0 ? tenant.owner : STAFF_NAMES[index - 1]!;

            return (
              <div
                key={person.role}
                data-row
                className="border-divider -mx-2 flex items-center gap-3 rounded-sm border-b px-2 py-[9px]"
              >
                <span className="bg-bg-muted text-fg-muted text-2xs grid size-[30px] flex-none place-items-center rounded-full font-semibold">
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="text-fg-subtle mt-px block text-xs">{role(person.role)}</span>
                </span>
                <span className="text-fg-subtle text-xs whitespace-nowrap">{person.seen}</span>
              </div>
            );
          })}
        </section>
      </div>

      <section className={`${CARD} overflow-hidden`} data-table="s">
        <div className="border-divider border-b px-[22px] pt-[18px] pb-3.5">
          <h3 className={H3}>{t('invoicesTitle')}</h3>
        </div>

        <div
          className={`bg-bg-subtle text-fg-subtle grid ${INVOICE_COLUMNS} border-b py-2.5 text-xs font-semibold`}
        >
          <span>{col('invoice')}</span>
          <span>{col('date')}</span>
          <span className="text-right">{col('amount')}</span>
          <span>{col('method')}</span>
          <span>{col('status')}</span>
        </div>

        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            data-row
            className={`border-divider grid ${INVOICE_COLUMNS} items-center border-b py-3`}
          >
            <span className="text-fg-muted font-mono text-xs">{invoice.id}</span>
            <span data-num className="text-fg-muted text-sm">
              {invoice.date}
            </span>
            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(tenant.mrrTiyin)}
            </span>
            <span className="text-fg-muted text-sm">{method(invoice.method)}</span>
            <span>
              <span
                className={`rounded-pill text-2xs inline-flex px-[9px] py-1 font-semibold whitespace-nowrap ${invoice.billing.tone}`}
              >
                {state(invoice.billing.key)}
              </span>
            </span>
          </div>
        ))}
      </section>

      <div
        data-split
        className="mt-5 grid [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] gap-5"
      >
        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={`${H3} mb-4`}>{t('features')}</h3>

          {FEATURE_FLAGS.map((flag) => {
            const on = flag.plans.includes(tenant.plan);

            return (
              <div
                key={flag.key}
                className="border-divider flex items-center gap-4 border-b py-3 last:border-b-0"
              >
                <span className="flex-1 text-sm">{feature(flag.key)}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={feature(flag.key)}
                  className={`rounded-pill flex h-[26px] w-11 flex-none items-center p-[3px] transition-colors ${
                    on ? 'bg-brand-500' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`rounded-pill block size-5 bg-white shadow-sm transition-transform ${
                      on ? 'translate-x-[18px]' : ''
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </section>

        <section className={`${CARD} px-6 py-[22px]`}>
          <h3 className={`${H3} mb-1.5`}>{t('actions')}</h3>
          <p className="text-fg-subtle mb-[18px] text-xs leading-normal">{t('actionsSub')}</p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="hover:bg-bg-subtle h-[42px] rounded-md border text-sm font-medium"
            >
              {t('sendInvoice')}
            </button>
            <button
              type="button"
              className="hover:bg-bg-subtle h-[42px] rounded-md border text-sm font-medium"
            >
              {t('export')}
            </button>
            <button
              type="button"
              className="text-danger-700 hover:bg-danger-50 h-[42px] rounded-md border text-sm font-medium"
            >
              {t('delete')}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

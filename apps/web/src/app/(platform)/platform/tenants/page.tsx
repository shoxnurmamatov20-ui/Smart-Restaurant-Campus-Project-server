import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { Chip, Table, Td, Tr, type ChipTone } from '../../platform-ui';
import {
  seenLabel,
  defaultFeatures,
  FEATURES,
  TENANT_DETAIL,
  USER_POOL,
  type FeatureKey,
  type PayState,
  type PlanId,
} from '../platform-data';
import { platformInvoices, platformOverview, platformPlans } from '../platform-server';
import { TenantList, type TenantInvoice } from './tenant-list';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('tenants') };
}

/**
 * Restaurants — forty-two of them, the card that opens one, and the form that
 * adds one.
 *
 * The search and the two filters are the list. An operator arrives here because
 * somebody phoned: they know a name, or they know something is wrong, and both
 * of those are one control away.
 *
 * The head and the KPI strip are handed to the client component rather than
 * rendered here, because the design's tenant card replaces the whole screen
 * rather than floating over it — leaving a platform-wide MRR figure above one
 * customer's invoices would be three numbers about the wrong subject.
 */
export default async function TenantsPage() {
  const [t, card, nav, city, roles, locale] = await Promise.all([
    getTranslations('console.platformTenants'),
    getTranslations('console.platformTenants.card'),
    getTranslations('console.platformNav'),
    getTranslations('console.city'),
    getTranslations('console.roles'),
    getLocale(),
  ]);

  /*
   * Three reads rather than one, and each is a different question.
   *
   * The overview is the list and the KPIs. The billing list is what the card's
   * "record payment" button aims at — a real invoice key, which the design's
   * own six-month generator cannot supply because it invents the numbers. The
   * plans carry the four feature flags, which belong to the plan and not to the
   * restaurant; the card used to derive them from the plan *id* alone, and that
   * derivation stays as the fallback for a console with no session.
   *
   * All three fall back to fixtures independently — one API hiccup does not
   * empty a screen that could still answer most of the operator's question.
   */
  const [data, invoices, plans] = await Promise.all([
    platformOverview(),
    platformInvoices(),
    platformPlans(),
  ]);

  /* The invoices this restaurant owes or has paid, newest first — the API
     already orders by period, and the card's table reads top-down. */
  const invoicesByTenant = new Map<string, TenantInvoice[]>();

  for (const invoice of invoices) {
    const held = invoicesByTenant.get(invoice.tenantId) ?? [];

    held.push({
      key: invoice.key,
      id: invoice.id,
      date: invoice.issued,
      amount: invoice.amount,
      state: invoice.state,
    });

    invoicesByTenant.set(invoice.tenantId, held);
  }

  const featuresByPlan = new Map(plans.map((plan) => [plan.id, plan.features] as const));

  /* The eight relative-time phrases the card's user table cycles through. A
     list rather than a sentence, so `.raw()` rather than `card()`. */
  const seenPhrases = card.raw('seen') as readonly string[];
  const lang = (['uz', 'ru', 'en'].includes(locale) ? locale : 'uz') as 'uz' | 'ru' | 'en';

  const PLAN_LABEL: Record<PlanId, string> = {
    start: 'Start',
    growth: 'Growth',
    enterprise: 'Enterprise',
  };

  const PAY_TONE: Record<PayState, ChipTone> = {
    paid: 'success',
    late: 'warning',
    failing: 'danger',
  };

  /* The pool's role ids are `lib/roles.ts`'s, so the names follow the language
     switch. Resolved here because `console.roles` is a server catalogue. */
  const pool = USER_POOL.map((user) => ({
    name: user.name,
    role: roles(`${user.role}.name` as never) as string,
  }));

  const rows = data.list.map((tenant, index) => {
    const detail = TENANT_DETAIL[tenant.id];
    const state = detail?.state ?? 'live';

    return {
      id: tenant.id,
      /* The slug is what a person quotes; the key is what a write binds to.
         `null` here is a fixture row, and every button on the card checks it. */
      tenantId: tenant.tenantId,
      name: tenant.name,
      city: city(tenant.city),
      plan: PLAN_LABEL[tenant.plan],
      planId: tenant.plan,
      branches: tenant.branches,
      users: tenant.users,
      mrr: formatTiyinAmount(tenant.mrr, lang),
      mrrRaw: tenant.mrr,
      pay: t(`pay_${tenant.pay}`),
      payState: tenant.pay,
      payTone: PAY_TONE[tenant.pay],
      /*
       * The live owner first, the fixture only when there is none.
       *
       * `TENANT_DETAIL` is keyed by the demo slugs, so for every restaurant
       * actually onboarded here it answered `undefined` and the card printed an
       * em dash for the person the operator had just been talking to.
       */
      owner: tenant.owner?.name || detail?.owner || '—',
      /** The address they sign in with — no fixture, because inventing one
          would be inventing a login. `null` draws as "no owner account". */
      ownerEmail: tenant.owner?.email ?? null,
      phone: tenant.owner?.phone ?? detail?.phone ?? '—',
      since: detail?.since ?? '—',
      nextInvoice: detail?.nextInvoice ?? '—',
      seen: seenLabel(tenant.seenMinutes, seenPhrases),
      state,
      stateLabel: t(`state_${state}`),
      /** A tenant is a problem when the money failed or the account is stopped. */
      problem: tenant.pay !== 'paid' || state === 'suspended',
      branchRows: detail?.branches ?? [],
      pool,
      ownerRole: roles('owner.name'),
      invoiceOffset: index,
      /* Empty means "the API sent none", and the card falls back to the
         design's six generated months — which is also what a demo console
         shows. A restaurant that genuinely has no invoice yet is a restaurant
         signed up this month, and the card's own "issue invoice" button is the
         answer to that. */
      invoices: invoicesByTenant.get(tenant.id) ?? [],
      /* The plan decides the flags. `defaultFeatures` is the fallback for a
         plan the API did not send, and it is the derivation the card shipped
         with: delivery from Growth, loyalty only on Enterprise, multi-branch
         only above one venue. */
      features:
        featuresByPlan.get(tenant.plan) ?? keysOf(defaultFeatures(tenant.plan, tenant.branches)),
    };
  });

  return (
    <>
      <TenantList
        rows={rows}
        lang={lang}
        head={{ title: nav('tenants'), subtitle: t('subtitle', { n: data.tenants }) }}
        stats={[
          { label: t('kpiTotal'), value: String(data.tenants) },
          {
            label: t('kpiProblem'),
            value: String(rows.filter((row) => row.problem).length),
            note: t('kpiProblemNote'),
            tone: 'danger',
          },
          { label: t('kpiMrr'), value: formatTiyinAmount(data.mrr, lang), note: t('kpiMrrNote') },
        ]}
        labels={{
          search: t('search'),
          all: t('all'),
          problems: t('problems'),
          showing: t.raw('showing') as string,
          empty: t('empty'),
          colName: t('colName'),
          colPlan: t('colPlan'),
          colBranches: t('colBranches'),
          colUsers: t('colUsers'),
          colMrr: t('colMrr'),
          colPay: t('colPay'),
        }}
      />

      {/*
       * A server-rendered copy of the same rows, for a reader with no
       * JavaScript and for a crawler that will never get one. It is the same
       * data, so the two cannot disagree.
       */}
      <noscript>
        <div className="mt-5">
          <Table
            head={[
              { label: t('colName') },
              { label: t('colPlan') },
              { label: t('colMrr'), align: 'right' },
              { label: t('colPay'), align: 'right' },
            ]}
          >
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-medium">{row.name}</Td>
                <Td className="text-fg-muted">{row.plan}</Td>
                <Td align="right" numeric>
                  {row.mrr}
                </Td>
                <Td align="right">
                  <Chip tone={row.payTone}>{row.pay}</Chip>
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      </noscript>
    </>
  );
}

/**
 * "Last seen", from the minutes the fixture carries.
 *
 * The design's card shows a phrase per row rather than a timestamp, and the
 * phrases are the ones a person would use on a call — "online now", "a week
 * ago". Bucketed rather than computed to the minute: nobody rings a customer
 * because they were last here 47 minutes ago instead of 43.
 */
/**
 * The flags that are on, in the shape the plan endpoint sends.
 *
 * `defaultFeatures()` answers with a record because the card draws a row per
 * flag whether it is on or off; the plan answers with a list of the ones it
 * includes. The card reads the list, so the fallback is converted rather than
 * the live answer being expanded — one shape at the seam, and it is the
 * server's.
 */
function keysOf(flags: Record<FeatureKey, boolean>): readonly FeatureKey[] {
  return FEATURES.filter((key) => flags[key]);
}

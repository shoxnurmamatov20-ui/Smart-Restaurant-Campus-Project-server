import { describe, expect, it } from 'vitest';

import { messages } from '@/i18n';

import { EXTRA_NAV, PAGE_TITLE_KEYS, PLATFORM_NAV, SETTINGS_ITEM } from './nav';
import {
  BILLING_SUMMARY,
  DEVICES,
  INVOICES,
  PLANS,
  PLATFORM,
  PLAN_BY_ID,
  TENANTS,
  TENANT_BY_ID,
  initials,
} from './platform-data';

/**
 * The figures on this console have to agree with each other.
 *
 * Every number here is shown twice — once as a headline and once inside a
 * table, a bar or a donut — and a console whose own arithmetic disagrees is
 * worse than one with no figures at all. These tests are what stops a later
 * edit to one constant quietly contradicting another.
 */
describe('platform figures', () => {
  it('accounts for every restaurant across the three plans', () => {
    const onPlans = PLANS.reduce((sum, plan) => sum + plan.count, 0);
    expect(onPlans).toBe(PLATFORM.restaurants);
  });

  it('never has more active branches than branches', () => {
    expect(PLATFORM.branches).toBeLessThanOrEqual(PLATFORM.branchTotal);
  });

  it('counts payment issues from the tenants themselves', () => {
    const issues = TENANTS.filter((tenant) => tenant.billing !== 1).length;
    expect(issues).toBe(PLATFORM.paymentIssues);
  });

  it('bills every tenant at its plan price', () => {
    for (const tenant of TENANTS) {
      expect(tenant.mrrTiyin).toBe(PLAN_BY_ID[tenant.plan]!.priceTiyin);
    }
  });

  it('keeps money in whole tiyin', () => {
    const amounts = [
      PLATFORM.mrrTiyin,
      PLATFORM.mrrTargetTiyin,
      PLATFORM.unpaidTiyin,
      ...Object.values(BILLING_SUMMARY).filter((value) => typeof value === 'number'),
      ...PLANS.map((plan) => plan.priceTiyin),
      ...TENANTS.flatMap((tenant) => [
        tenant.mrrTiyin,
        ...tenant.zones.map((zone) => zone.revenueTiyin),
      ]),
    ];

    for (const amount of amounts) expect(Number.isInteger(amount)).toBe(true);
  });

  it('gives each tenant as many branch rows as its branch count', () => {
    for (const tenant of TENANTS) {
      expect(tenant.zones).toHaveLength(tenant.branches);
    }
  });

  it('raises one invoice per tenant, each with a distinct id', () => {
    expect(INVOICES).toHaveLength(TENANTS.length);
    expect(new Set(INVOICES.map((invoice) => invoice.id)).size).toBe(INVOICES.length);
  });

  it('has a unique id for every tenant and device', () => {
    expect(new Set(TENANTS.map((tenant) => tenant.id)).size).toBe(TENANTS.length);
    expect(new Set(DEVICES.map((device) => device.id)).size).toBe(DEVICES.length);
    expect(Object.keys(TENANT_BY_ID)).toHaveLength(TENANTS.length);
  });
});

const ALL_NAV = [...PLATFORM_NAV, SETTINGS_ITEM, ...EXTRA_NAV];

describe('navigation', () => {
  it('names a real string in every catalogue, in every language', () => {
    for (const item of ALL_NAV) {
      for (const [locale, catalogue] of Object.entries(messages)) {
        const label = (catalogue.platform.nav as Record<string, string>)[item.key];
        expect(label, `${locale}.platform.nav.${item.key}`).toBeTruthy();
      }
    }
  });

  it('draws every icon rather than typing one', () => {
    const emoji = /\p{Extended_Pictographic}/u;

    for (const catalogue of Object.values(messages)) {
      for (const label of Object.values(catalogue.platform.nav)) {
        expect(label).not.toMatch(emoji);
      }
    }
  });

  it('points every destination at a distinct route', () => {
    const hrefs = ALL_NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('titles every route it links to', () => {
    for (const item of ALL_NAV) {
      expect(PAGE_TITLE_KEYS[item.href]).toBe(item.key);
    }
  });

  it('translates the console, not just labels it', () => {
    /* uz is the authoring language; the other two must actually differ. */
    const uzNav = Object.entries(messages.uz.platform.nav);
    const identical = uzNav.filter(
      ([key, label]) => (messages.ru.platform.nav as Record<string, string>)[key] === label,
    );

    /* No rail label is the same word in both languages. */
    expect(identical.map(([key]) => key)).toEqual([]);
  });

  it('badges the counts the rail actually claims', () => {
    const badge = (href: string) => PLATFORM_NAV.find((item) => item.href === href)?.badge?.text;

    expect(badge('/tenants')).toBe(String(PLATFORM.restaurants));
    expect(badge('/billing')).toBe(String(PLATFORM.paymentIssues));
    expect(badge('/devices')).toBe(String(DEVICES.filter((d) => d.state === 0).length));
    expect(badge('/trials')).toBe(String(TENANTS.filter((t) => t.state === 2).length));
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Rustam Kamolov')).toBe('RK');
    expect(initials('Otabek Normatov')).toBe('ON');
  });

  it('survives a single name', () => {
    expect(initials('Otabek')).toBe('O');
  });
});

import { apiGet } from '@/lib/api-server';

import {
  DEVICES,
  getPlatformOverview,
  INVOICES,
  LOG,
  PLAN_TIERS,
  PLATFORM_SETTINGS,
  SIGN_INS,
  TEAM,
  type Device,
  type Invoice,
  type LogEntry,
  type Operator,
  type PlanId,
  type PlanTier,
  type PlatformOverview,
  type PlatformSetting,
  type SignIn,
  type Tenant,
} from './platform-data';

/**
 * The platform console, from the API.
 *
 * Server half of ./platform-data.ts, split per the house rule: types and
 * fixtures in `*-data.ts`, anything that calls the server in a sibling only
 * server components import.
 *
 * Every function here follows the console's own contract — `apiGet` answers
 * `null` for no session, an expired token, a refusal or a restart, and the
 * screen falls back to the fixtures it was built against rather than 500ing.
 * That matters more here than anywhere else in the product: this is the console
 * somebody opens *because* something is broken.
 *
 * Authorisation is not decided here and cannot be. Every one of these endpoints
 * is `super-admin` only, and a restaurant owner's token gets a 403 that arrives
 * as `null` — which is exactly right, because `middleware.ts` has already
 * refused them the route.
 *
 * Paths start at `/platform/…`, not at `/v1/platform/…`. `apiBase()` already
 * ends in `/api/v1`, so the version belongs to the base and repeating it here
 * asked for `/api/v1/v1/platform/overview`. That is a 404, `apiGet` turns any
 * 404 into `null`, and `null` is the fixtures — so every screen on this surface
 * drew the demo forty-two restaurants while looking perfectly healthy. It is
 * the exact failure `renderWasDegraded()` exists to make visible, and the only
 * reason it stayed hidden is that a fallback is silent by design.
 */

/** Minutes are integers on the wire; the phrasing happens in one locale. */
type ApiTenantRow = {
  id: string;
  /** The primary key. `id` is the slug; writes bind to this. */
  tenant_id: number;
  name: string;
  city: string | null;
  plan: string | null;
  branches: number;
  users: number;
  mrr_tiyin: number;
  pay: 'paid' | 'late' | 'failing';
  seen_minutes: number | null;
  state: string;
  /** Who the platform issued the login to. Absent on an older API. */
  owner?: { name?: unknown; email?: unknown; phone?: unknown } | null;
  /** When the trial runs out, or null on a restaurant that is past one. */
  trial_ends_at?: string | null;
  /** `YYYY-MM-DD`, the day the restaurant was put on the platform. */
  since?: string | null;
  /** Tills paired. The trials screen reads it as "has anybody set this up". */
  terminals?: number;
};

type ApiOverview = {
  data: {
    tenants: number;
    branches_active: number;
    branches_total: number;
    mrr_tiyin: number;
    failing: number;
    list: ApiTenantRow[];
    plans: { id: string; price_tiyin: number; tenants: number }[];
  };
};

/**
 * The design's six city keys, against whatever a branch's `city` column holds.
 *
 * The column is free text — a manager types "Toshkent" or "Tashkent" — and the
 * console's copy is keyed. Anything unrecognised falls back to the capital
 * rather than to an empty cell: a wrong city is a small inaccuracy on a list,
 * a blank one reads as missing data about a paying customer.
 */
const CITY_KEYS: Readonly<Record<string, Tenant['city']>> = {
  toshkent: 'tashkent',
  tashkent: 'tashkent',
  samarqand: 'samarkand',
  samarkand: 'samarkand',
  buxoro: 'bukhara',
  bukhara: 'bukhara',
  fargona: 'fergana',
  fergana: 'fergana',
  namangan: 'namangan',
  termiz: 'termiz',
};

function cityKey(city: string | null): Tenant['city'] {
  if (!city) return 'tashkent';

  return CITY_KEYS[city.trim().toLowerCase()] ?? 'tashkent';
}

/**
 * The owner as the API sent them, or `null`.
 *
 * Narrowed rather than cast: this rides into the card, where the email is
 * printed as a credential and offered to the clipboard, and a `[object Object]`
 * copied off that row is a support call about a login that does not exist. A
 * restaurant with no owner account is a real state — one archived, or one whose
 * only owner was deactivated — and it draws as an absence rather than as a
 * blank string pretending to be an address.
 */
function ownerOf(row: ApiTenantRow): Tenant['owner'] {
  const owner = row.owner;

  if (!owner || typeof owner !== 'object') return null;

  const email = typeof owner.email === 'string' ? owner.email : '';

  if (email === '') return null;

  return {
    name: typeof owner.name === 'string' ? owner.name : '',
    email,
    phone: typeof owner.phone === 'string' && owner.phone !== '' ? owner.phone : null,
  };
}

/** The API's plan key against the three the console draws. */
function planId(plan: string | null): PlanId {
  return plan === 'start' || plan === 'growth' || plan === 'enterprise' ? plan : 'start';
}

/**
 * The overview, and the five screens that read their tenant list off it.
 *
 * One request rather than one per screen: the KPIs and the list are the same
 * query on the server, and splitting them here would mean two round trips that
 * can disagree with each other by a second.
 */
export async function platformOverview(): Promise<PlatformOverview> {
  const [live, demo] = await Promise.all([
    apiGet<ApiOverview>('/platform/overview'),
    getPlatformOverview(),
  ]);

  if (!live?.data) return demo;

  const data = live.data;

  return {
    live: true,
    tenants: data.tenants,
    branchesActive: data.branches_active,
    branchesTotal: data.branches_total,
    mrr: data.mrr_tiyin,
    failing: data.failing,
    /*
     * Twelve months of revenue, which the API does not publish yet.
     *
     * Empty on a live answer, and the panel is not drawn. It used to be the
     * fixture's curve — so a platform that had been running a week showed a
     * year of growth, and the chip above it read "+81.4%" every day of that
     * week. A placeholder is only visibly a placeholder next to other
     * placeholders; beside four live KPIs it reads as a measurement.
     */
    growth: [],
    list: data.list.map((row): Tenant => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      city: cityKey(row.city),
      plan: planId(row.plan),
      branches: row.branches,
      users: row.users,
      mrr: row.mrr_tiyin,
      pay: row.pay,
      // Never seen is drawn as a long silence rather than as "just now",
      // which is what a 0 would say.
      seenMinutes: row.seen_minutes ?? 100_000,
      owner: ownerOf(row),
      trialEndsAt: typeof row.trial_ends_at === 'string' ? row.trial_ends_at : null,
      since: typeof row.since === 'string' ? row.since : null,
      terminals: typeof row.terminals === 'number' ? row.terminals : 0,
    })),
    plans: data.plans.map((plan) => ({
      id: planId(plan.id),
      price: plan.price_tiyin,
      tenants: plan.tenants,
    })),
    /*
     * The four service readings, which nothing measures yet.
     *
     * Empty rather than the fixture's four rows. They were rendered as green
     * "Healthy" chips whatever the platform was doing — on the one screen whose
     * whole job is to notice that something is not. `/health/ready` answers for
     * this box only and says nothing about Redis, the queue or the broadcaster,
     * so there is no honest reading to substitute; the panel says so instead.
     */
    health: [],
  };
}

type ApiInvoice = {
  id: string;
  /** The primary key. `id` is the printed number; `mark-paid` binds to this. */
  invoice_id: number;
  tenant: string | null;
  amount_tiyin: number;
  issued_on: string;
  status: 'due' | 'paid' | 'overdue';
  attempts: number;
};

/** `dd.mm.yyyy` — the console prints dates, it never computes with them. */
function readable(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');

  return `${day}.${month}.${year}`;
}

export async function platformInvoices(): Promise<readonly Invoice[]> {
  const live = await apiGet<{ data: ApiInvoice[] }>('/platform/billing');

  if (!live?.data) return INVOICES;

  return live.data.map((row): Invoice => ({
    id: row.id,
    key: row.invoice_id,
    tenantId: row.tenant ?? '',
    amount: row.amount_tiyin,
    issued: readable(row.issued_on),
    // The API's three words against the console's three. Deliberately not
    // merged with a tenant's `pay` state: `dunning` is an invoice being
    // chased, `late` is a customer being late, and one screen shows each.
    state: row.status === 'paid' ? 'paid' : row.status === 'overdue' ? 'failed' : 'dunning',
    attempts: row.attempts,
  }));
}

type ApiDevice = {
  id: number;
  code: string;
  tenant: string | null;
  branch: string | null;
  mode: string;
  version: string | null;
  online: boolean;
  seen_minutes: number | null;
};

export async function platformDevices(): Promise<{
  devices: readonly Device[];
  currentVersion: string;
}> {
  const live = await apiGet<{
    data: ApiDevice[];
    meta: { current_version: string | null };
  }>('/platform/terminals');

  if (!live?.data) return { devices: DEVICES, currentVersion: '4.2.1' };

  const current = live.meta?.current_version ?? '';

  return {
    devices: live.data.map((row): Device => ({
      id: row.code,
      tenant: row.tenant ?? '—',
      branch: row.branch ?? '—',
      // The platform sells two kinds of screen. A till's mode names the
      // service style, not the hardware, so anything that is not a kitchen
      // display is a POS.
      kind: row.mode === 'kds' ? 'KDS' : 'POS',
      version: row.version ?? '—',
      state: !row.online
        ? 'offline'
        : current !== '' && row.version !== current
          ? 'needsUpdate'
          : 'online',
      syncedMinutesAgo: row.seen_minutes ?? 100_000,
    })),
    currentVersion: current === '' ? '—' : current,
  };
}

type ApiPlan = {
  id: string;
  price_tiyin: number;
  branches: number | null;
  users: number | null;
  terminals: number | null;
  features: string[];
  tenants: number;
};

export async function platformPlans(): Promise<readonly PlanTier[]> {
  const live = await apiGet<{ data: ApiPlan[] }>('/platform/plans');

  if (!live?.data) return PLAN_TIERS;

  return live.data.map((plan): PlanTier => ({
    id: planId(plan.id),
    price: plan.price_tiyin,
    tenants: plan.tenants,
    // `null` survives the seam. Zero would read as "no branches allowed",
    // which is the opposite of what enterprise means.
    branches: plan.branches,
    users: plan.users,
    terminals: plan.terminals,
    features: plan.features as PlanTier['features'],
  }));
}

export async function platformSettings(): Promise<readonly PlatformSetting[]> {
  const live = await apiGet<{ data: PlatformSetting[] }>('/platform/settings');

  return live?.data ?? PLATFORM_SETTINGS;
}

type ApiOperator = {
  id: string;
  name: string;
  email: string;
  last_seen_minutes: number | null;
};

export async function platformTeam(): Promise<readonly Operator[]> {
  const live = await apiGet<{ data: ApiOperator[] }>('/platform/team');

  if (!live?.data) return TEAM;

  return live.data.map((row): Operator => ({
    id: row.id,
    name: row.name,
    email: row.email,
    // Every operator is a super-admin today; the platform has no narrower
    // scopes yet, and drawing one would be a claim about a permission that
    // does not exist.
    scope: 'super',
    lastSeenMinutes: row.last_seen_minutes,
  }));
}

type ApiSignIn = {
  id: string;
  who: string | null;
  action: string;
  tenant: string | null;
  reference?: string | null;
  at: string | null;
  impersonation: boolean;
};

/** The five actions the console has copy for; anything else reads as a sign-in. */
const ACTIONS: Readonly<Record<string, SignIn['action']>> = {
  signedInAs: 'signedInAs',
  'platform.tenant.updated': 'suspended',
  'platform.invoice.paid': 'markedPaid',
  'platform.plan.updated': 'changedPlan',
};

export async function platformSignIns(): Promise<readonly SignIn[]> {
  const live = await apiGet<{ data: ApiSignIn[] }>('/platform/sign-ins');

  if (!live?.data) return SIGN_INS;

  return live.data.map((row): SignIn => ({
    id: row.id,
    who: row.who ?? '—',
    action: ACTIONS[row.action] ?? 'signedIn',
    tenant: row.tenant ?? undefined,
    reference: row.reference ?? undefined,
    // `HH:MM`, the reader's own clock. The API sends ISO 8601 because that is
    // the only unambiguous thing to send.
    at: row.at === null ? '—' : row.at.slice(11, 16),
    impersonation: row.impersonation,
  }));
}

type ApiIssue = {
  id: number;
  title: string;
  severity: 'info' | 'warning' | 'error';
  source: string;
  at: string | null;
};

/**
 * The support queue, drawn as the log screen's rows.
 *
 * The console's `LOG` fixture and the platform's `issues` table are the same
 * thing seen twice — "something the operator has to answer for" — so the screen
 * reads the table rather than a second store nobody writes to.
 */
export async function platformLog(): Promise<readonly LogEntry[]> {
  const live = await apiGet<{ data: ApiIssue[] }>('/platform/issues');

  if (!live?.data) return LOG;

  return live.data.map((row): LogEntry => ({
    id: String(row.id),
    at: row.at === null ? '—' : row.at.slice(11, 19),
    level: row.severity,
    source: row.source,
    message: row.title,
  }));
}

/**
 * The platform operator's view: every tenant, not one of them.
 *
 * The one dataset on the product that is *not* tenant-scoped, which is exactly
 * why it lives behind its own surface and its own role. Every other seam in
 * this app carries a branch or a tenant; this one carries neither, and the API
 * behind it will sit outside the `BelongsToTenant` scope entirely.
 *
 * Money is integer tiyin.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export type PlanId = 'start' | 'growth' | 'enterprise';

/** How a tenant's subscription is doing. */
export type PayState = 'paid' | 'late' | 'failing';

export type Tenant = {
  id: string;
  /**
   * The row's numeric key upstream, or `null` when this row is a fixture.
   *
   * `id` is the slug, because that is what a person quotes on a call and what
   * every other screen keys its lookups by. The API binds `/platform/tenants/
   * {tenant}` to the primary key, so anything that *writes* needs this instead
   * — and the split is deliberate rather than an oversight: a screen rendering
   * the fixtures has no real key, and a button that made one up would suspend
   * whichever restaurant happens to hold that id.
   */
  tenantId: number | null;
  /** A restaurant's name is a proper noun; it is not translated. */
  name: string;
  /** A city key into `console.city`, so the list reads in three languages. */
  city: 'tashkent' | 'samarkand' | 'bukhara' | 'fergana' | 'namangan' | 'termiz';
  plan: PlanId;
  branches: number;
  users: number;
  mrr: number;
  pay: PayState;
  /** Minutes since last activity. Formatted at the edge. */
  seenMinutes: number;
  /**
   * The account the platform issued when this restaurant was opened, when the
   * API answered — `undefined` on the fixtures below, which have no logins.
   *
   * The email is the field this exists for. It is what an operator is asked for
   * on the phone, and before the API sent it the card read its owner out of
   * `TENANT_DETAIL`: a fixture keyed by the demo slugs, so every restaurant
   * actually onboarded here drew an em dash where its contact should be.
   */
  owner?: { name: string; email: string; phone: string | null } | null;
  /** ISO, or null once the trial is over. Undefined on the fixtures below. */
  trialEndsAt?: string | null;
  /** `YYYY-MM-DD`. The day this restaurant was put on the platform. */
  since?: string | null;
  /** Tills paired to it. Zero is a real and interesting answer. */
  terminals?: number;
};

export type PlanRow = { id: PlanId; price: number; tenants: number };

export type HealthRow = {
  id: 'api' | 'db' | 'queue' | 'realtime';
  status: 'healthy' | 'degraded';
  /** The figure behind the status — milliseconds, or a queue depth. */
  reading: string;
};

export type PlatformOverview = {
  tenants: number;
  branchesActive: number;
  branchesTotal: number;
  mrr: number;
  failing: number;
  /** Twelve months of platform revenue, oldest first. */
  growth: readonly number[];
  list: readonly Tenant[];
  plans: readonly PlanRow[];
  health: readonly HealthRow[];
  /**
   * Whether `/platform/overview` answered, or this is the placeholder.
   *
   * Read it before drawing anything the endpoint does not carry. Two things on
   * the overview are NOT in its payload — the twelve-month growth curve and the
   * four service readings — and both used to be taken from the fixture and
   * rendered beside live figures: a platform a week old showed a year of growth
   * and four green "Healthy" chips that were constants, on the one screen whose
   * job is noticing that something is broken.
   */
  live: boolean;
};

const PLACEHOLDER: PlatformOverview = {
  live: false,
  tenants: 42,
  branchesActive: 112,
  branchesTotal: 118,
  mrr: som(268_400_000),
  failing: 2,

  growth: [
    som(148_000_000),
    som(162_000_000),
    som(171_000_000),
    som(184_000_000),
    som(196_000_000),
    som(203_000_000),
    som(214_000_000),
    som(228_000_000),
    som(236_000_000),
    som(247_000_000),
    som(259_000_000),
    som(268_400_000),
  ],

  list: [
    {
      id: 'smart',
      tenantId: null,
      name: 'Smart Restaurant',
      city: 'tashkent',
      plan: 'enterprise',
      branches: 5,
      users: 69,
      mrr: som(14_800_000),
      pay: 'paid',
      seenMinutes: 2,
    },
    {
      id: 'registon',
      tenantId: null,
      name: 'Registon Palov',
      city: 'samarkand',
      plan: 'enterprise',
      branches: 6,
      users: 88,
      mrr: som(14_800_000),
      pay: 'paid',
      seenMinutes: 18,
    },
    {
      id: 'osh',
      tenantId: null,
      name: 'Osh Markazi',
      city: 'samarkand',
      plan: 'growth',
      branches: 3,
      users: 41,
      mrr: som(6_900_000),
      pay: 'paid',
      seenMinutes: 9,
    },
    {
      id: 'choyxona',
      tenantId: null,
      name: 'Choyxona 24',
      city: 'tashkent',
      plan: 'growth',
      branches: 4,
      users: 52,
      mrr: som(6_900_000),
      pay: 'late',
      seenMinutes: 60,
    },
    {
      id: 'milliy',
      tenantId: null,
      name: 'Milliy Taomlar',
      city: 'fergana',
      plan: 'growth',
      branches: 2,
      users: 27,
      mrr: som(6_900_000),
      pay: 'failing',
      seenMinutes: 1_440,
    },
    {
      id: 'lavash',
      tenantId: null,
      name: 'Lavash House',
      city: 'bukhara',
      plan: 'start',
      branches: 1,
      users: 12,
      mrr: som(2_400_000),
      pay: 'paid',
      seenMinutes: 180,
    },
    {
      id: 'anor',
      tenantId: null,
      name: 'Anor Grill',
      city: 'termiz',
      plan: 'start',
      branches: 1,
      users: 11,
      mrr: som(2_400_000),
      pay: 'paid',
      seenMinutes: 5_760,
    },
    {
      id: 'pizzanur',
      tenantId: null,
      name: 'Pizza Nur',
      city: 'namangan',
      plan: 'start',
      branches: 1,
      users: 9,
      mrr: som(2_400_000),
      pay: 'failing',
      seenMinutes: 2_880,
    },
  ],

  plans: [
    { id: 'start', price: som(2_400_000), tenants: 19 },
    { id: 'growth', price: som(6_900_000), tenants: 16 },
    { id: 'enterprise', price: som(14_800_000), tenants: 7 },
  ],

  health: [
    { id: 'api', status: 'healthy', reading: '84 ms' },
    { id: 'db', status: 'healthy', reading: '12 ms' },
    { id: 'queue', status: 'degraded', reading: '1 284' },
    { id: 'realtime', status: 'healthy', reading: '96 ms' },
  ],
};

/**
 * The demo overview, which is now the fallback rather than the answer.
 *
 * `GET /api/v1/platform/overview` exists and `platform-server.ts` reads it —
 * see `platformOverview()`, which calls this one for the shape it draws when
 * the API says nothing. That endpoint is the one on the product that must run
 * outside the tenant scope, and therefore the one with its own authorisation
 * test: a request carrying an owner's token is refused there even though that
 * owner is an admin of their own restaurant. `PlatformConsoleTest` holds it.
 *
 * Still `async` on purpose. `platformOverview()` awaits it beside the live
 * request, and a synchronous constant would tempt a caller to read the fixtures
 * directly — which is exactly what the tenants screen used to do, so it drew
 * eight invented restaurants on a console with a real session behind it.
 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  return PLACEHOLDER;
}

/* ===================================================================== *
 * The other eleven screens.
 *
 * `specs/01-os.md §6` gives the platform twelve screens and its own sidebar;
 * this file held the data for exactly one of them. The rest are below, in the
 * same shape and with the same caveat: everything here is a fixture, and the
 * endpoints behind them all sit outside `BelongsToTenant`.
 * ===================================================================== */

/**
 * One branch of one tenant, as the platform sees it.
 *
 * `Smart Restaurant OS.dc.html:7113-7136` gives the tenant card a branch table
 * with four figures and a status, and a total row under it. The platform panel
 * had none of it, which left an operator answering "how big is this customer"
 * with a single branch count.
 *
 * `city` is a key into this file's own `CITY_KEYS`; a branch can sit in a town
 * the tenant's own city field never names — Milliy Taomlar bills from Fergana
 * and trades in Kokand.
 */
export type TenantBranch = {
  name: string;
  city: CityKey;
  seats: number;
  staff: number;
  /** A month's takings, in tiyin. */
  revenue: number;
};

/** Every city the platform's own copy has a name for, in three languages. */
export type CityKey =
  'tashkent' | 'samarkand' | 'bukhara' | 'fergana' | 'kokand' | 'namangan' | 'termiz';

/** Everything about one tenant that only the tenant card needs. */
export type TenantDetail = {
  id: string;
  owner: string;
  phone: string;
  /** dd.mm.yyyy — a date somebody reads, never one anything computes with. */
  since: string;
  nextInvoice: string;
  /** Suspended tenants keep their data and lose their logins. */
  state: 'live' | 'suspended' | 'trial';
  /** The design's own branch table for this tenant. */
  branches: readonly TenantBranch[];
};

export const TENANT_DETAIL: Readonly<Record<string, TenantDetail>> = {
  smart: {
    id: 'smart',
    owner: 'Rustam Kamolov',
    phone: '+998 93 774 10 05',
    since: '14.02.2024',
    nextInvoice: '01.09.2026',
    state: 'live',
    branches: [
      { name: 'Chilonzor', city: 'tashkent', seats: 96, staff: 19, revenue: som(187_200_000) },
      { name: 'Yunusobod', city: 'tashkent', seats: 74, staff: 16, revenue: som(144_300_000) },
      { name: "Mirzo Ulug'bek", city: 'tashkent', seats: 60, staff: 14, revenue: som(104_100_000) },
      { name: 'Sergeli', city: 'tashkent', seats: 48, staff: 11, revenue: som(71_700_000) },
      { name: 'Termiz Markaz', city: 'termiz', seats: 52, staff: 9, revenue: som(45_300_000) },
    ],
  },
  registon: {
    id: 'registon',
    owner: 'Farrux Tursunov',
    phone: '+998 93 401 55 29',
    since: '30.08.2023',
    nextInvoice: '01.09.2026',
    state: 'live',
    branches: [
      { name: 'Registon', city: 'samarkand', seats: 140, staff: 24, revenue: som(214_800_000) },
      { name: "Bog'ishamol", city: 'samarkand', seats: 96, staff: 19, revenue: som(146_300_000) },
      { name: 'Sattepo', city: 'samarkand', seats: 72, staff: 15, revenue: som(98_100_000) },
      { name: "Temiryo'l", city: 'samarkand', seats: 64, staff: 13, revenue: som(81_700_000) },
      { name: 'Universitet', city: 'samarkand', seats: 58, staff: 11, revenue: som(69_400_000) },
      { name: "Ipak yo'li", city: 'samarkand', seats: 44, staff: 8, revenue: som(47_200_000) },
    ],
  },
  osh: {
    id: 'osh',
    owner: 'Shahzod Ergashev',
    phone: '+998 91 330 77 12',
    since: '03.06.2024',
    nextInvoice: '01.09.2026',
    state: 'live',
    branches: [
      { name: 'Registon', city: 'samarkand', seats: 120, staff: 22, revenue: som(168_400_000) },
      { name: 'Universitet', city: 'samarkand', seats: 68, staff: 15, revenue: som(92_600_000) },
      { name: 'Siyob', city: 'samarkand', seats: 44, staff: 9, revenue: som(51_300_000) },
    ],
  },
  choyxona: {
    id: 'choyxona',
    owner: 'Kamola Yusupova',
    phone: '+998 90 118 42 60',
    since: '21.11.2023',
    nextInvoice: '12.08.2026',
    state: 'live',
    branches: [
      { name: 'Olmazor', city: 'tashkent', seats: 84, staff: 17, revenue: som(131_900_000) },
      { name: 'Chorsu', city: 'tashkent', seats: 110, staff: 21, revenue: som(158_200_000) },
      { name: 'Yakkasaroy', city: 'tashkent', seats: 56, staff: 12, revenue: som(74_800_000) },
      { name: 'Bektemir', city: 'tashkent', seats: 40, staff: 8, revenue: som(42_100_000) },
    ],
  },
  milliy: {
    id: 'milliy',
    owner: 'Nodir Sobirov',
    phone: '+998 97 240 19 05',
    since: '17.04.2025',
    nextInvoice: '28.07.2026',
    state: 'suspended',
    branches: [
      { name: 'Markaz', city: 'fergana', seats: 72, staff: 16, revenue: som(96_700_000) },
      { name: "Qo'qon yo'li", city: 'kokand', seats: 54, staff: 11, revenue: som(63_200_000) },
    ],
  },
  lavash: {
    id: 'lavash',
    owner: 'Doston Rahimov',
    phone: '+998 94 507 33 81',
    since: '09.01.2026',
    nextInvoice: '01.09.2026',
    state: 'live',
    branches: [
      { name: 'Labi Hovuz', city: 'bukhara', seats: 38, staff: 12, revenue: som(58_400_000) },
    ],
  },
  anor: {
    id: 'anor',
    owner: 'Bobur Ochilov',
    phone: '+998 90 884 26 17',
    since: '02.10.2025',
    nextInvoice: '01.09.2026',
    state: 'live',
    branches: [{ name: 'Sharq', city: 'termiz', seats: 46, staff: 11, revenue: som(44_600_000) }],
  },
  pizzanur: {
    id: 'pizzanur',
    owner: 'Aziz Umarov',
    phone: '+998 99 612 08 44',
    since: '28.07.2026',
    nextInvoice: '11.09.2026',
    state: 'trial',
    branches: [
      { name: "Navoiy ko'chasi", city: 'namangan', seats: 42, staff: 9, revenue: som(38_900_000) },
    ],
  },
};

/**
 * The names the tenant card's user list draws from.
 *
 * `Smart Restaurant OS.dc.html:14348` builds the list from a shared pool and
 * puts the owner in the first row: a platform operator opening a customer is
 * not auditing that customer's staff, they are checking that somebody is
 * actually signing in. How many rows are shown scales with the head count —
 * four at the smallest tenant, eight at the largest.
 *
 * Role ids are `lib/roles.ts`'s, so the names come from `console.roles` and
 * follow the language switch rather than being spelled here.
 */
export type PlatformUser = { name: string; role: string };

export const USER_POOL: readonly PlatformUser[] = [
  { name: 'Aziza Rasulova', role: 'manager' },
  { name: 'Jasur Toshev', role: 'waiter' },
  { name: 'Nodira Saidova', role: 'waiter' },
  { name: 'Dilshod Karimov', role: 'cashier' },
  { name: 'Bekzod Alimov', role: 'kitchen' },
  { name: 'Sardor Nazarov', role: 'warehouse' },
  { name: "Malika Yo'ldosheva", role: 'accountant' },
  { name: 'Kamola Ergasheva', role: 'manager' },
  { name: 'Otabek Sultonov', role: 'waiter' },
  { name: 'Zilola Abdullaeva', role: 'cashier' },
  { name: 'Sherzod Tursunov', role: 'kitchen' },
  { name: 'Nilufar Yusupova', role: 'waiter' },
];

/** How many user rows a tenant's card shows — the design's own clamp. */
export function userRowCount(users: number): number {
  return Math.max(4, Math.min(8, Math.round(users / 9)));
}

/**
 * Where a tenant's four feature flags start.
 *
 * Derived rather than stored, and the derivation is the commercial rule the
 * plan table already states: delivery comes with Growth, loyalty only with
 * Enterprise, and multi-branch reporting only means anything above one branch.
 * `FeatureKey` and `FEATURES` are further down, with the plan tiers.
 */
export function defaultFeatures(plan: PlanId, branches: number): Record<FeatureKey, boolean> {
  return {
    kds: true,
    delivery: plan !== 'start',
    loyalty: plan === 'enterprise',
    multiBranch: branches > 1,
  };
}

/* ------------------------------------------------------------ terminals */

export type DeviceState = 'online' | 'offline' | 'needsUpdate';

export type Device = {
  id: string;
  tenant: string;
  branch: string;
  kind: 'POS' | 'KDS';
  version: string;
  state: DeviceState;
  /** Minutes since the last sync. Phrased at the edge, so one locale decides. */
  syncedMinutesAgo: number;
};

/** The version every terminal should be on. Anything behind it is amber. */
export const CURRENT_VERSION = '4.2.1';

export const DEVICES: readonly Device[] = [
  {
    id: 'POS-114',
    tenant: 'Smart Restaurant',
    branch: 'Chilonzor',
    kind: 'POS',
    version: '4.2.1',
    state: 'online',
    syncedMinutesAgo: 2,
  },
  {
    id: 'KDS-07',
    tenant: 'Smart Restaurant',
    branch: 'Chilonzor',
    kind: 'KDS',
    version: '4.2.1',
    state: 'online',
    syncedMinutesAgo: 1,
  },
  {
    id: 'POS-118',
    tenant: 'Smart Restaurant',
    branch: 'Yunusobod',
    kind: 'POS',
    version: '4.2.1',
    state: 'online',
    syncedMinutesAgo: 4,
  },
  {
    id: 'POS-131',
    tenant: 'Smart Restaurant',
    branch: 'Termiz Markaz',
    kind: 'POS',
    version: '4.1.6',
    state: 'needsUpdate',
    syncedMinutesAgo: 22,
  },
  {
    id: 'POS-204',
    tenant: 'Registon Palov',
    branch: 'Registon',
    kind: 'POS',
    version: '4.2.1',
    state: 'online',
    syncedMinutesAgo: 1,
  },
  {
    id: 'KDS-19',
    tenant: 'Registon Palov',
    branch: 'Sattepo',
    kind: 'KDS',
    version: '4.2.1',
    state: 'offline',
    syncedMinutesAgo: 180,
  },
  {
    id: 'POS-302',
    tenant: 'Choyxona 24',
    branch: 'Chorsu',
    kind: 'POS',
    version: '4.2.0',
    state: 'online',
    syncedMinutesAgo: 6,
  },
  {
    id: 'POS-309',
    tenant: 'Choyxona 24',
    branch: 'Bektemir',
    kind: 'POS',
    version: '4.0.9',
    state: 'offline',
    syncedMinutesAgo: 2_880,
  },
  {
    id: 'POS-410',
    tenant: 'Osh Markazi',
    branch: 'Registon',
    kind: 'POS',
    version: '4.2.1',
    state: 'online',
    syncedMinutesAgo: 8,
  },
  {
    id: 'KDS-11',
    tenant: 'Osh Markazi',
    branch: 'Siyob',
    kind: 'KDS',
    version: '4.1.6',
    state: 'needsUpdate',
    syncedMinutesAgo: 40,
  },
  {
    id: 'POS-505',
    tenant: 'Lavash House',
    branch: 'Labi Hovuz',
    kind: 'POS',
    version: '4.2.1',
    state: 'online',
    syncedMinutesAgo: 12,
  },
  {
    id: 'POS-601',
    tenant: 'Anor Grill',
    branch: 'Sharq',
    kind: 'POS',
    version: '4.1.6',
    state: 'offline',
    syncedMinutesAgo: 5_760,
  },
];

export const deviceCount = (state: DeviceState): number =>
  DEVICES.filter((device) => device.state === state).length;

/* ---------------------------------------------------------------- plans */

export type PlanTier = {
  id: PlanId;
  price: number;
  tenants: number;
  /** Hard ceilings. `null` means no ceiling on this tier. */
  branches: number | null;
  users: number | null;
  terminals: number | null;
  /** Which of the four optional modules the tier includes. */
  features: readonly FeatureKey[];
};

export type FeatureKey = 'kds' | 'delivery' | 'loyalty' | 'multiBranch';

export const FEATURES: readonly FeatureKey[] = ['kds', 'delivery', 'loyalty', 'multiBranch'];

export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: 'start',
    price: som(2_400_000),
    tenants: 19,
    branches: 1,
    users: 15,
    terminals: 2,
    features: ['kds'],
  },
  {
    id: 'growth',
    price: som(6_900_000),
    tenants: 16,
    branches: 5,
    users: 60,
    terminals: 10,
    features: ['kds', 'delivery', 'multiBranch'],
  },
  {
    id: 'enterprise',
    price: som(14_800_000),
    tenants: 7,
    branches: null,
    users: null,
    terminals: null,
    features: ['kds', 'delivery', 'loyalty', 'multiBranch'],
  },
];

/* -------------------------------------------------------------- billing */

export type InvoiceState = 'paid' | 'dunning' | 'failed';

export type Invoice = {
  /** `INV-2026-814` — the number both sides quote on the telephone. */
  id: string;
  /**
   * The row's numeric key upstream, or `null` for a fixture.
   *
   * Same split as `Tenant.tenantId`, and for the same reason: the number is
   * what a person reads and the key is what `POST /platform/billing/{invoice}/
   * mark-paid` binds to. Marking one paid is a statement about money that an
   * accountant reads back in a year, so it may only ever be aimed at a row the
   * server actually sent.
   */
  key: number | null;
  tenantId: string;
  amount: number;
  issued: string;
  state: InvoiceState;
  /**
   * How many times the card has been tried.
   *
   * The number is on the screen because it decides the next move: a first
   * failure is usually a bank, a fourth is a customer who has left.
   */
  attempts: number;
};

export const INVOICES: readonly Invoice[] = [
  {
    id: 'INV-2026-814',
    key: null,
    tenantId: 'smart',
    amount: som(14_800_000),
    issued: '01.08.2026',
    state: 'paid',
    attempts: 1,
  },
  {
    id: 'INV-2026-815',
    key: null,
    tenantId: 'registon',
    amount: som(14_800_000),
    issued: '01.08.2026',
    state: 'paid',
    attempts: 1,
  },
  {
    id: 'INV-2026-819',
    key: null,
    tenantId: 'osh',
    amount: som(6_900_000),
    issued: '01.08.2026',
    state: 'paid',
    attempts: 1,
  },
  {
    id: 'INV-2026-821',
    key: null,
    tenantId: 'choyxona',
    amount: som(6_900_000),
    issued: '01.08.2026',
    state: 'dunning',
    attempts: 2,
  },
  {
    id: 'INV-2026-822',
    key: null,
    tenantId: 'milliy',
    amount: som(6_900_000),
    issued: '28.07.2026',
    state: 'failed',
    attempts: 4,
  },
  {
    id: 'INV-2026-830',
    key: null,
    tenantId: 'pizzanur',
    amount: som(2_400_000),
    issued: '01.08.2026',
    state: 'failed',
    attempts: 3,
  },
];

/* --------------------------------------------------------- subscription */

/** One ceiling and what a tenant is doing against it. */
export type UsageRow = {
  key: 'branches' | 'users' | 'terminals' | 'orders';
  used: number;
  /** `null` where the plan sets no ceiling. */
  limit: number | null;
};

export const USAGE: Readonly<Record<string, readonly UsageRow[]>> = {
  smart: [
    { key: 'branches', used: 5, limit: null },
    { key: 'users', used: 69, limit: null },
    { key: 'terminals', used: 11, limit: null },
    { key: 'orders', used: 48_200, limit: null },
  ],
  choyxona: [
    { key: 'branches', used: 4, limit: 5 },
    { key: 'users', used: 52, limit: 60 },
    { key: 'terminals', used: 9, limit: 10 },
    { key: 'orders', used: 31_400, limit: 40_000 },
  ],
  lavash: [
    { key: 'branches', used: 1, limit: 1 },
    { key: 'users', used: 12, limit: 15 },
    /* At the ceiling. This is the row that sells the next tier, so it is the
       one the screen colours. */
    { key: 'terminals', used: 2, limit: 2 },
    { key: 'orders', used: 6_900, limit: 10_000 },
  ],
};

/** Whether a row is at or over its ceiling. */
export const atLimit = (row: UsageRow): boolean => row.limit !== null && row.used >= row.limit;

/* --------------------------------------------------------------- trials */

export type Trial = {
  tenantId: string;
  daysLeft: number;
  /**
   * How likely they are to convert, as a percentage.
   *
   * From behaviour, not a guess: a trial that has taken 400 orders and paired
   * three terminals converts; one that opened the wizard and stopped does not.
   */
  likelihood: number;
  ordersTaken: number;
};

export const TRIALS: readonly Trial[] = [
  { tenantId: 'pizzanur', daysLeft: 3, likelihood: 72, ordersTaken: 412 },
];

/* --------------------------------------------------- sign-ins and audit */

export type SignIn = {
  id: string;
  who: string;
  /** What they did, as a key — the tenant name is interpolated at the edge. */
  action: 'signedInAs' | 'suspended' | 'markedPaid' | 'changedPlan' | 'signedIn';
  tenant?: string;
  reference?: string;
  at: string;
  /**
   * Whether this was an impersonation.
   *
   * Marked separately from the action because it is the line an auditor looks
   * for: an operator inside a customer's account is the most powerful thing
   * this product can do, and it must never be one row among many.
   */
  impersonation?: boolean;
};

export const SIGN_INS: readonly SignIn[] = [
  {
    id: 's1',
    who: 'Otabek Normatov',
    action: 'signedInAs',
    tenant: 'Choyxona 24',
    at: '10:42',
    impersonation: true,
  },
  { id: 's2', who: 'Dilnoza Qodirova', action: 'suspended', tenant: 'Milliy Taomlar', at: '09:58' },
  {
    id: 's3',
    who: 'Javlon Ismoilov',
    action: 'markedPaid',
    reference: 'INV-2026-814',
    at: '09:31',
  },
  {
    id: 's4',
    who: 'Otabek Normatov',
    action: 'changedPlan',
    tenant: 'Registon Palov',
    at: '17:20',
  },
  { id: 's5', who: 'Aziz Rahimov', action: 'signedIn', at: '08:10' },
];

/* ------------------------------------------------------- platform team */

export type Operator = {
  id: string;
  name: string;
  scope: 'super' | 'support' | 'billing' | 'engineer';
  email: string;
  /** Already phrased: "online now", "14 minutes ago". */
  lastSeenMinutes: number | null;
};

export const TEAM: readonly Operator[] = [
  {
    id: 't1',
    name: 'Otabek Normatov',
    scope: 'super',
    email: 'otabek@smartrest.uz',
    lastSeenMinutes: 0,
  },
  {
    id: 't2',
    name: 'Dilnoza Qodirova',
    scope: 'support',
    email: 'dilnoza@smartrest.uz',
    lastSeenMinutes: 14,
  },
  {
    id: 't3',
    name: 'Javlon Ismoilov',
    scope: 'billing',
    email: 'javlon@smartrest.uz',
    lastSeenMinutes: 60,
  },
  {
    id: 't4',
    name: 'Aziz Rahimov',
    scope: 'engineer',
    email: 'aziz@smartrest.uz',
    lastSeenMinutes: 320,
  },
];

/* --------------------------------------------------------------- health */

export type Uptime = {
  /** Thirty days, oldest first, as a percentage each. */
  days: readonly number[];
  apiLatencyMs: number;
  syncErrors24h: number;
  lastBackup: string;
};

export const UPTIME: Uptime = {
  days: [
    100, 100, 100, 100, 99.2, 100, 100, 100, 100, 100, 100, 97.4, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 99.8, 100, 100, 100, 100, 100, 100,
  ],
  apiLatencyMs: 84,
  syncErrors24h: 6,
  lastBackup: '03:10',
};

/** The month's uptime, computed from the thirty days rather than written twice. */
export const uptimePercent = (): number =>
  UPTIME.days.reduce((sum, day) => sum + day, 0) / UPTIME.days.length;

/* ------------------------------------------------------------------ log */

export type LogLevel = 'info' | 'warning' | 'error';

export type LogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  source: string;
  message: string;
};

export const LOG: readonly LogEntry[] = [
  {
    id: 'l1',
    at: '11:42:08',
    level: 'error',
    source: 'sync',
    message: 'POS-309 · batch rejected, idempotency key reused',
  },
  {
    id: 'l2',
    at: '11:38:51',
    level: 'warning',
    source: 'queue',
    message: 'receipts queue depth 1 284, above 1 000',
  },
  {
    id: 'l3',
    at: '11:31:02',
    level: 'info',
    source: 'billing',
    message: 'INV-2026-814 marked paid by javlon@smartrest.uz',
  },
  {
    id: 'l4',
    at: '11:12:44',
    level: 'warning',
    source: 'fiscal',
    message: 'OFD retry 2/5 · Choyxona 24 · Chorsu',
  },
  {
    id: 'l5',
    at: '10:42:19',
    level: 'info',
    source: 'auth',
    message: 'impersonation started · Choyxona 24 · otabek@smartrest.uz',
  },
  {
    id: 'l6',
    at: '03:10:00',
    level: 'info',
    source: 'backup',
    message: 'nightly base backup finished in 6m 12s',
  },
];

/* ---------------------------------------------------- platform settings */

export type PlatformSetting = {
  key: 'signups' | 'trialDays' | 'impersonation' | 'maintenance';
  /** A switch, or a number somebody types. */
  kind: 'toggle' | 'number';
  value: boolean | number;
};

export const PLATFORM_SETTINGS: readonly PlatformSetting[] = [
  { key: 'signups', kind: 'toggle', value: true },
  { key: 'trialDays', kind: 'number', value: 14 },
  /*
   * Impersonation stays on and is audited rather than being off by default.
   * Support cannot do its job without it; what makes it safe is the sign-in
   * history, not a switch somebody flips back on under pressure and forgets.
   */
  { key: 'impersonation', kind: 'toggle', value: true },
  { key: 'maintenance', kind: 'toggle', value: false },
];

/**
 * Minutes since a restaurant last did anything, as a phrase somebody reads.
 *
 * Eight buckets rather than a formatted duration, because the reader's question
 * is "is this alive" and not "how many minutes". The phrases come from
 * `console.platformTenants.card.seen`, so one locale decides how to say them.
 *
 * Here rather than beside either screen that calls it: the tenants list and the
 * trials list both label the same column off the same figure, and the copy that
 * drifted first would be the one nobody was looking at.
 */
export function seenLabel(minutes: number, phrases: readonly string[]): string {
  if (minutes < 5) return phrases[0];
  if (minutes < 30) return phrases[1];
  if (minutes < 120) return phrases[2];
  if (minutes < 1_440) return phrases[3];
  if (minutes < 2_880) return phrases[4];
  if (minutes < 5_760) return phrases[5];
  if (minutes < 20_160) return phrases[6];

  return phrases[7];
}

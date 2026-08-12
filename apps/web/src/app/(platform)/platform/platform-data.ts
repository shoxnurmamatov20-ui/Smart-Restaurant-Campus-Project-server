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
};

const PLACEHOLDER: PlatformOverview = {
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
 * TODO(api): GET /api/v1/platform/overview.
 *
 * The one endpoint on the product that must run outside the tenant scope, and
 * therefore the one that needs its own authorisation test: a request carrying
 * an owner's token must be refused here even though that owner is an admin of
 * their own restaurant.
 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  return PLACEHOLDER;
}

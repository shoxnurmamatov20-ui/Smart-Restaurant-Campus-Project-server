/**
 * What the platform console runs on, as the design's super-admin draws it.
 *
 * Money is integer tiyin, the same as everywhere else on the platform — this
 * console bills the restaurants that use the other one, and the two have to
 * agree about what a so'm is.
 *
 * TODO(api): GET /api/v1/admin/overview and /api/v1/admin/tenants. Both sit
 * behind the super-admin guard; nothing here is tenant-scoped, which is exactly
 * why those endpoints need their own gate rather than the tenant middleware.
 */

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const PLATFORM = {
  restaurants: 42,
  addedThisMonth: 4,
  restaurantTarget: 50,
  /** Branches live on the platform; `branchTotal` includes the ones setting up. */
  branches: 136,
  branchTotal: 142,
  users: 2_380,
  mrrTiyin: som(486_200_000),
  mrrTargetTiyin: som(600_000_000),
  mrrGrowth: '+10.2%',
  paymentIssues: 3,
  unpaidTiyin: som(16_200_000),
} as const;

/**
 * Monthly recurring revenue, twelve months, in millions of so'm.
 *
 * Kept as millions rather than tiyin because that is the unit the chart is
 * labelled in; the figure a reader compares against is `PLATFORM.mrrTiyin`,
 * which is exact.
 */
export const MRR_TREND: readonly { month: string; millions: number }[] = [
  { month: '09', millions: 186 },
  { month: '10', millions: 204 },
  { month: '11', millions: 228 },
  { month: '12', millions: 251 },
  { month: '01', millions: 274 },
  { month: '02', millions: 296 },
  { month: '03', millions: 318 },
  { month: '04', millions: 347 },
  { month: '05', millions: 369 },
  { month: '06', millions: 402 },
  { month: '07', millions: 441 },
  { month: '08', millions: 486 },
];

export type Plan = {
  id: 'Start' | 'Growth' | 'Enterprise';
  priceTiyin: number;
  branches: number;
  users: number;
  /** How many restaurants are on it. */
  count: number;
  colour: string;
  /** Chip colours on the tenant table. */
  chip: string;
};

export const PLANS: readonly Plan[] = [
  {
    id: 'Start',
    priceTiyin: som(2_400_000),
    branches: 1,
    users: 15,
    count: 19,
    colour: 'var(--n-300)',
    chip: 'bg-bg-muted text-fg-muted',
  },
  {
    id: 'Growth',
    priceTiyin: som(6_900_000),
    branches: 5,
    users: 60,
    count: 16,
    colour: 'var(--accent-500)',
    chip: 'bg-accent-50 text-accent-700',
  },
  {
    id: 'Enterprise',
    priceTiyin: som(14_800_000),
    branches: 25,
    users: 400,
    count: 7,
    colour: 'var(--brand-500)',
    chip: 'bg-brand-50 text-brand-700',
  },
];

/** What each plan includes, in the order the design's plan cards list it. */
export const PLAN_FEATURES: Record<Plan['id'], readonly string[]> = {
  Start: ['coreReports', 'emailSupport'],
  Growth: ['fullReports', 'emailSupport'],
  Enterprise: ['fullReports', 'dedicated'],
};

export const PLAN_BY_ID: Record<Plan['id'], Plan> = Object.fromEntries(
  PLANS.map((plan) => [plan.id, plan]),
) as Record<Plan['id'], Plan>;

/** 0 overdue, 1 paid, 2 pending. */
export type BillingState = 0 | 1 | 2;
/** 0 suspended, 1 active, 2 trial. */
export type TenantState = 0 | 1 | 2;

/** A branch, as the restaurant's own page lists it. */
export type Branch = {
  name: string;
  city: string;
  seats: number;
  staff: number;
  revenueTiyin: number;
  /** A branch mid-setup on a trial account is neither active nor suspended. */
  settingUp?: boolean;
};

export type Tenant = {
  id: string;
  name: string;
  city: string;
  plan: Plan['id'];
  branches: number;
  users: number;
  lastSeen: string;
  billing: BillingState;
  state: TenantState;
  mrrTiyin: number;
  owner: string;
  phone: string;
  since: string;
  next: string;
  zones: readonly Branch[];
};

export const TENANTS: readonly Tenant[] = [
  {
    id: 'smart',
    name: 'Smart Restaurant',
    city: 'Toshkent',
    plan: 'Enterprise',
    branches: 5,
    users: 69,
    lastSeen: '2 daqiqa oldin',
    billing: 1,
    state: 1,
    mrrTiyin: som(14_800_000),
    owner: 'Rustam Kamolov',
    phone: '+998 93 774 10 05',
    since: '14.02.2024',
    next: '01.09.2026',
    zones: [
      { name: 'Chilonzor', city: 'Toshkent', seats: 96, staff: 19, revenueTiyin: som(187_200_000) },
      { name: 'Yunusobod', city: 'Toshkent', seats: 74, staff: 16, revenueTiyin: som(144_300_000) },
      {
        name: "Mirzo Ulug'bek",
        city: 'Toshkent',
        seats: 60,
        staff: 14,
        revenueTiyin: som(104_100_000),
      },
      { name: 'Sergeli', city: 'Toshkent', seats: 48, staff: 11, revenueTiyin: som(71_700_000) },
      { name: 'Termiz Markaz', city: 'Termiz', seats: 52, staff: 9, revenueTiyin: som(45_300_000) },
    ],
  },
  {
    id: 'osh',
    name: 'Osh Markazi',
    city: 'Samarqand',
    plan: 'Growth',
    branches: 3,
    users: 41,
    lastSeen: '9 daqiqa oldin',
    billing: 1,
    state: 1,
    mrrTiyin: som(6_900_000),
    owner: 'Shahzod Ergashev',
    phone: '+998 91 330 77 12',
    since: '03.06.2024',
    next: '01.09.2026',
    zones: [
      {
        name: 'Registon',
        city: 'Samarqand',
        seats: 120,
        staff: 22,
        revenueTiyin: som(168_400_000),
      },
      {
        name: 'Universitet',
        city: 'Samarqand',
        seats: 68,
        staff: 15,
        revenueTiyin: som(92_600_000),
      },
      { name: 'Siyob', city: 'Samarqand', seats: 44, staff: 9, revenueTiyin: som(51_300_000) },
    ],
  },
  {
    id: 'choyxona',
    name: 'Choyxona 24',
    city: 'Toshkent',
    plan: 'Growth',
    branches: 4,
    users: 52,
    lastSeen: '1 soat oldin',
    billing: 2,
    state: 1,
    mrrTiyin: som(6_900_000),
    owner: 'Kamola Yusupova',
    phone: '+998 90 118 42 60',
    since: '21.11.2023',
    next: '12.08.2026',
    zones: [
      { name: 'Olmazor', city: 'Toshkent', seats: 84, staff: 17, revenueTiyin: som(131_900_000) },
      { name: 'Chorsu', city: 'Toshkent', seats: 110, staff: 21, revenueTiyin: som(158_200_000) },
      { name: 'Yakkasaroy', city: 'Toshkent', seats: 56, staff: 12, revenueTiyin: som(74_800_000) },
      { name: 'Bektemir', city: 'Toshkent', seats: 40, staff: 8, revenueTiyin: som(42_100_000) },
    ],
  },
  {
    id: 'lavash',
    name: 'Lavash House',
    city: 'Buxoro',
    plan: 'Start',
    branches: 1,
    users: 12,
    lastSeen: '3 soat oldin',
    billing: 1,
    state: 1,
    mrrTiyin: som(2_400_000),
    owner: 'Doston Rahimov',
    phone: '+998 94 507 33 81',
    since: '09.01.2026',
    next: '01.09.2026',
    zones: [
      { name: 'Labi Hovuz', city: 'Buxoro', seats: 38, staff: 12, revenueTiyin: som(58_400_000) },
    ],
  },
  {
    id: 'milliy',
    name: 'Milliy Taomlar',
    city: "Farg'ona",
    plan: 'Growth',
    branches: 2,
    users: 27,
    lastSeen: 'Kecha',
    billing: 0,
    state: 0,
    mrrTiyin: som(6_900_000),
    owner: 'Nodir Sobirov',
    phone: '+998 97 240 19 05',
    since: '17.04.2025',
    next: '28.07.2026',
    zones: [
      { name: 'Markaz', city: "Farg'ona", seats: 72, staff: 16, revenueTiyin: som(96_700_000) },
      { name: "Qo'qon yo'li", city: "Qo'qon", seats: 54, staff: 11, revenueTiyin: som(63_200_000) },
    ],
  },
  {
    id: 'pizza',
    name: 'Pizza Nur',
    city: 'Namangan',
    plan: 'Start',
    branches: 1,
    users: 9,
    lastSeen: '2 kun oldin',
    billing: 2,
    state: 2,
    mrrTiyin: som(2_400_000),
    owner: 'Aziz Umarov',
    phone: '+998 99 612 08 44',
    since: '28.07.2026',
    next: '11.09.2026',
    zones: [
      {
        name: "Navoiy ko'chasi",
        city: 'Namangan',
        seats: 42,
        staff: 9,
        revenueTiyin: som(38_900_000),
        settingUp: true,
      },
    ],
  },
  {
    id: 'anor',
    name: 'Anor Grill',
    city: 'Termiz',
    plan: 'Start',
    branches: 1,
    users: 11,
    lastSeen: '4 kun oldin',
    billing: 1,
    state: 1,
    mrrTiyin: som(2_400_000),
    owner: 'Bobur Ochilov',
    phone: '+998 90 884 26 17',
    since: '02.10.2025',
    next: '01.09.2026',
    zones: [{ name: 'Sharq', city: 'Termiz', seats: 46, staff: 11, revenueTiyin: som(44_600_000) }],
  },
  {
    id: 'registon',
    name: 'Registon Palov',
    city: 'Samarqand',
    plan: 'Enterprise',
    branches: 6,
    users: 88,
    lastSeen: '18 daqiqa oldin',
    billing: 1,
    state: 1,
    mrrTiyin: som(14_800_000),
    owner: 'Farrux Tursunov',
    phone: '+998 93 401 55 29',
    since: '30.08.2023',
    next: '01.09.2026',
    zones: [
      {
        name: 'Registon',
        city: 'Samarqand',
        seats: 140,
        staff: 24,
        revenueTiyin: som(214_800_000),
      },
      {
        name: "Bog'ishamol",
        city: 'Samarqand',
        seats: 96,
        staff: 19,
        revenueTiyin: som(146_300_000),
      },
      { name: 'Sattepo', city: 'Samarqand', seats: 72, staff: 15, revenueTiyin: som(98_100_000) },
      { name: "Temiryo'l", city: 'Samarqand', seats: 64, staff: 13, revenueTiyin: som(81_700_000) },
      {
        name: 'Universitet',
        city: 'Samarqand',
        seats: 58,
        staff: 11,
        revenueTiyin: som(69_400_000),
      },
      {
        name: "Ipak yo'li",
        city: 'Samarqand',
        seats: 44,
        staff: 8,
        revenueTiyin: som(47_200_000),
      },
    ],
  },
];

export const TENANT_BY_ID: Record<string, Tenant> = Object.fromEntries(
  TENANTS.map((tenant) => [tenant.id, tenant]),
);

/**
 * The switches a restaurant's own plan turns on.
 *
 * Feature flags live on the platform rather than in the restaurant's settings,
 * because turning KDS on is a commercial decision, not a preference.
 */
export const FEATURE_FLAGS: readonly { key: string; plans: Plan['id'][] }[] = [
  { key: 'kds', plans: ['Start', 'Growth', 'Enterprise'] },
  { key: 'delivery', plans: ['Growth', 'Enterprise'] },
  { key: 'loyalty', plans: ['Growth', 'Enterprise'] },
  { key: 'multi', plans: ['Enterprise'] },
];

/** The people a restaurant's own page lists, in the order the design shows. */
export const TENANT_STAFF: readonly { role: string; seen: string }[] = [
  { role: 'owner', seen: 'Hozir onlayn' },
  { role: 'director', seen: '12 daqiqa oldin' },
  { role: 'cashier', seen: '1 soat oldin' },
  { role: 'chef', seen: 'Bugun 08:40' },
  { role: 'waiter', seen: 'Kecha' },
  { role: 'storekeeper', seen: '3 kun oldin' },
];

/** Names for the staff rows a restaurant's page shows beneath its owner. */
export const STAFF_NAMES: readonly string[] = [
  'Aziza Rahimova',
  'Nodira Saidova',
  'Bekzod Tursunov',
  'Malika Yo‘ldosheva',
  'Sardor Nazarov',
];

/**
 * `key` names a string in `platform.state`, not the word itself.
 *
 * The colour belongs to the data — overdue is red wherever it appears — and the
 * word belongs to the catalogue, so the console can change language without a
 * second copy of this table.
 */
export const BILLING_LABEL: Record<BillingState, { key: string; tone: string }> = {
  0: { key: 'overdue', tone: 'bg-danger-50 text-danger-700' },
  1: { key: 'paid', tone: 'bg-success-50 text-success-700' },
  2: { key: 'pending', tone: 'bg-warning-50 text-warning-700' },
};

export const STATE_LABEL: Record<TenantState, { key: string; tone: string }> = {
  0: { key: 'suspended', tone: 'bg-danger-50 text-danger-700' },
  1: { key: 'active', tone: 'bg-success-50 text-success-700' },
  2: { key: 'trial', tone: 'bg-warning-50 text-warning-700' },
};

/**
 * The health panel's six rows.
 *
 * Each carries a bar as well as a figure, because "4 / 2 380 offline" means
 * nothing until you can see how small four is against the whole estate.
 */
export const HEALTH_ROWS: readonly {
  label: string;
  value: string;
  percent: number;
  tone?: string;
}[] = [
  { label: 'Ishlash vaqti, 30 kun', value: '99.98%', percent: 100, tone: 'text-success-700' },
  { label: 'API javob vaqti', value: '142 ms', percent: 62 },
  { label: "Ma'lumotlar bazasi yuki", value: '38%', percent: 38 },
  { label: 'Oflayn terminallar', value: '4 / 2 380', percent: 4, tone: 'text-warning-700' },
  { label: 'Sinxronizatsiya xatolari', value: '2', percent: 8, tone: 'text-warning-700' },
  { label: 'Xatolik darajasi, 24 soat', value: '0.06%', percent: 6, tone: 'text-success-700' },
];

/** 'danger' needs a decision, 'warning' a look, 'note' is a record. */
export type LogLevel = 'danger' | 'success' | 'warning' | 'note';

export const SYSTEM_LOG: readonly { time: string; text: string; level: LogLevel }[] = [
  {
    time: '11:22',
    text: "Choyxona 24 · to'lov muvaffaqiyatsiz, karta muddati tugagan",
    level: 'danger',
  },
  { time: '10:47', text: "Registon Palov · 6-filial qo'shildi", level: 'success' },
  { time: '09:58', text: 'Milliy Taomlar · obuna 3 kundan keyin tugaydi', level: 'warning' },
  {
    time: '09:12',
    text: 'Smart Restaurant · Termiz filiali oflayn rejimdan qaytdi',
    level: 'note',
  },
  { time: '08:30', text: 'Tizim · kechalik zaxira nusxa yakunlandi', level: 'note' },
];

export const LOG_DOT: Record<LogLevel, string> = {
  danger: 'bg-danger-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  note: 'bg-[var(--fg-subtle)]',
};

/**
 * The platform's own switches.
 *
 * The last one cannot be turned off, and says so. A console that can quietly
 * stop recording what its operators do is a console nobody should trust — so
 * the control is drawn, disabled, with the reason next to it rather than
 * hidden.
 */
export const PLATFORM_SETTINGS: readonly {
  key: string;
  on: boolean;
  locked?: boolean;
}[] = [
  { key: 'autoApprove', on: true },
  { key: 'latePayment', on: true },
  { key: 'autoSuspend', on: true },
  { key: 'nightlyBackup', on: true },
  { key: 'logSuperAdmin', on: true, locked: true },
];

/** How an invoice was settled. `method` names a string in `platform.method`. */
export const PAYMENT_METHODS = ['bank', 'payme', 'card'] as const;

/** The invoices the billing view opens on — one per restaurant, this month. */
export const INVOICES: readonly {
  id: string;
  tenant: Tenant;
  date: string;
  method: (typeof PAYMENT_METHODS)[number];
}[] = TENANTS.map((tenant, index) => ({
  id: `INV-2026-${812 + index}`,
  tenant,
  date: '01.08.2026',
  method: PAYMENT_METHODS[index % PAYMENT_METHODS.length]!,
}));

/** The four figures above the invoice table. */
export const BILLING_SUMMARY = {
  collectedTiyin: som(470_000_000),
  overdueTiyin: som(16_200_000),
  arpuTiyin: som(11_576_000),
  churn: '1.8%',
} as const;

/** 0 offline, 1 online, 2 needs an update. */
export type DeviceState = 0 | 1 | 2;

export type Device = {
  id: string;
  tenant: string;
  branch: string;
  kind: 'POS' | 'KDS';
  version: string;
  state: DeviceState;
  sync: string;
};

/**
 * Every terminal on the platform.
 *
 * A till that has not synced in two days is not a support ticket somebody will
 * file — the restaurant may not know. This table is how the platform notices.
 */
export const DEVICES: readonly Device[] = [
  {
    id: 'POS-114',
    tenant: 'Smart Restaurant',
    branch: 'Chilonzor',
    kind: 'POS',
    version: '4.2.1',
    state: 1,
    sync: '2 daqiqa oldin',
  },
  {
    id: 'KDS-07',
    tenant: 'Smart Restaurant',
    branch: 'Chilonzor',
    kind: 'KDS',
    version: '4.2.1',
    state: 1,
    sync: '1 daqiqa oldin',
  },
  {
    id: 'POS-118',
    tenant: 'Smart Restaurant',
    branch: 'Yunusobod',
    kind: 'POS',
    version: '4.2.1',
    state: 1,
    sync: '4 daqiqa oldin',
  },
  {
    id: 'POS-131',
    tenant: 'Smart Restaurant',
    branch: 'Termiz Markaz',
    kind: 'POS',
    version: '4.1.6',
    state: 2,
    sync: '22 daqiqa oldin',
  },
  {
    id: 'POS-204',
    tenant: 'Registon Palov',
    branch: 'Registon',
    kind: 'POS',
    version: '4.2.1',
    state: 1,
    sync: '1 daqiqa oldin',
  },
  {
    id: 'KDS-19',
    tenant: 'Registon Palov',
    branch: 'Sattepo',
    kind: 'KDS',
    version: '4.2.1',
    state: 0,
    sync: '3 soat oldin',
  },
  {
    id: 'POS-302',
    tenant: 'Choyxona 24',
    branch: 'Chorsu',
    kind: 'POS',
    version: '4.2.0',
    state: 1,
    sync: '6 daqiqa oldin',
  },
  {
    id: 'POS-309',
    tenant: 'Choyxona 24',
    branch: 'Bektemir',
    kind: 'POS',
    version: '4.0.9',
    state: 0,
    sync: '2 kun oldin',
  },
  {
    id: 'POS-410',
    tenant: 'Osh Markazi',
    branch: 'Registon',
    kind: 'POS',
    version: '4.2.1',
    state: 1,
    sync: '8 daqiqa oldin',
  },
  {
    id: 'KDS-11',
    tenant: 'Osh Markazi',
    branch: 'Siyob',
    kind: 'KDS',
    version: '4.1.6',
    state: 2,
    sync: '40 daqiqa oldin',
  },
  {
    id: 'POS-505',
    tenant: 'Lavash House',
    branch: 'Labi Hovuz',
    kind: 'POS',
    version: '4.2.1',
    state: 1,
    sync: '12 daqiqa oldin',
  },
  {
    id: 'POS-601',
    tenant: 'Anor Grill',
    branch: 'Sharq',
    kind: 'POS',
    version: '4.1.6',
    state: 0,
    sync: '4 kun oldin',
  },
];

export const DEVICE_LABEL: Record<DeviceState, { key: string; tone: string; dot: string }> = {
  0: { key: 'offline', tone: 'bg-danger-50 text-danger-700', dot: 'bg-danger-500' },
  1: { key: 'online', tone: 'bg-success-50 text-success-700', dot: 'bg-success-500' },
  2: { key: 'updateNeeded', tone: 'bg-warning-50 text-warning-700', dot: 'bg-warning-500' },
};

/** Who did what in this console, and when. Append-only by design. */
export const ACCESS_LOG: readonly { who: string; action: string; when: string; dot: string }[] = [
  {
    who: 'Otabek Normatov',
    action: 'Choyxona 24 ga kirdi',
    when: '10:42',
    dot: 'bg-warning-500',
  },
  {
    who: 'Dilnoza Qodirova',
    action: "Milliy Taomlar obunasini to'xtatdi",
    when: '09:58',
    dot: 'bg-danger-500',
  },
  {
    who: 'Javlon Ismoilov',
    action: "INV-2026-814 to'landi deb belgiladi",
    when: '09:31',
    dot: 'bg-success-500',
  },
  {
    who: 'Otabek Normatov',
    action: "Registon Palov tarifini Enterprise ga o'zgartirdi",
    when: 'Kecha 17:20',
    dot: 'bg-brand-500',
  },
];

/** The people who run the platform, as opposed to the people who use it. */
export const TEAM: readonly {
  name: string;
  role: string;
  email: string;
  seen: string;
  online: boolean;
}[] = [
  {
    name: 'Otabek Normatov',
    role: 'superAdmin',
    email: 'otabek@smartrest.uz',
    seen: 'Hozir onlayn',
    online: true,
  },
  {
    name: 'Dilnoza Qodirova',
    role: 'support',
    email: 'dilnoza@smartrest.uz',
    seen: '14 daqiqa oldin',
    online: true,
  },
  {
    name: 'Javlon Ismoilov',
    role: 'accounting',
    email: 'javlon@smartrest.uz',
    seen: '1 soat oldin',
    online: false,
  },
  {
    name: 'Aziz Rahimov',
    role: 'engineer',
    email: 'aziz@smartrest.uz',
    seen: 'Bugun 08:10',
    online: false,
  },
];

/** Trial conversion, the one figure that says whether the funnel works. */
export const TRIAL_SUMMARY = { endingThisWeek: 1, converted: '5 / 8' } as const;

/** Initials, the way every avatar on the platform derives them. */
export const initials = (name: string): string =>
  name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2);

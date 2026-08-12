/**
 * The eight roles, copied across from the design rather than invented here.
 *
 * `Smart Restaurant OS.dc.html` carries a `ROLES` array and a `MATRIX` of
 * twenty actions against those roles. Both are reproduced below at their own
 * values: the same ids, the same nav allowlists, the same permission ceilings.
 * A console that agrees with the prototype about what a waiter can see is a
 * console a reviewer can check against the prototype.
 *
 * Two things live here and two deliberately do not.
 *
 *   Here — ids, initials, surfaces, nav allowlists, permission grants. These
 *   are the same in every language and belong with the structure.
 *
 *   Not here — the role's name, who they are and what they cover. Those are
 *   prose, they run in uz / ru / en, and they live in `console.roles` in the
 *   message catalogue, keyed off the id below. The same split the shell already
 *   uses for branches and notifications.
 *
 * The person's name is the exception: `Aziza Rasulova` is a proper noun and
 * reads the same in all three catalogues, so holding it three times would only
 * be three chances to disagree.
 */

/** The eight, in the order the design lists them. */
export const ROLE_IDS = [
  'super',
  'owner',
  'manager',
  'accountant',
  'waiter',
  'cashier',
  'kitchen',
  'warehouse',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

/**
 * The five device surfaces, plus the platform operator's own.
 *
 * A surface is not a route — it is which client a terminal registers as. The
 * back office is the sidebar console; POS is the tablet; KDS is the wall
 * screen; the till is the countertop; the phone is the owner's morning check.
 */
export const SURFACE_IDS = ['backoffice', 'pos', 'kds', 'till', 'mobile', 'super'] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];

/**
 * Every module row the sidebar can draw, in sidebar order.
 *
 * Nineteen, matching the design's `NAV_ALL`. Two are spelled differently here
 * than in the prototype because the routes were named before this file existed
 * and renaming them would move every page: the prototype's `kds` is `kitchen`,
 * its `ops` is `stockOps`. Same rows, same order.
 */
export const MODULE_KEYS = [
  'dashboard',
  'orders',
  'tables',
  'kitchen',
  'menu',
  'inventory',
  'stockOps',
  'suppliers',
  'staff',
  'shifts',
  'crm',
  'finance',
  'till',
  'books',
  'control',
  'analytics',
  'reports',
  'branches',
  'settings',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * How far a role may go on one action.
 *
 * Three states rather than two because the middle one is the whole point of the
 * approval modal: a waiter voiding a fired line is neither allowed nor refused,
 * it is allowed *once a manager keys a PIN*. Collapsing that into a boolean is
 * what turns an audit trail into a shrug.
 */
export const DENIED = 0;
export const ALLOWED = 1;
export const NEEDS_APPROVAL = 2;

export type Grant = typeof DENIED | typeof ALLOWED | typeof NEEDS_APPROVAL;

/** The seven gates the design puts a role against. */
export type Permissions = {
  discount: Grant;
  void: Grant;
  refund: Grant;
  finance: Grant;
  closeShift: Grant;
  editMenu: Grant;
  roles: Grant;
};

export type Role = {
  id: RoleId;
  /** Two letters for the avatar. */
  initials: string;
  /** The demo holder. A proper noun — not translated. */
  person: string;
  /** Where this role lands when they sign in. */
  surface: SurfaceId;
  /**
   * Which sidebar rows this role sees, in order.
   *
   * Empty means no sidebar at all: the platform operator and the chef each get
   * a surface of their own rather than a filtered back office.
   *
   * This is presentation. The server decides what a request may touch —
   * see `apps/api/database/seeders/RolesAndPermissionsSeeder.php`. A hidden row
   * is a row not drawn, never a row that would have been refused.
   */
  nav: readonly ModuleKey[];
  /** The discount this role may apply unaided, as a percentage. */
  discountCeiling: number;
  perms: Permissions;
};

/** Every module, for the one role that holds all of them. */
const ALL_MODULES = MODULE_KEYS;

export const ROLES: Readonly<Record<RoleId, Role>> = {
  super: {
    id: 'super',
    initials: 'ON',
    person: 'Otabek Normatov',
    surface: 'super',
    nav: [],
    discountCeiling: 0,
    perms: {
      discount: DENIED,
      void: DENIED,
      refund: DENIED,
      finance: DENIED,
      closeShift: DENIED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },

  owner: {
    id: 'owner',
    initials: 'RK',
    person: 'Rustam Kamolov',
    surface: 'backoffice',
    nav: ALL_MODULES,
    discountCeiling: 100,
    perms: {
      discount: ALLOWED,
      void: ALLOWED,
      refund: ALLOWED,
      finance: ALLOWED,
      closeShift: ALLOWED,
      editMenu: ALLOWED,
      roles: ALLOWED,
    },
  },

  manager: {
    id: 'manager',
    initials: 'AR',
    person: 'Aziza Rasulova',
    surface: 'backoffice',
    // Everything the owner has except the three that are the owner's alone:
    // finance, the books, and the branch register.
    nav: [
      'dashboard',
      'orders',
      'tables',
      'kitchen',
      'menu',
      'inventory',
      'stockOps',
      'suppliers',
      'staff',
      'shifts',
      'crm',
      'till',
      'control',
      'analytics',
      'reports',
      'settings',
    ],
    discountCeiling: 20,
    perms: {
      discount: ALLOWED,
      void: ALLOWED,
      refund: ALLOWED,
      finance: DENIED,
      closeShift: ALLOWED,
      editMenu: ALLOWED,
      roles: DENIED,
    },
  },

  accountant: {
    id: 'accountant',
    initials: 'MY',
    person: "Malika Yo'ldosheva",
    surface: 'backoffice',
    // Money and the paperwork behind it. Never an order.
    nav: [
      'dashboard',
      'suppliers',
      'finance',
      'books',
      'control',
      'analytics',
      'reports',
      'branches',
      'settings',
    ],
    discountCeiling: 0,
    perms: {
      discount: DENIED,
      void: DENIED,
      refund: ALLOWED,
      finance: ALLOWED,
      closeShift: DENIED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },

  waiter: {
    id: 'waiter',
    initials: 'JT',
    person: 'Jasur Toshev',
    surface: 'backoffice',
    // Two rows. The waiter's real screen is the POS, which the shift dashboard
    // sends them to with a full-width button.
    nav: ['dashboard', 'tables'],
    discountCeiling: 5,
    perms: {
      discount: NEEDS_APPROVAL,
      void: NEEDS_APPROVAL,
      refund: DENIED,
      finance: DENIED,
      closeShift: DENIED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },

  cashier: {
    id: 'cashier',
    initials: 'DK',
    person: 'Dilshod Karimov',
    surface: 'backoffice',
    // The till is on this list where the prototype leaves it off. The design's
    // own module→role matrix gives the cashier full access to it, and their
    // dashboard ends in a button labelled "open the till" — a role whose home
    // screen sends them somewhere they are refused is a broken role.
    nav: ['dashboard', 'orders', 'till'],
    discountCeiling: 5,
    perms: {
      discount: NEEDS_APPROVAL,
      void: NEEDS_APPROVAL,
      refund: NEEDS_APPROVAL,
      finance: DENIED,
      closeShift: ALLOWED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },

  kitchen: {
    id: 'kitchen',
    initials: 'BA',
    person: 'Bekzod Alimov',
    surface: 'kds',
    /**
     * One row.
     *
     * The design draws the chef's screen with no sidebar at all — it is a wall
     * display, not a console. It gets a one-row sidebar here instead, because
     * the alternative was a second kitchen display living at its own route, and
     * two implementations of the board a kitchen runs on is a worse outcome
     * than a strip of chrome the chef ignores. The board itself is the
     * design's, full-bleed and dark, at /kitchen.
     */
    nav: ['kitchen'],
    discountCeiling: 0,
    perms: {
      discount: DENIED,
      void: DENIED,
      refund: DENIED,
      finance: DENIED,
      closeShift: DENIED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },

  warehouse: {
    id: 'warehouse',
    initials: 'SN',
    person: 'Sardor Nazarov',
    surface: 'backoffice',
    nav: ['dashboard', 'inventory', 'stockOps', 'suppliers', 'reports', 'settings'],
    discountCeiling: 0,
    perms: {
      discount: DENIED,
      void: DENIED,
      refund: DENIED,
      finance: DENIED,
      closeShift: DENIED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },
};

/** The eight in display order, for a switcher or the permission matrix. */
export const ROLE_LIST: readonly Role[] = ROLE_IDS.map((id) => ROLES[id]);

/** Whether a string off a cookie is one of ours. */
export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && (ROLE_IDS as readonly string[]).includes(value);
}

/** The role, or the owner if the caller handed us something else. */
export function roleOrDefault(value: unknown): Role {
  return isRoleId(value) ? ROLES[value] : ROLES.owner;
}

/**
 * What the server calls each of these.
 *
 * Two vocabularies for the same eight people: the design names the job — a
 * kitchen, a warehouse — and the platform names the post — a chef, a
 * storekeeper. Neither is wrong and neither should be renamed to match the
 * other, so the translation lives here, once.
 *
 * `apps/api/tests/Feature/DesignRoleMatrixTest.php` holds the same table in
 * PHP and asserts every entry exists on the server. A rename on either side
 * breaks a test rather than a screen.
 */
export const SERVER_ROLE_NAMES: Readonly<Record<RoleId, string>> = {
  super: 'super-admin',
  owner: 'owner',
  manager: 'branch-manager',
  accountant: 'accountant',
  waiter: 'waiter',
  cashier: 'cashier',
  kitchen: 'chef',
  warehouse: 'storekeeper',
};

/**
 * Which console a signed-in user gets, from the roles the API returned.
 *
 * `null` when they hold none of the eight. The platform runs fifteen roles — a
 * bartender, a host, a courier, a marketer — and those are real people with
 * real permissions who simply have no screen drawn for them yet. Sending a
 * bartender to the owner's dashboard because it is first in the list would be
 * worse than telling them there is nothing here for them.
 *
 * First match wins in the order the design lists them, so someone carrying two
 * roles lands on the more capable one.
 */
export function roleFromServer(names: readonly string[]): Role | null {
  const held = new Set(names);

  for (const id of ROLE_IDS) {
    if (held.has(SERVER_ROLE_NAMES[id])) return ROLES[id];
  }

  return null;
}

/** Whether this role's sidebar draws that row. Presentation only. */
export function canSee(role: Role, module: ModuleKey): boolean {
  return role.nav.includes(module);
}

/**
 * Where a role goes when it has no business on the screen it asked for.
 *
 * The chef gets the kitchen display, the platform operator the platform, and
 * anyone with a sidebar gets its first row — which is the dashboard for every
 * role that has one.
 */
export function landingPath(role: Role): string {
  if (role.surface === 'super') return '/platform';

  const first = role.nav[0];
  return first ? MODULE_PATHS[first] : '/dashboard';
}

/**
 * Which roles may open each full-bleed surface.
 *
 * The sidebar allowlist above cannot answer this: POS, the wall display and the
 * platform are not sidebar rows, and the roles that live on them — the chef,
 * the platform operator — have no sidebar at all.
 *
 * A manager holds every operational surface because a manager covers every
 * station on a bad night. The accountant holds none of them: their work is the
 * ledger the shift produces, never the shift.
 */
export const SURFACE_ACCESS: Readonly<Record<'pos' | 'mobile' | 'super', readonly RoleId[]>> = {
  pos: ['owner', 'manager', 'waiter', 'cashier'],
  // The morning check: read-only, and only for the roles whose morning it is.
  mobile: ['owner', 'manager', 'accountant'],
  super: ['super'],
};

/**
 * Sidebar row to route.
 *
 * Seven of the nineteen are views of a module rather than modules of their own,
 * which is why this map is not simply `/${key}`.
 */
export const MODULE_PATHS: Readonly<Record<ModuleKey, string>> = {
  dashboard: '/dashboard',
  orders: '/orders',
  tables: '/tables',
  kitchen: '/kitchen',
  menu: '/menu',
  inventory: '/inventory',
  stockOps: '/inventory/operations',
  suppliers: '/suppliers',
  staff: '/staff',
  shifts: '/staff/shifts',
  crm: '/crm',
  finance: '/finance',
  till: '/finance/till',
  books: '/finance/books',
  control: '/analytics/control',
  analytics: '/analytics',
  reports: '/analytics/reports',
  branches: '/settings/branches',
  settings: '/settings',
};

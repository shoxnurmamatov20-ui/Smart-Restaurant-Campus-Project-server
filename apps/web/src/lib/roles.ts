/**
 * The nine roles, copied across from the design rather than invented here.
 *
 * The handoff's `files/Smart Restaurant OS.dc.html` carries a `ROLES` array and
 * a `MATRIX` of twenty actions against those roles. Both are reproduced below
 * at their own values: the same ids, the same nav allowlists, the same
 * permission ceilings. A console that agrees with the prototype about what a
 * waiter can see is a console a reviewer can check against the prototype.
 *
 * **Not `docs/design/source/`.** That directory holds the v1.0 export, which
 * `GAPS.md` tells you in as many words to discard — its `NAV_ALL` lists
 * nineteen modules against the current twenty-four, and it has no `operator` at
 * all. This docstring used to name it, which is how half this console came to
 * be built from one design and half from another. The current file is 17 547
 * lines; if the copy you are reading is 6 507, you have the wrong one.
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

/** The nine, in the order the design's own `ROLES` array lists them. */
export const ROLE_IDS = [
  'super',
  'owner',
  'manager',
  'accountant',
  'waiter',
  'cashier',
  'kitchen',
  'warehouse',
  /*
   * Order intake, 12:00–00:00. The ninth, and the one this file was missing.
   *
   * Not a manager with fewer rows: an operator never touches a table, never
   * takes a payment and never closes a shift, but answers the phone, the
   * Telegram bot, the website and three aggregators, and is measured on how
   * fast they answer. Their home screen is the intake queue, not a dashboard.
   */
  'operator',
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
 * Twenty-four, read off `files/Smart Restaurant OS.dc.html` — its `NAV_ALL`
 * and, for the order, the rail's own DOM. This said nineteen and then
 * twenty-two, and each time claimed to match the design; each time the count
 * came from `specs/01-os.md §3`, which is a document, and the handoff's rule is
 * that where a document and a file disagree the file wins. The two the spec
 * omits are whole modules: `board`, the menu board a branch puts on a screen
 * above the counter, and `cases`, the complaints queue every channel feeds.
 *
 * Two are spelled differently here than in the prototype because the routes
 * were named before this file existed and renaming them would move every page:
 * the prototype's `kds` is `kitchen`, its `ops` is `stockOps`. Same rows, same
 * order.
 */
export const MODULE_KEYS = [
  'dashboard',
  'orders',
  'tables',
  /* Order intake — the five inbound channels in one queue. `§5.3`. */
  'calls',
  'kitchen',
  'menu',
  'inventory',
  'suppliers',
  'staff',
  'shifts',
  /* The menu board: what the screen above the counter shows. */
  'board',
  'crm',
  /* Campaigns, coupons, loyalty, segments. `§5.13`. */
  'marketing',
  /* The restaurant's own website, managed from the console. `§5.14`. */
  'web',
  'finance',
  'stockOps',
  'till',
  'books',
  'control',
  /* Complaints and refund decisions, from every channel at once. */
  'cases',
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
  /**
   * The row this role lands on, when it is not the first one they hold.
   *
   * Absent for eight of the nine, where the first row is the dashboard and the
   * dashboard is the right answer. The operator is the exception the design
   * spells out — `view: "calls"`, home surface `intake` — because their job is
   * a queue that is already ringing, and a summary of yesterday between them
   * and it costs a call.
   */
  home?: ModuleKey;
  /**
   * The discount this role may apply unaided, as a percentage.
   *
   * A different question from `perms.discount`, and both are needed. This one
   * is how far they get on their own; that one is what happens above the line —
   * DENIED means never, NEEDS_APPROVAL means a manager can key it through,
   * ALLOWED means there is no second gate. A waiter at 0 and an accountant at 0
   * are not the same role: one may ask and one may not, and only the grant says
   * which.
   *
   * The number is a copy. `Terminal.settings.discount_limits` on the server is
   * the source, and the till refuses whatever the till refuses; a chip drawn
   * here that the server declines reads to a cashier as a broken system rather
   * than as a rule. Change it and change it in four places at once — this file,
   * CLAUDE.md's table, `TerminalFactory`, `PosDatabaseSeeder`.
   */
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
    /*
     * Twenty-one, verbatim from the design file's `ROLES` array.
     *
     * Everything the owner has except the three that are the owner's alone:
     * finance, the books, and the branch register. This held sixteen, then
     * nineteen — each shortfall was a set of modules nobody had built, so the
     * count looked deliberate rather than behind.
     *
     * The order is the design's own, which puts `settings` second-to-last and
     * `board` after it. That reads as a mistake and is not one worth
     * correcting: `nav` is an allowlist, `NAV_GROUPS` decides where rows are
     * drawn, so the only thing this order affects is `landingPath`, and the
     * manager's landing is `dashboard` either way.
     */
    nav: [
      'dashboard',
      'orders',
      'calls',
      'tables',
      'kitchen',
      'menu',
      'inventory',
      'suppliers',
      'staff',
      'shifts',
      'crm',
      'marketing',
      'web',
      'till',
      'stockOps',
      'control',
      'cases',
      'analytics',
      'reports',
      'settings',
      'board',
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
    /*
     * Money and the paperwork behind it. Never an order.
     *
     * `cases` is on the list because a refund decision is theirs: the
     * complaints queue is where a refund is argued for, and the design gives
     * the accountant the refund grant below. A role that may refund but cannot
     * open the screen refunds are asked on is a role that gets asked by phone.
     */
    nav: [
      'dashboard',
      'suppliers',
      'finance',
      'books',
      'control',
      'cases',
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
    /*
     * Zero, where the prototype says five.
     *
     * The one number in this file that deliberately departs from the design
     * handoff. The prototype's settings screen offers a waiter "5% without
     * approval" and its matrix marks a 5% discount as allowed outright;
     * `docs/PLAN-POS-FIRST.md` §P9, which is what the till is actually being
     * built to, gives the waiter nothing and routes every discount through a
     * manager. P9 wins because it is the specification the server enforces, and
     * a console that drew a 5% chip the till then refused would teach a waiter
     * that the system is broken.
     *
     * Written here rather than silently changed so the next reader comparing
     * this file against the prototype finds the reason instead of a bug.
     */
    discountCeiling: 0,
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
    /*
     * Six, where the design file gives five.
     *
     * `stockOps` is the addition and it is deliberate. Stock operations is
     * receiving, counting, waste and transfers — the storekeeper's entire day —
     * and the design leaves it off their rail while giving it to the manager.
     * That is the design's bug, not a rule: a storekeeper who cannot reach the
     * count screen books the count through somebody else's login, and then the
     * variance is signed by the wrong name.
     */
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

  operator: {
    id: 'operator',
    initials: 'DR',
    person: 'Dilnoza Rahimova',
    surface: 'backoffice',
    /*
     * Seven rows, and `calls` is the job.
     *
     * The order-intake desk: phone, Telegram, the website and three
     * aggregators arriving in one queue. They price an order (`menu`), they
     * know who is calling (`crm`), and they take the complaint when the
     * courier was late (`cases`) — but they never open a table, never take a
     * payment and never close a shift, which is why `tables`, `till` and
     * `finance` are absent rather than merely unbuilt.
     */
    nav: ['dashboard', 'calls', 'orders', 'menu', 'crm', 'cases', 'settings'],
    home: 'calls',
    /*
     * Five, and it is the only ceiling on this list that is not also a POS
     * ceiling. An operator settles a late delivery with a small discount while
     * the customer is still on the line; sending that through a manager is how
     * a two-minute call becomes a refund.
     */
    discountCeiling: 5,
    perms: {
      discount: ALLOWED,
      void: DENIED,
      refund: DENIED,
      finance: DENIED,
      closeShift: DENIED,
      editMenu: DENIED,
      roles: DENIED,
    },
  },
};

/** The nine in display order, for a switcher or the permission matrix. */
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
 * Two vocabularies for the same nine people: the design names the job — a
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
  /*
   * `order-operator`, not `host`. A host seats people who walked in; an
   * operator answers people who did not. The two were nearly merged here
   * because the platform already had a `host` role and the design did not name
   * a server counterpart — merging them would have handed the intake queue to
   * whoever stands at the door.
   */
  operator: 'order-operator',
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

  if (role.home) return MODULE_PATHS[role.home];

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
export const SURFACE_ACCESS: Readonly<
  Record<'pos' | 'mobile' | 'super' | 'crew' | 'setup' | 'documents', readonly RoleId[]>
> = {
  pos: ['owner', 'manager', 'waiter', 'cashier'],
  // The morning check: read-mostly, plus the approvals a manager grants from
  // wherever they are. Only the roles whose morning it is.
  mobile: ['owner', 'manager', 'accountant'],
  super: ['super'],
  /*
   * The staff app: an employee's own shifts, tables, calls and payslip.
   *
   * Not the same audience as `/staff`, which is the console section managers use
   * ABOUT employees. This is the one people open on their own phones, so the list
   * is everyone who works a floor — and deliberately not the accountant, who has
   * no shift to look at.
   */
  crew: ['owner', 'manager', 'waiter', 'cashier', 'kitchen', 'warehouse'],
  /*
   * The setup wizard, owner only.
   *
   * It creates the restaurant, its branches, its menu and its first shift — every
   * decision the whole tenant then rests on. A manager who could re-run it could
   * lay a second floor plan over a working one.
   */
  setup: ['owner'],
  /*
   * The printable documents.
   *
   * The union of `DOCUMENT_ACCESS`, which is the finer cut — this list only
   * decides who reaches the surface, and the page then shows each reader their
   * own documents. Waiter, chef, operator and the platform operator hold none
   * of the seven, so they are not here.
   *
   * The surface was unguarded when it was built: `middleware.ts` reads this map
   * and `isAllowed()` returns null for a path in neither map, which is a pass.
   * A restaurant's turnover, a supplier's prices and a named employee's pay sat
   * on a route anyone could open.
   */
  documents: ['owner', 'manager', 'accountant', 'cashier', 'warehouse'],
};

/**
 * Where each of those surfaces lives.
 *
 * Separate from SURFACE_ACCESS because the key and the path disagree exactly
 * once — `super` is served at `/platform` — and that single mismatch is the
 * reason this cannot be `/${key}`.
 *
 * Two callers need it and they need different halves: middleware pairs each
 * path with its role list to decide who may enter, while app/robots.ts needs
 * only the paths, to keep a crawler out of screens that answer 200 to anyone.
 * Written once so a surface added later cannot appear in one and not the other.
 */
export const SURFACE_PATHS: Readonly<
  Record<'pos' | 'mobile' | 'super' | 'crew' | 'setup' | 'documents', string>
> = {
  pos: '/pos',
  mobile: '/mobile',
  super: '/platform',
  // `/crew`, not `/staff`: that path is already the console's HR section, and the
  // two are different products for different people.
  crew: '/crew',
  setup: '/setup',
  documents: '/documents',
};

/**
 * Sidebar row to route.
 *
 * Eight of the twenty-four are views of a module rather than modules of their
 * own, which is why this map is not simply `/${key}`.
 */
export const MODULE_PATHS: Readonly<Record<ModuleKey, string>> = {
  dashboard: '/dashboard',
  orders: '/orders',
  calls: '/calls',
  tables: '/tables',
  kitchen: '/kitchen',
  menu: '/menu',
  inventory: '/inventory',
  stockOps: '/inventory/operations',
  suppliers: '/suppliers',
  staff: '/staff',
  shifts: '/staff/shifts',
  board: '/board',
  crm: '/crm',
  marketing: '/marketing',
  web: '/web',
  finance: '/finance',
  till: '/finance/till',
  books: '/finance/books',
  control: '/analytics/control',
  cases: '/crm/cases',
  analytics: '/analytics',
  reports: '/analytics/reports',
  branches: '/settings/branches',
  settings: '/settings',
};

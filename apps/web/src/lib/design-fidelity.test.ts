import { describe, expect, it } from 'vitest';

import { NAV_FOOTER, NAV_GROUPS } from '@/app/(dashboard)/nav';
import { MODULE_KEYS, ROLE_IDS, ROLES, type ModuleKey } from '@/lib/roles';

/**
 * The console against the design file, in the design file's own vocabulary.
 *
 * Written after the sidebar drifted twice in one week and in opposite
 * directions — once by being behind the design, once by being "corrected"
 * towards `specs/01-os.md §3`, which lists twenty-two rows where
 * `files/Smart Restaurant OS.dc.html` draws twenty-four. The handoff README
 * settles it: "Where a document and a file disagree, the file wins and the
 * document is a bug."
 *
 * So the arrays below are transcribed from the file's own `NAV_ALL` and `ROLES`
 * rather than from any prose about them, and they are written in the file's
 * names (`kds`, `ops`) with the translation to this codebase's names kept in
 * one place. A rename on either side fails here rather than quietly producing a
 * console that is no longer its own design.
 */

/** The design's key → this codebase's. Two rows were named before this file. */
const AS_BUILT: Readonly<Record<string, ModuleKey>> = {
  board: 'board',
  dashboard: 'dashboard',
  orders: 'orders',
  calls: 'calls',
  tables: 'tables',
  kds: 'kitchen',
  menu: 'menu',
  inventory: 'inventory',
  ops: 'stockOps',
  suppliers: 'suppliers',
  staff: 'staff',
  shifts: 'shifts',
  crm: 'crm',
  marketing: 'marketing',
  web: 'web',
  finance: 'finance',
  till: 'till',
  books: 'books',
  control: 'control',
  cases: 'cases',
  analytics: 'analytics',
  reports: 'reports',
  branches: 'branches',
  settings: 'settings',
};

/** Verbatim from the design file, line 10343. */
const NAV_ALL = [
  'board',
  'dashboard',
  'orders',
  'calls',
  'tables',
  'kds',
  'menu',
  'inventory',
  'ops',
  'suppliers',
  'staff',
  'shifts',
  'crm',
  'marketing',
  'web',
  'finance',
  'till',
  'books',
  'control',
  'cases',
  'analytics',
  'reports',
  'branches',
  'settings',
];

/** Verbatim from the design file's `ROLES` array. The owner holds `NAV_ALL`. */
const DESIGN_NAV: Readonly<Record<string, readonly string[]>> = {
  super: [],
  owner: NAV_ALL,
  manager: [
    'dashboard',
    'orders',
    'calls',
    'tables',
    'kds',
    'menu',
    'inventory',
    'suppliers',
    'staff',
    'shifts',
    'crm',
    'marketing',
    'web',
    'till',
    'ops',
    'control',
    'cases',
    'analytics',
    'reports',
    'settings',
    'board',
  ],
  accountant: [
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
  waiter: ['dashboard', 'tables'],
  cashier: ['dashboard', 'orders'],
  kitchen: [],
  warehouse: ['dashboard', 'inventory', 'suppliers', 'reports', 'settings'],
  operator: ['dashboard', 'calls', 'orders', 'menu', 'crm', 'cases', 'settings'],
};

/**
 * Where this console knowingly departs, and why.
 *
 * Each entry is a decision with a comment in `roles.ts` beside it. Listing them
 * here is what keeps a departure a departure rather than a drift: a row that
 * appears or vanishes without a line in this table fails the test.
 */
const DELIBERATE: Readonly<Record<string, { extra?: readonly ModuleKey[]; why: string }>> = {
  cashier: {
    extra: ['till'],
    why: "the cashier's own dashboard ends in a button onto the till",
  },
  kitchen: {
    extra: ['kitchen'],
    why: 'one row rather than a second kitchen display at its own route',
  },
  warehouse: {
    extra: ['stockOps'],
    why: "stock operations is the storekeeper's whole day and the design omits it",
  },
};

describe('the console against the design file', () => {
  it('draws every module the design names, and no other', () => {
    expect(new Set(MODULE_KEYS)).toEqual(new Set(NAV_ALL.map((key) => AS_BUILT[key])));
    expect(MODULE_KEYS.length).toBe(24);
  });

  it('gives every role the rows the design gives it', () => {
    for (const id of ROLE_IDS) {
      const design = new Set((DESIGN_NAV[id] ?? []).map((key) => AS_BUILT[key]!));

      for (const extra of DELIBERATE[id]?.extra ?? []) design.add(extra);

      expect(new Set(ROLES[id].nav), `${id}'s allowlist has drifted from the design`).toEqual(
        design,
      );
    }
  });

  it('lands the operator on the queue, not on a dashboard', () => {
    // `view: "calls"` in the design file. Their job is already ringing.
    expect(ROLES.operator.home).toBe('calls');

    for (const id of ROLE_IDS) {
      if (id === 'operator') continue;
      expect(ROLES[id].home, `${id} should land on its first row`).toBeUndefined();
    }
  });

  it('draws the four sections the design draws, in its order', () => {
    expect(NAV_GROUPS.map((group) => group.key)).toEqual([
      'sectionOps',
      'sectionCatalogue',
      'sectionPeople',
      'sectionMoney',
    ]);

    // Section membership, read off the rail's own DOM order in the design file.
    expect(NAV_GROUPS.map((group) => group.items.map((item) => item.key))).toEqual([
      ['dashboard', 'orders', 'tables', 'calls', 'kitchen'],
      ['menu', 'inventory', 'suppliers'],
      ['staff', 'shifts', 'board', 'crm', 'marketing', 'web'],
      [
        'finance',
        'stockOps',
        'till',
        'books',
        'control',
        'cases',
        'analytics',
        'reports',
        'branches',
      ],
    ]);

    // Settings sits below the rule, beside the collapse control — not in a section.
    expect(NAV_FOOTER.key).toBe('settings');
    expect(NAV_GROUPS.flatMap((group) => group.items).map((item) => item.key)).not.toContain(
      'settings',
    );
  });

  it('holds nine roles, the ninth being the intake desk', () => {
    expect(ROLE_IDS.length).toBe(9);
    expect(ROLE_IDS).toContain('operator');
    expect(ROLES.operator.initials).toBe('DR');
  });
});

import { describe, expect, it } from 'vitest';

import {
  ALERTS_COPY,
  APPROVALS_COPY,
  BRANCHES_COPY,
  CALLS_COPY,
  LINE_STATE,
  LOCK,
  MENU_COPY,
  MORE_COPY,
  OFFLINE,
  PENDING,
  PIN,
  SHARED,
  TABLE_STATE,
  TABLES_COPY,
  TODAY as TODAY_COPY,
} from '@restaurant/surfaces/crew/copy';
import {
  ALERTS,
  APPROVALS,
  attainment,
  badgeCount,
  BRANCHES,
  CALLS,
  CREW_ROLES,
  crewSurfaceFor,
  DOCK,
  LOCK_PUSHES,
  isCrewRole,
  MENU_ROWS,
  MORE,
  MY_TABLES,
  TABLE_LINES,
  TODAY,
  WAITER_SHIFT,
  type CrewRole,
  type Trilingual,
} from '@restaurant/surfaces/crew/data';

/**
 * Guards for the three rules this surface is most likely to break quietly.
 *
 * `src/i18n/i18n.test.ts` checks the console's catalogue and cannot see this
 * one — the staff app's copy lives in its own group until it is merged there.
 * So the same checks run here, against the same rules, and the merge is a move
 * rather than a discovery.
 */

const SECTIONS = {
  SHARED,
  TABLE_STATE,
  LINE_STATE,
  PIN,
  LOCK,
  TODAY_COPY,
  BRANCHES_COPY,
  APPROVALS_COPY,
  ALERTS_COPY,
  TABLES_COPY,
  CALLS_COPY,
  MENU_COPY,
  MORE_COPY,
  PENDING,
  OFFLINE,
} as const;

describe('crew copy catalogue', () => {
  it('carries all three languages on every key', () => {
    for (const [name, section] of Object.entries(SECTIONS)) {
      for (const [key, value] of Object.entries(section as Record<string, Trilingual>)) {
        for (const lang of ['uz', 'ru', 'en'] as const) {
          expect(value[lang]?.trim(), `${name}.${key}.${lang} is empty`).toBeTruthy();
        }
      }
    }
  });

  it('holds no key whose three languages are identical', () => {
    /*
     * The rule `i18n.test.ts` enforces on the console catalogue, applied here
     * before this one is merged into it. A row that reads the same in all three
     * is data wearing a copy key — a brand name, a currency word, a PLU code —
     * and it will be edited in the wrong place by whoever finds it first.
     */
    for (const [name, section] of Object.entries(SECTIONS)) {
      for (const [key, value] of Object.entries(section as Record<string, Trilingual>)) {
        expect(
          value.uz === value.ru && value.ru === value.en,
          `${name}.${key} reads the same in all three languages — it is data, not copy`,
        ).toBe(false);
      }
    }
  });
});

describe('which workspace a person gets', () => {
  it('maps the four server roles that have a screen here', () => {
    expect(crewSurfaceFor(['owner'])).toBe('owner');
    expect(crewSurfaceFor(['branch-manager'])).toBe('manager');
    expect(crewSurfaceFor(['storekeeper'])).toBe('storekeeper');
    expect(crewSurfaceFor(['waiter'])).toBe('waiter');
    expect(crewSurfaceFor(['courier'])).toBe('courier');
  });

  it('answers null for a role whose surface is somewhere else', () => {
    /*
     * Null is the honest answer, not a fallback. A cashier's workspace is the
     * till and a cook's is the kitchen display; dropping either onto a waiter's
     * screen would show them somebody else's tables. The sign-in panel says so
     * rather than guessing — `roles.ts` makes the same call for the console.
     */
    expect(crewSurfaceFor(['cashier'])).toBeNull();
    expect(crewSurfaceFor(['chef'])).toBeNull();
    expect(crewSurfaceFor(['accountant'])).toBeNull();
    expect(crewSurfaceFor([])).toBeNull();
  });

  it('takes the first role that has one when somebody holds several', () => {
    // An owner who is also on the waiting rota gets the owner's screen: the
    // roles arrive in the server's own order and the first match wins, so the
    // broader workspace is never hidden behind a narrower one.
    expect(crewSurfaceFor(['owner', 'waiter'])).toBe('owner');
    expect(crewSurfaceFor(['cashier', 'waiter'])).toBe('waiter');
  });

  it('only ever names a role this app has screens for', () => {
    for (const server of ['owner', 'branch-manager', 'storekeeper', 'waiter', 'courier']) {
      const surface = crewSurfaceFor([server]);

      expect(surface).not.toBeNull();
      expect(isCrewRole(surface as string)).toBe(true);
    }
  });
});

describe('crew money', () => {
  /**
   * Every figure this app renders is an integer in tiyin.
   *
   * A fraction here would mean somebody wrote so'm into a tiyin field, and the
   * screen would show a hundredth of the truth to a waiter reading a bill out
   * loud. Cheap to check, and the failure is otherwise invisible until a guest
   * queries it.
   */
  const amounts: [string, number][] = [
    ['owner revenue', TODAY.owner.revenue],
    ['manager revenue', TODAY.manager.revenue],
    ['waiter shift sales', WAITER_SHIFT.sales],
    ...TODAY.owner.list.map((row): [string, number] => [`owner list ${row.name}`, row.revenue]),
    ...TODAY.manager.list.map((row): [string, number] => [`manager list ${row.name}`, row.revenue]),
    ...BRANCHES.flatMap((branch): [string, number][] => [
      [`${branch.id} revenue`, branch.revenue],
      [`${branch.id} target`, branch.target],
    ]),
    ...MY_TABLES.map((table): [string, number] => [`table ${table.number}`, table.total]),
    ...Object.entries(TABLE_LINES).flatMap(([id, lines]) =>
      lines.map((line, index): [string, number] => [`${id} line ${index}`, line.price]),
    ),
    ...MENU_ROWS.map((dish): [string, number] => [`dish ${dish.id}`, dish.price]),
  ];

  it.each(amounts)('%s is a whole number of tiyin', (_name, value) => {
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('never rounds a table total away from its lines', () => {
    for (const [id, lines] of Object.entries(TABLE_LINES)) {
      const summed = lines.reduce((total, line) => total + line.price * line.quantity, 0);
      expect(Number.isInteger(summed), `${id} sums to a fraction`).toBe(true);
    }
  });
});

describe('crew dock', () => {
  it.each(CREW_ROLES)('%s has exactly four slots, the last of them More', (role) => {
    const tabs = DOCK[role];

    expect(tabs).toHaveLength(4);
    expect(tabs[3]?.slug).toBe('more');
  });

  it.each(CREW_ROLES)('%s has no duplicate slug', (role) => {
    const slugs = DOCK[role].map((tab) => tab.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('counts a badge from the same list the screen renders', () => {
    // A dock that says three where the list shows two is the kind of small lie
    // that teaches people to stop opening the tab.
    expect(badgeCount('manager', 'approvals')).toBe(APPROVALS.length);
    expect(badgeCount('waiter', 'calls')).toBe(CALLS.length);
    expect(badgeCount('owner', 'alerts')).toBe(ALERTS.length);
    expect(badgeCount('courier', 'alerts')).toBe(0);
  });

  it('gives every role a lock row and a way out under More', () => {
    for (const role of CREW_ROLES) {
      const ids = MORE[role].map((row) => row.id);

      expect(ids, `${role} cannot lock the phone`).toContain('lock');
      // The design's own third tail row — `SWITCHITEM`. It was called
      // `sign-out` here, which named the mechanism rather than the act.
      expect(ids, `${role} cannot hand the phone over`).toContain('switch');
    }
  });

  it('never leaves a More row linking nowhere', () => {
    // A menu of dead links is worse than a short menu: one broken row costs the
    // reader their trust in the rows that do work.
    for (const role of CREW_ROLES) {
      for (const row of MORE[role]) {
        if (row.built) expect(row.href, `${role}/${row.id}`).toBeTruthy();
      }
    }
  });
});

describe('crew lock screen', () => {
  it.each(CREW_ROLES)('%s has notifications of its own', (role) => {
    expect(LOCK_PUSHES[role].length).toBeGreaterThan(0);
  });

  it('only ever offers an action on a tab that role actually has', () => {
    /*
     * A push whose button lands on a tab the role does not hold is a dead end
     * arrived at from a lock screen — the one place where a person is already
     * half-committed to acting.
     */
    for (const role of CREW_ROLES as readonly CrewRole[]) {
      const slugs = DOCK[role].map((tab) => tab.slug);

      for (const push of LOCK_PUSHES[role]) {
        for (const action of push.actions ?? []) {
          expect(slugs, `${role}/${push.id} points at "${action.tab}"`).toContain(action.tab);
        }
      }
    }
  });
});

describe('branch attainment', () => {
  it('is the day against its own target, not against the biggest branch', () => {
    const chilonzor = BRANCHES.find((branch) => branch.id === 'chilonzor');
    const termiz = BRANCHES.find((branch) => branch.id === 'termiz');

    expect(chilonzor && attainment(chilonzor)).toBe(92);

    // The smallest branch is the one over plan, which is the whole point of
    // measuring each against its own target rather than against each other.
    expect(termiz && attainment(termiz)).toBe(105);
  });
});

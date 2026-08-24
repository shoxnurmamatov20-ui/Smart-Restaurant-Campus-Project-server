import { describe, expect, it } from 'vitest';

import { crewNeedsPin } from '@/middleware';

import { CREW_ROLES, crewRoleRedirect, MORE } from '@restaurant/surfaces/crew/data';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import {
  MORE_BOOKINGS,
  MORE_BRANCHES,
  MORE_CASH_FLOW,
  MORE_CLOSING,
  MORE_END_SHIFT,
  MORE_EXPIRY,
  MORE_PEOPLE,
  MORE_PNL,
  MORE_PURCHASE,
  MORE_RISK,
  MORE_ROTA,
  MORE_SHIFT_KPIS,
  MORE_STATIONS,
  MORE_SWAP_PEOPLE,
  MORE_SWAP_SHIFTS,
  MORE_WASTE_ITEMS,
} from '@restaurant/surfaces/crew/more-data';

/**
 * The staff app's More menu, against `Smart Restaurant Xodimlar ilovasi.dc.html`.
 *
 * The defect this exists to stop is specific and it had already happened:
 * seventeen rows in the menu, every one of them `built: false`, so five roles
 * could read a list of screens and open none of them. A row and a screen are in
 * two files, and the only thing that keeps them in step is a check.
 */
const ROLES = CREW_ROLES;
const LANGS = ['uz', 'ru', 'en'] as const;

describe('every row in the More menu goes somewhere', () => {
  it('leaves nothing unbuilt except the three desktop rows', () => {
    const stranded = ROLES.flatMap((role) =>
      MORE[role].filter((row) => !row.built && row.desktopOnly !== true).map((row) => row.id),
    );

    expect(stranded).toEqual([]);
  });

  it('gives every built row an href', () => {
    // `built: true` with no href renders as a `div` in `more.tsx` — a row that
    // says it works and does not.
    for (const role of ROLES) {
      for (const row of MORE[role]) {
        if (row.built) expect(row.href, `${role}/${row.id}`).toBeTruthy();
      }
    }
  });

  it('says "on desktop" only where it means it', () => {
    // The three desktop rows are a different statement from "not built yet",
    // and conflating them is how a real gap gets filed as a decision.
    const desktop = ROLES.flatMap((role) =>
      MORE[role].filter((row) => row.desktopOnly === true).map((row) => row.id),
    );

    expect(desktop).toEqual(['desktop', 'desktop', 'desktop']);
  });
});

describe('the copy and the structure stay parallel', () => {
  it('has the same number of rows in every language', () => {
    for (const lang of LANGS) {
      const t = moreCopy(lang);

      expect(t.pnl).toHaveLength(MORE_PNL.length);
      expect(t.cashFlow).toHaveLength(MORE_CASH_FLOW.length);
      expect(t.people).toHaveLength(MORE_PEOPLE.length);
      expect(t.risk).toHaveLength(MORE_RISK.length);
      expect(t.closing).toHaveLength(MORE_CLOSING.length);
      expect(t.rota).toHaveLength(MORE_ROTA.length);
      expect(t.stations).toHaveLength(MORE_STATIONS.length);
      expect(t.wasteItems).toHaveLength(MORE_WASTE_ITEMS.length);
      expect(t.expiry).toHaveLength(MORE_EXPIRY.length);
      expect(t.purchase).toHaveLength(MORE_PURCHASE.length);
      expect(t.swapShifts).toHaveLength(MORE_SWAP_SHIFTS.length);
      expect(t.swapPeople).toHaveLength(MORE_SWAP_PEOPLE.length);
      expect(t.branches).toHaveLength(MORE_BRANCHES.length);
      expect(t.bookings).toHaveLength(MORE_BOOKINGS.length);
      expect(t.endShift).toHaveLength(MORE_END_SHIFT.length);
      expect(t.shift.kpis).toHaveLength(MORE_SHIFT_KPIS.length);
    }
  });

  it('prices waste and reordering in tiyin', () => {
    // 1 so'm = 100 tiyin, everywhere. A unit price entered in so'm would make
    // every waste total wrong by a factor of a hundred — in the restaurant's
    // favour, which is the direction nobody checks.
    for (const item of [...MORE_WASTE_ITEMS, ...MORE_PURCHASE]) {
      expect(item.unitTiyin % 100).toBe(0);
      expect(item.unitTiyin).toBeGreaterThan(1000);
    }
  });

  it('leaves nothing blank in any language', () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value.trim(), path).not.toBe('');

        return;
      }

      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));

        return;
      }

      if (value !== null && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };

    for (const lang of LANGS) {
      const t = moreCopy(lang);

      // `bookings[].note` is empty by design on the two that carry no note.
      walk({ ...t, bookings: t.bookings.map((b) => ({ ...b, note: b.note || '—' })) }, lang);
    }
  });
});

describe('a shift screen is not a public screen', () => {
  it('sends an unauthenticated visitor back to the PIN pad', () => {
    // `/crew` is exempt from the console session guard because its first screen
    // IS the sign-in. That exemption used to cover the whole subtree, so
    // `/crew/owner/branches` — named branches, named staff — rendered for
    // anybody who typed it.
    expect(crewNeedsPin('/crew/owner')).toBe(true);
    expect(crewNeedsPin('/crew/owner/branches')).toBe(true);
    expect(crewNeedsPin('/crew/manager/more/closing')).toBe(true);
  });

  it('keeps the door itself open', () => {
    // A guard that caught these would make the app unopenable: there is no
    // console account behind a PIN pad to redirect anybody to.
    expect(crewNeedsPin('/crew')).toBe(false);
    expect(crewNeedsPin('/crew/lock/waiter')).toBe(false);
    expect(crewNeedsPin('/crew/enrol')).toBe(false);
    expect(crewNeedsPin('/crew/session')).toBe(false);
  });

  it('leaves every other surface to its own guard', () => {
    expect(crewNeedsPin('/dashboard')).toBe(false);
    expect(crewNeedsPin('/pos')).toBe(false);
  });
});

describe('the role in the path is the role the PIN opened', () => {
  /*
   * The defect this closes was live: `/crew/<role>/…` addresses a screen and
   * nothing compared the segment to the session, so any signed-in waiter could
   * type `/crew/owner/branches` and read five branches' revenue, margin and
   * headcount. The design is unambiguous that the PIN decides the role
   * (`dc.html:1188`, spec 03 §7); `crew/[role]/layout.tsx` had the check
   * written down as owed and now `middleware.ts` makes it.
   */
  it("sends a waiter who asks for the owner's screens back to their own", () => {
    expect(crewRoleRedirect('/crew/owner/branches', 'waiter')).toBe('/crew/waiter');
    expect(crewRoleRedirect('/crew/manager/more/closing', 'courier')).toBe('/crew/courier');
    expect(crewRoleRedirect('/crew/owner', 'storekeeper')).toBe('/crew/storekeeper');
  });

  it('lets everybody through their own workspace', () => {
    for (const role of CREW_ROLES) {
      expect(crewRoleRedirect(`/crew/${role}`, role), role).toBeNull();
      expect(crewRoleRedirect(`/crew/${role}/more`, role), role).toBeNull();
    }
  });

  it("guards the lock screen too, because its notifications are one person's", () => {
    // An owner's lock screen says today's takings across every branch.
    expect(crewRoleRedirect('/crew/lock/owner', 'waiter')).toBe('/crew/waiter');
    expect(crewRoleRedirect('/crew/lock/waiter', 'waiter')).toBeNull();
  });

  it('keeps a locked handset with no session readable, and a workspace not', () => {
    // A phone left on a pass with the app locked is a real state and has to
    // keep rendering. A deep link into a workspace with nothing to check
    // against goes back to the keypad, which writes both cookies.
    expect(crewRoleRedirect('/crew/lock/waiter', undefined)).toBeNull();
    expect(crewRoleRedirect('/crew/waiter/tables', undefined)).toBe('/crew');
  });

  it('leaves paths that name no role to their own route', () => {
    // A typo must 404 rather than bounce silently into somebody's dashboard,
    // and the two handlers under `/crew` are not workspaces.
    expect(crewRoleRedirect('/crew/nonsense/tables', 'waiter')).toBeNull();
    expect(crewRoleRedirect('/crew/enrol', 'waiter')).toBeNull();
    expect(crewRoleRedirect('/crew/session', 'waiter')).toBeNull();
    expect(crewRoleRedirect('/crew', 'waiter')).toBeNull();
    expect(crewRoleRedirect('/dashboard', 'waiter')).toBeNull();
  });

  it('refuses a cookie that is not a role this app has', () => {
    // The cookie is the browser's, so it is treated as untrusted input: a
    // forged value must not open a workspace, and the honest answer is the
    // keypad rather than a guess.
    expect(crewRoleRedirect('/crew/owner/branches', 'cashier')).toBe('/crew');
    expect(crewRoleRedirect('/crew/owner/branches', '../../etc')).toBe('/crew');
  });
});

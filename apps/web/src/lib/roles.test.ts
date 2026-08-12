import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, navGroupsFor } from '@/app/(dashboard)/nav';
import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';
import { uz } from '@/i18n/uz';

import {
  ALLOWED,
  canSee,
  isRoleId,
  landingPath,
  MODULE_KEYS,
  MODULE_PATHS,
  ROLE_IDS,
  ROLE_LIST,
  ROLES,
  roleFromServer,
  roleOrDefault,
  SERVER_ROLE_NAMES,
  SURFACE_ACCESS,
  type ModuleKey,
} from './roles';

/**
 * The eight roles have to hold together.
 *
 * Most of what can go wrong here is not a type error. A role can point at a row
 * that has no route, land on a screen it is itself refused, or lose its label
 * in one of three languages — and every one of those ships silently and shows
 * up as a waiter staring at a redirect loop mid-shift.
 *
 * These are the checks the compiler cannot make.
 */
describe('the eight roles', () => {
  it('gives every module key a route the sidebar actually links to', () => {
    const linked = new Set(NAV_ITEMS.map((item) => item.href));

    for (const key of MODULE_KEYS) {
      const path = MODULE_PATHS[key];
      expect(path, `${key} has no path`).toBeTruthy();
      expect(linked, `${key} maps to ${path}, which no nav row points at`).toContain(path);
    }
  });

  it('lists only real module keys in every role allowlist', () => {
    const known = new Set<string>(MODULE_KEYS);

    for (const role of ROLE_LIST) {
      for (const key of role.nav) {
        expect(known, `${role.id} allows ${key}, which is not a module`).toContain(key);
      }
    }
  });

  it('never lands a role somewhere it would be turned away from', () => {
    // The redirect in middleware.ts sends a refused request to `landingPath`.
    // If that destination is itself refused the two bounce forever, so this is
    // the check that keeps the guard from becoming a trap.
    for (const role of ROLE_LIST) {
      const home = landingPath(role);

      if (role.surface === 'super') {
        expect(home).toBe('/platform');
        expect(SURFACE_ACCESS.super, 'the platform operator cannot open the platform').toContain(
          role.id,
        );
        continue;
      }

      const landsOn = MODULE_KEYS.find((key) => MODULE_PATHS[key] === home);
      expect(landsOn, `${role.id} lands on ${home}, which is not a module route`).toBeTruthy();
      expect(canSee(role, landsOn as ModuleKey), `${role.id} lands on a row it cannot see`).toBe(
        true,
      );
    }
  });

  it('draws no empty sidebar section', () => {
    // An overline with nothing under it reads as a screen that failed to load.
    for (const role of ROLE_LIST) {
      if (role.nav.length === 0) continue;

      const groups = navGroupsFor(role);

      expect(groups.length, `${role.id} gets no sidebar at all`).toBeGreaterThan(0);

      for (const group of groups) {
        expect(group.items.length, `${role.id} gets an empty ${group.key} section`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it('shows a role every row it holds and no other', () => {
    for (const role of ROLE_LIST) {
      const drawn = navGroupsFor(role).flatMap((group) => group.items.map((item) => item.key));

      expect(new Set(drawn), `${role.id}'s sidebar does not match its allowlist`).toEqual(
        new Set(role.nav),
      );
    }
  });

  it('gives the owner every module and no one else', () => {
    expect(new Set(ROLES.owner.nav)).toEqual(new Set(MODULE_KEYS));

    for (const role of ROLE_LIST) {
      if (role.id === 'owner') continue;
      expect(role.nav.length, `${role.id} holds every module`).toBeLessThan(MODULE_KEYS.length);
    }
  });

  it('lets only the owner change roles and permissions', () => {
    // The one permission that can grant every other one. If a second role holds
    // it, the whole matrix below it is decoration.
    const canGrant = ROLE_LIST.filter((role) => role.perms.roles === ALLOWED);

    expect(canGrant.map((role) => role.id)).toEqual(['owner']);
  });

  it('keeps a discount ceiling consistent with the discount grant', () => {
    for (const role of ROLE_LIST) {
      if (role.perms.discount === 0) {
        expect(role.discountCeiling, `${role.id} may not discount but has a ceiling`).toBe(0);
      } else {
        expect(role.discountCeiling, `${role.id} may discount but has no ceiling`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it('names every role in all three languages', () => {
    for (const id of ROLE_IDS) {
      for (const [language, catalogue] of [
        ['uz', uz],
        ['ru', ru],
        ['en', en],
      ] as const) {
        const copy = catalogue.console.roles[id];
        expect(copy?.name, `${id} has no name in ${language}`).toBeTruthy();
        expect(copy?.who, `${id} has no holder in ${language}`).toBeTruthy();
        expect(copy?.scope, `${id} has no scope in ${language}`).toBeTruthy();
      }
    }
  });

  it('gives every role a person and two initials for the avatar', () => {
    for (const role of ROLE_LIST) {
      expect(role.person.length, `${role.id} has no holder`).toBeGreaterThan(0);
      expect(role.initials, `${role.id}'s initials are not two letters`).toHaveLength(2);
    }
  });

  it('lists only real roles against a surface', () => {
    for (const [surface, roles] of Object.entries(SURFACE_ACCESS)) {
      expect(roles.length, `${surface} is open to nobody`).toBeGreaterThan(0);

      for (const id of roles) {
        expect(isRoleId(id), `${surface} lists ${id}, which is not a role`).toBe(true);
      }
    }
  });

  it('falls back to the owner rather than throwing on a bad cookie', () => {
    // The role arrives off a cookie, which the browser owns. Anything can be in
    // it, and the answer to junk is a coherent screen — never a 500.
    expect(roleOrDefault('waiter').id).toBe('waiter');
    expect(roleOrDefault('nonsense').id).toBe('owner');
    expect(roleOrDefault(undefined).id).toBe('owner');
    expect(roleOrDefault(42).id).toBe('owner');
    expect(isRoleId('waiter')).toBe(true);
    expect(isRoleId('__proto__')).toBe(false);
  });

  it('maps every server role name back to a console role', () => {
    // The eight names here are the ones DesignRoleMatrixTest asserts exist on
    // the server. If PHP renames `chef` and this table does not follow, a real
    // chef signs in and lands nowhere.
    for (const id of ROLE_IDS) {
      const name = SERVER_ROLE_NAMES[id];

      expect(name, `${id} has no server name`).toBeTruthy();
      expect(roleFromServer([name])?.id, `${name} does not map back to ${id}`).toBe(id);
    }

    // Two vocabularies, so no server name may be a console id it does not mean.
    expect(SERVER_ROLE_NAMES.kitchen).toBe('chef');
    expect(SERVER_ROLE_NAMES.warehouse).toBe('storekeeper');
    expect(SERVER_ROLE_NAMES.manager).toBe('branch-manager');
  });

  it('refuses to guess when the server sends a role with no screen', () => {
    // The platform runs fifteen roles; the design draws eight. A bartender is
    // a real account with real permissions and no console — landing them on
    // the owner's dashboard because it sorts first would be a permission bug
    // wearing a convenience.
    expect(roleFromServer(['bartender'])).toBeNull();
    expect(roleFromServer(['host', 'courier'])).toBeNull();
    expect(roleFromServer([])).toBeNull();

    // Someone holding two of ours gets the more capable one — ROLE_IDS order.
    expect(roleFromServer(['waiter', 'owner'])?.id).toBe('owner');
    expect(roleFromServer(['bartender', 'cashier'])?.id).toBe('cashier');
  });
});

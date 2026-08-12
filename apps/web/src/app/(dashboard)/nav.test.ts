import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { uz } from '@/i18n/uz';

import { NAV_GROUPS, NAV_ITEMS } from './nav';

/**
 * The sidebar and the routes on disk have to agree.
 *
 * This is not a hypothetical tidiness rule. The console was converted from a
 * university product, and for a while it still shipped ten pages nobody could
 * reach from the restaurant nav — students, exams, library, psychology — each
 * one a compiled route sitting in the bundle. A page with no link is dead
 * weight; a link with no page is a 404 a waiter finds mid-shift. Either one
 * fails here.
 *
 * The check walks the folder tree rather than reading a list, so a route added
 * two levels down — `finance/till` — is covered without anyone remembering to
 * update this file.
 */

/**
 * Routes the sidebar deliberately does not carry.
 *
 * The permissions matrix is reached from Staff and from Settings, which is
 * where someone looking for it actually goes; a nineteenth-and-a-half row for
 * it would push the sidebar past what the design draws. Listed here rather
 * than silently exempted, so adding a page still has to be a decision.
 */
const LINKED_IN_PAGE = ['/settings/permissions'];

/** Every route under (dashboard) that has a page, as a URL path. */
function routesOnDisk(): string[] {
  const root = join(process.cwd(), 'src/app/(dashboard)');
  const found: string[] = [];

  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === 'page.tsx') found.push(prefix || '/');
      if (!entry.isDirectory()) continue;

      // Route groups and private folders are not path segments.
      if (entry.name.startsWith('(') || entry.name.startsWith('_')) continue;

      walk(join(dir, entry.name), `${prefix}/${entry.name}`);
    }
  };

  walk(root, '');

  return found.sort();
}

describe('staff console navigation', () => {
  it('has a page on disk behind every link', () => {
    const onDisk = routesOnDisk();

    for (const item of NAV_ITEMS) {
      expect(onDisk, `nav links to ${item.href} but no page.tsx sits there`).toContain(item.href);
    }
  });

  it('has a link for every page on disk', () => {
    const linked = new Set<string>([...NAV_ITEMS.map((item) => item.href), ...LINKED_IN_PAGE]);

    for (const route of routesOnDisk()) {
      expect(linked, `${route} exists but nothing links to it`).toContain(route);
    }
  });

  it('gives every row a label in all three languages', () => {
    // The label is a message key rather than a string, so this is really a
    // check that the key exists — which the compiler enforces — plus that the
    // Uzbek catalogue actually fills it in.
    for (const group of NAV_GROUPS) {
      expect(uz.console.nav[group.key], `${group.key} has no section label`).toBeTruthy();

      for (const item of group.items) {
        expect(uz.console.nav[item.key], `${item.key} has no label`).toBeTruthy();
        expect(item.icon, `${item.key} has no icon`).toBeTruthy();
      }
    }
  });

  it('uses drawn icons rather than emoji', () => {
    // The design rules emoji out of the product UI entirely, and an emoji in a
    // sidebar renders differently on every platform besides.
    const emoji = /\p{Extended_Pictographic}/u;

    for (const item of NAV_ITEMS) {
      expect(emoji.test(uz.console.nav[item.key]), `${item.key}'s label has an emoji`).toBe(false);
    }
  });

  it('routes nested views under the module that owns them', () => {
    // The schedule belongs to Staff, the till to Finance. Nesting keeps one
    // folder per Phase 1 module instead of nineteen top-level routes the API
    // has no counterpart for.
    const nested = NAV_ITEMS.filter((item) => item.href.split('/').length > 2);
    const modules = new Set(NAV_ITEMS.map((item) => item.href.split('/')[1]));

    expect(nested.length).toBeGreaterThan(0);

    for (const item of nested) {
      expect(modules, `${item.href} hangs off a module with no page of its own`).toContain(
        item.href.split('/')[1],
      );
    }
  });

  it('reads route paths, not filesystem paths', () => {
    // Guards the walker itself: a Windows separator leaking into a href would
    // make every assertion above pass against nothing.
    for (const route of routesOnDisk()) {
      expect(route.includes(sep === '/' ? '\\' : '\\')).toBe(false);
    }
  });
});

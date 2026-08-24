import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';
import { uz } from '@/i18n/uz';

import { PLATFORM_NAV, PLATFORM_NAV_ITEMS } from './platform-nav';

/**
 * The platform's own sidebar, against the routes on disk.
 *
 * The same check the restaurant console gets, for the same reason and with a
 * sharper edge here: this surface shipped **one** of the twelve screens
 * `specs/01-os.md §6` names, and the layout's docblock argued that a super
 * admin should have no sidebar at all. Nothing caught it, because nothing was
 * looking.
 */
function routesOnDisk(): string[] {
  const root = join(process.cwd(), 'src/app/(platform)');
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

describe('the platform operator’s sidebar', () => {
  it('draws the twelve screens the design names', () => {
    // §6 opens with the count, so the count is the assertion.
    expect(PLATFORM_NAV_ITEMS.length).toBe(12);
  });

  it('has a page on disk behind every row', () => {
    const onDisk = routesOnDisk();

    for (const item of PLATFORM_NAV_ITEMS) {
      expect(onDisk, `${item.key} links to ${item.href}, which has no page`).toContain(item.href);
    }
  });

  it('has a row for every page on disk', () => {
    const linked = new Set(PLATFORM_NAV_ITEMS.map((item) => item.href));

    for (const route of routesOnDisk()) {
      expect(linked, `${route} exists and nothing links to it`).toContain(route);
    }
  });

  it('names every row in all three languages', () => {
    for (const catalogue of [uz, ru, en]) {
      const nav = catalogue.console.platformNav as Record<string, string>;

      for (const item of PLATFORM_NAV_ITEMS) {
        expect(nav[item.key], `${item.key} has no label`).toBeTruthy();
      }

      for (const group of PLATFORM_NAV) {
        expect(nav[group.key], `${group.key} has no overline`).toBeTruthy();
      }
    }
  });

  it('draws no empty section', () => {
    for (const group of PLATFORM_NAV) {
      expect(group.items.length, `${group.key} is empty`).toBeGreaterThan(0);
    }
  });
});

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every web route on the four phone surfaces has a screen here, at the same path.
 *
 * This is the rule the whole app is shaped around, and it is not cosmetic: a
 * push notification carries `srcp://mp/track`, a QR code carries
 * `/qr/osh-xona/12`, and a shared link carries whatever the browser had. Each of
 * them resolves by *path*. A screen renamed on one side and not the other does
 * not fail a build — it fails at the moment somebody taps a notification, which
 * is the worst place to find out.
 *
 * Web is the source: it has the routes, and this asserts the native tree covers
 * them. The reverse is deliberately not asserted — `app/index.tsx` and the QR
 * scanner exist only here, because one binary has to ask which product and
 * because a browser cannot open a camera the way this can.
 */

const WEB = join(process.cwd(), '../web/src/app');
const NATIVE = join(process.cwd(), 'app');

/** Which web route group answers for which native group. */
const SURFACES: Readonly<Record<string, string>> = {
  '(customer)': '(customer)',
  '(marketplace)': '(marketplace)',
  '(staff)': '(staff)',
  '(guest)': '(guest)',
};

/** `customer/cart/page.tsx` → `customer/cart`. */
function webRoutes(group: string): string[] {
  const root = join(WEB, group);
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);

      if (statSync(path).isDirectory()) walk(path);
      else if (entry === 'page.tsx') {
        const route = dir.slice(root.length + 1);

        if (route !== '') found.push(route);
      }
    }
  };

  walk(root);

  return found.sort();
}

/**
 * Whether a native screen answers for this route.
 *
 * Expo Router resolves `a/b` from `a/b.tsx` or `a/b/index.tsx`, and a dynamic
 * segment is written the same way in both trees (`[table]`), so the comparison
 * is a path comparison and not a translation.
 */
const covered = (group: string, route: string): boolean =>
  existsSync(join(NATIVE, group, `${route}.tsx`)) ||
  existsSync(join(NATIVE, group, route, 'index.tsx'));

describe.each(Object.entries(SURFACES))('%s', (webGroup, nativeGroup) => {
  const routes = webRoutes(webGroup);

  it('has routes to compare', () => {
    // A group that produced nothing would make the next test pass vacuously.
    expect(routes.length).toBeGreaterThan(3);
  });

  it('is covered screen for screen', () => {
    const missing = routes.filter((route) => !covered(nativeGroup, route));

    expect(missing, `${webGroup} routes with no native screen`).toEqual([]);
  });
});

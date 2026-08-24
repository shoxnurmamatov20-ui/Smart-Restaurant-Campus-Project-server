import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREW_ROLES, DOCK, type CrewRole } from '@restaurant/surfaces/crew/data';

/**
 * The native app against the four design files it is built from.
 *
 * `routes.test.ts` asserts parity with the web build; this asserts parity with
 * the *design*, which is the actual contract. The two differ where the web
 * build itself is wrong or incomplete, and a check that only compared the two
 * builds would carry that across without noticing.
 *
 * Same method as `apps/web/src/app/design-coverage.test.ts`: the design's
 * screens are the `{{at.*}}` switches in each file, and each is mapped to the
 * file that answers for it. The staff app is not a state machine of screens but
 * five roles with four tabs each, so it is read from its per-role tab arrays
 * instead and compared to `DOCK` — the one table both builds draw their tab
 * bars from.
 */

const SOURCE = join(process.cwd(), '../../docs/design/source');
const available = existsSync(SOURCE);

if (!available) console.warn(`[design-fidelity] SKIP — ${SOURCE} not found`);

const read = (file: string) => readFileSync(join(SOURCE, file), 'utf8');

const screensIn = (file: string): string[] => [
  ...new Set([...read(file).matchAll(/sc-if value="\{\{at\.(\w+)\}\}"/g)].map((m) => m[1]!)),
];

/** Design screen → the native file that draws it. */
const SCREENS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'Smart Restaurant Mijoz ilovasi.dc.html': {
    auth: 'app/(customer)/customer/sign-in.tsx',
    home: 'app/(customer)/customer/index.tsx',
    menu: 'app/(customer)/customer/menu.tsx',
    /* A full-screen Modal over the menu, not a route — the web build keeps it
       at `/customer/menu?d=`, so a new segment here would 404 in a browser
       that followed the same link. */
    item: 'src/customer/dish-sheet.tsx',
    cart: 'app/(customer)/customer/cart.tsx',
    pay: 'app/(customer)/customer/pay.tsx',
    status: 'app/(customer)/customer/order.tsx',
    loyalty: 'app/(customer)/customer/loyalty.tsx',
    profile: 'app/(customer)/customer/profile.tsx',
  },
  'MyPOS Marketplace - Ilova.dc.html': {
    home: 'app/(marketplace)/mp/index.tsx',
    store: 'app/(marketplace)/mp/store/[store].tsx',
    cart: 'app/(marketplace)/mp/cart.tsx',
    track: 'app/(marketplace)/mp/track.tsx',
    orders: 'app/(marketplace)/mp/orders.tsx',
    profile: 'app/(marketplace)/mp/profile.tsx',
  },
};

/** The guest file is six `data-panel` artboards, in journey order. */
const GUEST_PANELS: readonly string[] = [
  'app/(guest)/qr/[restaurant]/[table]/index.tsx',
  'app/(guest)/qr/[restaurant]/[table]/menu.tsx',
  'src/guest/dish-sheet.tsx',
  'app/(guest)/qr/[restaurant]/[table]/status.tsx',
  'app/(guest)/qr/[restaurant]/[table]/bill.tsx',
  'app/(guest)/qr/[restaurant]/[table]/rating.tsx',
];

describe.skipIf(!available)('every design screen has a native file', () => {
  for (const [design, map] of Object.entries(SCREENS)) {
    it(design.replace('.dc.html', ''), () => {
      const declared = screensIn(design);

      expect(declared.length).toBeGreaterThan(0);

      for (const screen of declared) {
        const file = map[screen];

        expect(file, `${design} declares "${screen}" and nothing answers for it`).toBeDefined();
        expect(existsSync(join(process.cwd(), file!)), `${file} is missing`).toBe(true);
      }
    });
  }

  it('the guest journey — all six panels', () => {
    const panels = new Set(
      [...read('Smart Restaurant Mehmon.dc.html').matchAll(/data-panel="(\d+)"/g)].map(
        (m) => m[1]!,
      ),
    );

    expect(panels.size).toBe(GUEST_PANELS.length);

    for (const file of GUEST_PANELS) {
      expect(existsSync(join(process.cwd(), file)), `${file} is missing`).toBe(true);
    }
  });

  it('the guest journey starts with the camera, which the web cannot', () => {
    // The one screen with no web counterpart — and the native shell's reason
    // for existing on this surface.
    expect(existsSync(join(process.cwd(), 'app/(guest)/qr/index.tsx'))).toBe(true);
  });
});

describe.skipIf(!available)('the staff app — five roles, the tabs the design gives each', () => {
  /*
   * The design writes each role's dock as a slug array — `waiter: ["tables",
   * "calls", "menu", "more"]` — and a second array of the same length with the
   * words. The slugs are the design's; `DOCK` in `@restaurant/surfaces` uses
   * the build's, and the two vocabularies differ in five places. Mapped here
   * so the comparison is exact rather than approximate.
   */
  const DESIGN_SLUG: Readonly<Record<string, string>> = {
    approve: 'approvals',
    recv: 'receiving',
    deliver: 'deliveries',
  };

  const html = read('Smart Restaurant Xodimlar ilovasi.dc.html');

  const designDock = (role: string): string[] | null => {
    const match = new RegExp(`\\b${role}\\s*:\\s*\\[((?:"\\w+",?\\s*)+)\\]`).exec(html);

    return match === null ? null : [...match[1]!.matchAll(/"(\w+)"/g)].map((m) => m[1]!);
  };

  /** The design's role names against the build's. */
  const ROLE_IN_DESIGN: Readonly<Record<CrewRole, string>> = {
    owner: 'owner',
    manager: 'manager',
    waiter: 'waiter',
    // The server's name for the role, as CLAUDE.md's role table has it
    // (`warehouse` → `storekeeper`); the design file uses the console's word.
    storekeeper: 'warehouse',
    courier: 'courier',
  };

  it('covers every role the build knows', () => {
    expect([...CREW_ROLES].sort()).toEqual(Object.keys(ROLE_IN_DESIGN).sort());
  });

  it.each(CREW_ROLES)('%s has exactly the design’s four tabs, in order', (role) => {
    const drawn = designDock(ROLE_IN_DESIGN[role]);

    expect(drawn, `the design has no dock for ${role}`).not.toBeNull();

    const expected = drawn!.map((slug) => DESIGN_SLUG[slug] ?? slug);

    expect(DOCK[role].map((tab) => tab.slug)).toEqual(expected);
  });

  it('draws a panel for every tab slug', () => {
    // `[tab].tsx` switches on the slug; a slug in DOCK with no case renders
    // nothing, silently.
    const screen = readFileSync(join(process.cwd(), 'app/(staff)/crew/[role]/[tab].tsx'), 'utf8');
    const cases = new Set([...screen.matchAll(/case '(\w[\w-]*)':/g)].map((m) => m[1]!));

    for (const role of CREW_ROLES) {
      for (const tab of DOCK[role]) {
        expect(cases.has(tab.slug), `no panel case for ${role}/${tab.slug}`).toBe(true);
      }
    }
  });
});

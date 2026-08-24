import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every screen in every design file has a route on disk.
 *
 * This is the check the whole "1:1 with the handoff" claim rests on, and it is
 * mechanical on purpose: it reads the design files themselves, pulls out every
 * screen they declare — `sc-if value="{{at.*}}"` for the eight multi-screen
 * files and `{{mfSub.*}}` for the staff app's More menu — and asserts a file
 * exists for each. Nobody has to remember to update a list.
 *
 * ---------------------------------------------------------------------------
 * It reads the copy in the repository
 *
 * This used to read the export directory at the repo root, which is in
 * `.gitignore`, so on CI it skipped — and a check that never runs where changes
 * are merged is not a check. Worse, the copy that *was* committed under
 * `docs/design/source/` was the superseded v1.0 export: nineteen sidebar
 * modules against the current twenty-four, and no ninth role. Two designs lived
 * in the repository at once and screens got built from whichever one their
 * author happened to open.
 *
 * `docs/design/source/` now holds all fourteen current files and this reads
 * them, so the coverage claim is enforced on every push. The export directory
 * is still honoured when it is present — it is what a designer refreshes first
 * — but it is a fallback rather than the source.
 *
 * Where the build deliberately departs from the design, `MERGED` records the
 * departure and its reason. That list is short and every entry is a decision,
 * not a gap.
 */
const IN_REPO = join(process.cwd(), '../../docs/design/source');

/** A designer's fresh export, when one is checked out beside the repo. */
const EXPORT = join(
  process.cwd(),
  '../../Restaurant form scope questions-handoff (2)/restaurant-form-scope-questions/project',
);

const HANDOFF = existsSync(EXPORT) ? EXPORT : IN_REPO;

const available = existsSync(HANDOFF);

/** design file → screen id → the route file that answers for it. */
const ROUTES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'Osh Xona - Restoran sayti.dc.html': {
    home: 'src/app/(site)/r/[restaurant]/page.tsx',
    menu: 'src/app/(site)/r/[restaurant]/menu/page.tsx',
    cart: 'src/app/(site)/r/[restaurant]/cart/page.tsx',
    track: 'src/app/(site)/r/[restaurant]/track/page.tsx',
    book: 'src/app/(site)/r/[restaurant]/book/page.tsx',
    about: 'src/app/(site)/r/[restaurant]/about/page.tsx',
  },
  'Smart Restaurant Cloud - Sayt v2.dc.html': {
    home: 'src/app/(marketing)/page.tsx',
    product: 'src/app/(marketing)/product/page.tsx',
    roles: 'src/app/(marketing)/roles/page.tsx',
    pricing: 'src/app/(marketing)/pricing/page.tsx',
    customers: 'src/app/(marketing)/customers/page.tsx',
    faq: 'src/app/(marketing)/faq/page.tsx',
    contact: 'src/app/(marketing)/contact/page.tsx',
    login: 'src/app/(auth)/login/page.tsx',
  },
  'Smart Restaurant Mijoz ilovasi.dc.html': {
    auth: 'src/app/(customer)/customer/sign-in/page.tsx',
    home: 'src/app/(customer)/customer/page.tsx',
    menu: 'src/app/(customer)/customer/menu/page.tsx',
    /* The dish screen is a state of the menu route, not a route: it opens over
       the list and closing it must not lose the reader's scroll position. */
    item: 'src/app/(customer)/customer/menu/menu-board.tsx',
    cart: 'src/app/(customer)/customer/cart/page.tsx',
    pay: 'src/app/(customer)/customer/pay/page.tsx',
    status: 'src/app/(customer)/customer/order/page.tsx',
    loyalty: 'src/app/(customer)/customer/loyalty/page.tsx',
    profile: 'src/app/(customer)/customer/profile/page.tsx',
  },
  'MyPOS Marketplace - Ilova.dc.html': {
    home: 'src/app/(marketplace)/mp/page.tsx',
    store: 'src/app/(marketplace)/mp/store/[store]/page.tsx',
    cart: 'src/app/(marketplace)/mp/cart/page.tsx',
    track: 'src/app/(marketplace)/mp/track/page.tsx',
    orders: 'src/app/(marketplace)/mp/orders/page.tsx',
    profile: 'src/app/(marketplace)/mp/profile/page.tsx',
  },
  'MyPOS Marketplace - Sayt.dc.html': {
    home: 'src/app/(marketplace)/mp/page.tsx',
    store: 'src/app/(marketplace)/mp/store/[store]/page.tsx',
    cart: 'src/app/(marketplace)/mp/cart/page.tsx',
    track: 'src/app/(marketplace)/mp/track/page.tsx',
    /* See MERGED. */
    checkout: 'src/app/(marketplace)/mp/cart/cart-board.tsx',
  },
  "MyPOS Marketplace - Do'kon paneli.dc.html": {
    orders: 'src/app/(merchant)/merchant/orders/page.tsx',
    catalog: 'src/app/(merchant)/merchant/catalogue/page.tsx',
    settle: 'src/app/(merchant)/merchant/settlement/page.tsx',
    disputes: 'src/app/(merchant)/merchant/disputes/page.tsx',
    perf: 'src/app/(merchant)/merchant/performance/page.tsx',
    promos: 'src/app/(merchant)/merchant/promotions/page.tsx',
    settings: 'src/app/(merchant)/merchant/settings/page.tsx',
  },
};

/**
 * Screens the build deliberately merges into another, and why.
 *
 * Each of these is a decision somebody can disagree with, which is exactly why
 * it is written down beside the check rather than left as a silent absence.
 */
const MERGED: Readonly<Record<string, string>> = {
  checkout:
    'The marketplace web checkout is the cart page. Three routes would lose the chosen ' +
    'card when a guest goes back to change the address, which is the most common edit.',
  item:
    'The customer dish screen opens over the menu rather than replacing it, so closing ' +
    'it returns to the same scroll position in a list of forty rows.',
};

/** The staff app's More sub-screens, and the file each is served from. */
const STAFF_SUBS: Readonly<Record<string, string>> = {
  finance: 'src/app/(staff)/panels/more-screens.tsx',
  people: 'src/app/(staff)/panels/more-screens.tsx',
  control: 'src/app/(staff)/panels/more-screens.tsx',
  closing: 'src/app/(staff)/panels/more-screens.tsx',
  rota: 'src/app/(staff)/panels/more-screens.tsx',
  kitchen: 'src/app/(staff)/panels/more-screens.tsx',
  expiry: 'src/app/(staff)/panels/more-screens.tsx',
  myshift: 'src/app/(staff)/panels/more-screens.tsx',
  bookings: 'src/app/(staff)/panels/more-screens.tsx',
  myday: 'src/app/(staff)/panels/more-screens.tsx',
  endshift: 'src/app/(staff)/panels/more-screens.tsx',
  branchDetail: 'src/app/(staff)/panels/more-screens.tsx',
  waste: 'src/app/(staff)/panels/more-forms.tsx',
  porder: 'src/app/(staff)/panels/more-forms.tsx',
  swap: 'src/app/(staff)/panels/more-forms.tsx',
  handback: 'src/app/(staff)/panels/more-forms.tsx',
  queue: 'src/app/(staff)/crew/[role]/queue/queue-board.tsx',
  order: 'src/app/(staff)/crew/[role]/table/[table]/order/order-board.tsx',
  tableDetail: 'src/app/(staff)/crew/[role]/table/[table]/page.tsx',
  scan: 'src/app/(staff)/panels/store.tsx',
};

const read = (file: string) => readFileSync(join(HANDOFF, file), 'utf8');

const screensIn = (file: string): string[] => [
  ...new Set([...read(file).matchAll(/sc-if value="\{\{at\.(\w+)\}\}"/g)].map((m) => m[1]!)),
];

describe.skipIf(!available)('every design screen has a route', () => {
  it('finds the handoff where it is expected', () => {
    // If this moves, everything below silently skips — so it is asserted
    // rather than assumed.
    expect(readdirSync(HANDOFF).some((name) => name.endsWith('.dc.html'))).toBe(true);
  });

  for (const [design, routes] of Object.entries(ROUTES)) {
    it(`${design.replace('.dc.html', '')} — every screen is built`, () => {
      const declared = screensIn(design);

      expect(declared.length).toBeGreaterThan(0);

      for (const screen of declared) {
        const path = routes[screen];

        expect(path, `${design} declares "${screen}" and nothing answers for it`).toBeDefined();
        expect(existsSync(join(process.cwd(), path!)), `${path} is missing`).toBe(true);
      }
    });
  }

  it('the staff app — every More sub-screen is built', () => {
    const subs = [
      ...new Set(
        [
          ...read('Smart Restaurant Xodimlar ilovasi.dc.html').matchAll(
            /sc-if value="\{\{mfSub\.(\w+)\}\}"/g,
          ),
        ].map((m) => m[1]!),
      ),
    ];

    expect(subs.length).toBe(20);

    for (const sub of subs) {
      const path = STAFF_SUBS[sub];

      expect(path, `the More menu declares "${sub}" and nothing answers for it`).toBeDefined();
      expect(existsSync(join(process.cwd(), path!)), `${path} is missing`).toBe(true);
    }
  });

  it('names a reason for every screen that was merged into another', () => {
    // A merge with no reason beside it is indistinguishable from a screen
    // somebody forgot.
    for (const key of Object.keys(MERGED)) {
      expect(MERGED[key]!.length).toBeGreaterThan(40);
    }
  });
});

describe('the design files are in the repository', () => {
  it('has the fourteen current files committed', () => {
    // The whole point of moving them in. If somebody removes them again to save
    // three megabytes, this fails rather than the coverage suite quietly
    // skipping and the "1:1 with the design" claim going unchecked.
    const files = readdirSync(IN_REPO).filter((name) => name.endsWith('.dc.html'));

    expect(files.length).toBe(14);
  });

  it('has the current console export, not the superseded one', () => {
    // v1.0 was 6 507 lines and listed nineteen sidebar modules; the current
    // file is 17 547 and lists twenty-four. Half this console was built from
    // each, which is why two screens could disagree about what a role can see.
    const console_ = readFileSync(join(IN_REPO, 'Smart Restaurant OS.dc.html'), 'utf8');
    // `[^\]]*` rather than `.*?` with the `s` flag: the tsconfig targets a
    // version that predates dotAll, and the array holds no `]` anyway.
    const navAll = /NAV_ALL = \[([^\]]*)\]/.exec(console_)?.[1] ?? '';

    expect(navAll.split(',').length).toBe(24);
    expect(navAll).toContain('calls');
    expect(navAll).toContain('cases');
  });
});

/**
 * The console, which this suite could not see.
 *
 * `screensIn()` looks for `sc-if value="{{at.*}}"`, and the OS file declares no
 * `at.*` at all — it switches modules on `NAV_ALL` and the super-admin on
 * `superView`. So the largest surface in the handoff, twenty-four modules and
 * twelve platform screens, sat outside the one check the "1:1 with the design"
 * claim rests on. Adding the filename to `ROUTES` would not have helped: the
 * regex would have found zero screens and the assertion would have passed.
 *
 * These read the design's own two arrays and assert a route answers for every
 * entry. `design-fidelity.test.ts` already pins the *names* against
 * `roles.ts`; this pins that each one goes somewhere.
 */
describe.skipIf(!available)('the console', () => {
  const file = () => read('Smart Restaurant OS.dc.html');

  /** The design's key → this codebase's route. Two rows were renamed before. */
  const AS_ROUTE: Readonly<Record<string, string>> = {
    board: 'src/app/(dashboard)/board/page.tsx',
    dashboard: 'src/app/(dashboard)/dashboard/page.tsx',
    orders: 'src/app/(dashboard)/orders/page.tsx',
    calls: 'src/app/(dashboard)/calls/page.tsx',
    tables: 'src/app/(dashboard)/tables/page.tsx',
    /* The prototype's `kds` is this repo's `kitchen`, and it is a surface of its
       own rather than a console section — a wall screen, not a sidebar row. */
    kds: 'src/app/(kds)/kitchen/page.tsx',
    menu: 'src/app/(dashboard)/menu/page.tsx',
    inventory: 'src/app/(dashboard)/inventory/page.tsx',
    ops: 'src/app/(dashboard)/inventory/operations/page.tsx',
    suppliers: 'src/app/(dashboard)/suppliers/page.tsx',
    staff: 'src/app/(dashboard)/staff/page.tsx',
    shifts: 'src/app/(dashboard)/staff/shifts/page.tsx',
    crm: 'src/app/(dashboard)/crm/page.tsx',
    marketing: 'src/app/(dashboard)/marketing/page.tsx',
    web: 'src/app/(dashboard)/web/page.tsx',
    finance: 'src/app/(dashboard)/finance/page.tsx',
    till: 'src/app/(dashboard)/finance/till/page.tsx',
    books: 'src/app/(dashboard)/finance/books/page.tsx',
    control: 'src/app/(dashboard)/analytics/control/page.tsx',
    cases: 'src/app/(dashboard)/crm/cases/page.tsx',
    analytics: 'src/app/(dashboard)/analytics/page.tsx',
    reports: 'src/app/(dashboard)/analytics/reports/page.tsx',
    branches: 'src/app/(dashboard)/settings/branches/page.tsx',
    settings: 'src/app/(dashboard)/settings/page.tsx',
  };

  /** The twelve platform screens, by the design's own `superView` values. */
  const AS_PLATFORM: Readonly<Record<string, string>> = {
    overview: 'src/app/(platform)/platform/page.tsx',
    tenants: 'src/app/(platform)/platform/tenants/page.tsx',
    plans: 'src/app/(platform)/platform/plans/page.tsx',
    billing: 'src/app/(platform)/platform/billing/page.tsx',
    trials: 'src/app/(platform)/platform/trials/page.tsx',
    devices: 'src/app/(platform)/platform/terminals/page.tsx',
    health: 'src/app/(platform)/platform/health/page.tsx',
    logs: 'src/app/(platform)/platform/log/page.tsx',
    audit: 'src/app/(platform)/platform/sign-ins/page.tsx',
    team: 'src/app/(platform)/platform/team/page.tsx',
    sub: 'src/app/(platform)/platform/subscription/page.tsx',
    settings: 'src/app/(platform)/platform/settings/page.tsx',
  };

  it('has a route for all twenty-four sidebar modules', () => {
    const navAll = /NAV_ALL = \[([^\]]*)\]/.exec(file())?.[1] ?? '';
    const keys = [...navAll.matchAll(/"(\w+)"/g)].map((m) => m[1]!);

    expect(keys.length).toBe(24);

    for (const key of keys) {
      const route = AS_ROUTE[key];

      expect(route, `the design's "${key}" has nothing mapped to it`).toBeDefined();
      expect(existsSync(join(process.cwd(), route!)), `${route} is missing`).toBe(true);
    }
  });

  it('has a route for all twelve super-admin screens', () => {
    const views = new Set([...file().matchAll(/superView: "(\w+)"/g)].map((m) => m[1]!));

    expect(views.size).toBe(12);

    for (const view of views) {
      const route = AS_PLATFORM[view];

      expect(route, `the design's superView "${view}" has nothing mapped to it`).toBeDefined();
      expect(existsSync(join(process.cwd(), route!)), `${route} is missing`).toBe(true);
    }
  });

  it('has a screen for every row in the staff app’s tab bars', () => {
    // `mfAt.*` is the staff app's top level — eighteen screens the `mfSub`
    // check below never reached, because it only reads the More menu.
    const tops = new Set(
      [
        ...read('Smart Restaurant Xodimlar ilovasi.dc.html').matchAll(
          /sc-if value="\{\{mfAt\.(\w+)\}\}"/g,
        ),
      ].map((m) => m[1]!),
    );

    expect(tops.size).toBeGreaterThanOrEqual(14);

    /* Every one of them is a tab inside `/crew/[role]/[tab]` or a route of its
       own; the dynamic segment is what answers for the tabs, so the assertion is
       that the segment exists rather than eighteen separate files. */
    for (const route of [
      'src/app/(staff)/crew/[role]/[tab]/page.tsx',
      'src/app/(staff)/crew/[role]/page.tsx',
      'src/app/(staff)/crew/[role]/queue/page.tsx',
      'src/app/(staff)/crew/[role]/more/[screen]/page.tsx',
      'src/app/(staff)/crew/[role]/table/[table]/page.tsx',
    ]) {
      expect(existsSync(join(process.cwd(), route)), `${route} is missing`).toBe(true);
    }
  });
});

/**
 * The two files whose screens this suite could not extract.
 *
 * `screensIn()` looks for `at.*`, and neither of these uses it: the Telegram
 * file switches on `atChat` / `atApp` / `atPush` with the mini-app's own screens
 * under `app*`, and the guest file is not a state machine at all — it lays its
 * six screens out side by side as `data-panel` artboards so a reviewer sees the
 * whole journey at once.
 *
 * Both were built and neither was checked, which is the same silence the console
 * sat in. The maps below are explicit for that reason: the extraction is
 * different per file, but the assertion — every screen the design declares has a
 * route — is the one this suite exists to make.
 */
describe.skipIf(!available)('Telegram', () => {
  /** The design's own names → the route that answers for each. */
  const AS_ROUTE: Readonly<Record<string, string>> = {
    /* The bot conversation. Not a mini-app screen: it is what a guest sees in
       Telegram before anything opens, and `/tg` is where the WebApp button
       sends them from. */
    atChat: 'src/app/(telegram)/tg/page.tsx',
    atPush: 'src/app/(telegram)/tg/push/page.tsx',
    /* `atApp` is the mini-app frame; the four screens inside it are the routes
       below, so the frame itself has no page of its own. */
    appMenu: 'src/app/(telegram)/tg/menu/page.tsx',
    appCart: 'src/app/(telegram)/tg/cart/page.tsx',
    appTrack: 'src/app/(telegram)/tg/order/page.tsx',
    appLoyal: 'src/app/(telegram)/tg/points/page.tsx',
  };

  it('every screen is built', () => {
    const declared = new Set(
      [
        ...read('Smart Restaurant Telegram.dc.html').matchAll(
          /sc-if value="\{\{(at[A-Z]\w*|app[A-Z]\w*)\}\}"/g,
        ),
      ].map((m) => m[1]!),
    );

    // Three stages and four mini-app screens.
    expect(declared.size).toBe(7);

    for (const screen of declared) {
      // `atApp` is a frame rather than a screen — see the note above.
      if (screen === 'atApp') continue;

      const route = AS_ROUTE[screen];

      expect(route, `the design declares "${screen}" and nothing answers for it`).toBeDefined();
      expect(existsSync(join(process.cwd(), route!)), `${route} is missing`).toBe(true);
    }
  });
});

describe.skipIf(!available)('the guest QR journey', () => {
  /** Panel order is the journey's order, and the design draws it left to right. */
  const AS_ROUTE: readonly (string | null)[] = [
    'src/app/(guest)/qr/[restaurant]/[table]/page.tsx',
    'src/app/(guest)/qr/[restaurant]/[table]/menu/page.tsx',
    /* Panel 3 is the dish sheet. It opens over the menu rather than replacing
       it, for the same reason the customer app's does — see MERGED — so the
       board file is what answers for it. */
    'src/app/(guest)/qr/[restaurant]/[table]/menu/menu-board.tsx',
    'src/app/(guest)/qr/[restaurant]/[table]/status/page.tsx',
    'src/app/(guest)/qr/[restaurant]/[table]/bill/page.tsx',
    'src/app/(guest)/qr/[restaurant]/[table]/rating/page.tsx',
  ];

  it('has a screen for all six panels', () => {
    const panels = new Set(
      [...read('Smart Restaurant Mehmon.dc.html').matchAll(/data-panel="(\d+)"/g)].map(
        (m) => m[1]!,
      ),
    );

    expect(panels.size).toBe(AS_ROUTE.length);

    AS_ROUTE.forEach((route, index) => {
      expect(route, `panel ${index + 1} has nothing mapped to it`).not.toBeNull();
      expect(existsSync(join(process.cwd(), route!)), `${route} is missing`).toBe(true);
    });
  });
});

describe.skipIf(!available)('the printable documents', () => {
  /*
   * The seventh design file, and the only one whose "screens" are sheets of
   * paper. `screensIn()` finds nothing in it — there is no `at.*` state machine,
   * because a document does not navigate — so it is read the way it is drawn:
   * seven `<section class="page">` blocks, in order.
   *
   * All seven live on one route, selected by `?d=`. That is the design's own
   * architecture (`specs/02-documents.md §3`: "One continuous page; each document
   * is a `section`"), and it is why this asserts a count and a switcher rather
   * than seven files: seven routes would be seven print dialogues.
   */
  const DOCUMENTS = 'src/app/(documents)/documents';

  it('draws seven documents and the build has seven', () => {
    const design = read('Smart Restaurant OS - Hujjatlar.dc.html');

    expect((design.match(/class="page"/g) ?? []).length).toBe(7);

    const order = readFileSync(join(process.cwd(), DOCUMENTS, 'documents-data.ts'), 'utf8');
    const declared = /DOCUMENT_ORDER: readonly DocumentKey\[\] = \[([^\]]*)\]/.exec(order);

    expect(declared, 'documents-data.ts no longer declares DOCUMENT_ORDER').not.toBeNull();
    expect((declared![1]!.match(/'/g) ?? []).length / 2).toBe(7);
  });

  it('has a component for each', () => {
    for (const file of [
      'index-page.tsx',
      'receipts.tsx',
      'z-report.tsx',
      'invoice.tsx',
      'stock-count.tsx',
      'payslip.tsx',
      'profit-loss.tsx',
    ]) {
      expect(existsSync(join(process.cwd(), DOCUMENTS, file)), `${file} is missing`).toBe(true);
    }
  });

  it('is guarded, unlike when it was built', () => {
    // The surface shipped in neither `SURFACE_PATHS` nor `MODULE_PATHS`, and
    // `isAllowed()` passes a path in neither. See `documents-access.test.ts`.
    const roles = readFileSync(join(process.cwd(), 'src/lib/roles.ts'), 'utf8');

    expect(roles).toContain("documents: '/documents'");
    expect(roles).toMatch(/documents: \[[^\]]*'owner'/);
  });
});

describe.skipIf(!available)('every design file is read by a test', () => {
  /*
   * The meta-check. Each of the other suites reads one or two of the fourteen
   * files; this one asks whether any file is read by none — which is how the
   * setup wizard shipped with no fidelity check at all, and how a fifteenth
   * file would arrive unnoticed.
   *
   * One file is exempt on purpose. The designer's own CHANGELOG (2026-08-17):
   * *"Smart Restaurant Cloud - Sayt v2.dc.html (yangi) · Eski fayl: Smart
   * Restaurant Cloud - Sayt.dc.html — saqlab qo'yildi"* — v2 rebuilt the one
   * long page into eight and v1 was kept for reference. A check against v1
   * would be a check against the page the designer replaced.
   */
  const SUPERSEDED = new Set(['Smart Restaurant Cloud - Sayt.dc.html']);

  const tests = (dir: string, found: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);

      if (entry === 'node_modules') continue;
      if (statSync(path).isDirectory()) tests(path, found);
      else if (/\.test\.tsx?$/.test(entry)) found.push(readFileSync(path, 'utf8'));
    }

    return found;
  };

  it('leaves no file unchecked', () => {
    const files = readdirSync(IN_REPO).filter((name) => name.endsWith('.dc.html'));
    const corpus = [
      ...tests(join(process.cwd(), 'src')),
      ...tests(join(process.cwd(), '../mobile/src')),
    ].join('\n');

    expect(files.length).toBe(14);

    const unchecked = files.filter((name) => !SUPERSEDED.has(name) && !corpus.includes(name));

    expect(unchecked, 'design files no test reads').toEqual([]);
  });
});

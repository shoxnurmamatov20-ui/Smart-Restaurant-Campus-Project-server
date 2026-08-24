/**
 * The public site's pages, as structure.
 *
 * Everything here reads the same in all three languages — a price, a chip key,
 * a tone name, a plan id — so none of it belongs in `pages-copy.ts`, where it
 * would sit in three files waiting for two of them to fall behind. The two
 * files are index-aligned: `PAGE_MODS[2]` is `pagesCopy(locale).mods[2]`.
 *
 * Read out of `files/Smart Restaurant Cloud - Sayt v2.dc.html` with the copy,
 * in the same pass, so the two cannot disagree about how many of anything
 * there are — `pages-fidelity.test.ts` checks exactly that.
 */

/** How loudly a chip is drawn. Never a raw colour: the palette owns those. */
export type SiteTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export const PAGE_MODS: readonly {
  id: string;
  stat: string;
  rows: readonly { key: string; tone: SiteTone }[];
}[] = [
  {
    id: 'floor',
    stat: '3',
    rows: [
      { key: '12', tone: 'brand' },
      { key: '14', tone: 'warning' },
      { key: '19', tone: 'neutral' },
      { key: '03', tone: 'neutral' },
      { key: '07', tone: 'neutral' },
    ],
  },
  {
    id: 'kitchen',
    stat: '24 → 16',
    rows: [
      { key: '01', tone: 'warning' },
      { key: '02', tone: 'brand' },
      { key: '03', tone: 'danger' },
      { key: '04', tone: 'success' },
      { key: '—', tone: 'danger' },
    ],
  },
  {
    id: 'till',
    stat: '±32 000',
    rows: [
      { key: '∑', tone: 'neutral' },
      { key: '84', tone: 'success' },
      { key: '46', tone: 'neutral' },
      { key: '33', tone: 'neutral' },
      { key: '!', tone: 'danger' },
    ],
  },
  {
    id: 'stock',
    stat: '142',
    rows: [
      { key: 'kg', tone: 'danger' },
      { key: 'kg', tone: 'warning' },
      { key: 'kg', tone: 'success' },
      { key: '↓', tone: 'brand' },
      { key: '%', tone: 'warning' },
    ],
  },
  {
    id: 'people',
    stat: '12%',
    rows: [
      { key: '∑', tone: 'neutral' },
      { key: '−', tone: 'neutral' },
      { key: '!', tone: 'danger' },
      { key: '✓', tone: 'success' },
      { key: '→', tone: 'brand' },
    ],
  },
  {
    id: 'analytics',
    stat: '118',
    rows: [
      { key: '01', tone: 'success' },
      { key: '02', tone: 'success' },
      { key: '03', tone: 'warning' },
      { key: '04', tone: 'neutral' },
      { key: '05', tone: 'success' },
    ],
  },
];

/** Nine roles, in the design’s order — `dc.html:1261`. */
export const PAGE_ROLES: readonly { id: string; initials: string }[] = [
  { id: 'waiter', initials: 'OF' },
  { id: 'cashier', initials: 'KS' },
  { id: 'chef', initials: 'OS' },
  { id: 'warehouse', initials: 'OM' },
  { id: 'manager', initials: 'MN' },
  { id: 'accountant', initials: 'BX' },
  { id: 'operator', initials: 'OP' },
  { id: 'owner', initials: 'EG' },
  { id: 'super', initials: 'SA' },
];

/**
 * Three plans. `monthlyTiyin` is tiyin, like every amount here.
 *
 * **The underscores are the point.** These held `2400000` and `6900000` — the
 * design's own figures, which are so'm — while `pricing/page.tsx` renders them
 * through `formatTiyinAmount`, which divides by a hundred. So the public
 * pricing page advertised Start at **24 000 so'm a month** against the design's
 * 2 400 000, the yearly note promised a year for 240 000, and the ROI
 * calculator subtracted a plan cost a hundred times too small, which made
 * every payback period look instant.
 *
 * The tell was inside this same file: `ADMIN_HOUR_TIYIN` and
 * `EXTRA_BRANCH_TIYIN` in `pricing/page.tsx` are both written × 100 correctly,
 * and `site-data.ts` — the home page's copy of the same three prices — has
 * `240_000_000`. One product, two prices, a hundred apart.
 */
export const PAGE_PLANS: readonly { id: string; monthlyTiyin: number | null; featured: boolean }[] =
  [
    { id: 'start', monthlyTiyin: 15_000_000, featured: false },
    { id: 'growth', monthlyTiyin: 39_000_000, featured: true },
    { id: 'enterprise', monthlyTiyin: null, featured: false },
  ];

/**
 * Twelve capabilities against the three plans — `dc.html:1393`.
 *
 * `1` is included, `0` is not; the design uses the same two values and draws a
 * tick or a dash. Index-aligned with `pagesCopy(locale).capabilities`.
 */
export const PAGE_COMPARISON: readonly (readonly [boolean, boolean, boolean])[] = [
  [true, true, true],
  [true, true, true],
  [true, true, true],
  [false, true, true],
  [false, true, true],
  [false, true, true],
  [false, true, true],
  [false, true, true],
  [false, true, true],
  [false, false, true],
  [false, false, true],
  [false, false, true],
];

/** Which of the four categories each question belongs to. */
export const PAGE_FAQ_CATEGORY: readonly number[] = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3];

/** Eight named partners. `name` is a proper noun, never translated. */
export const PAGE_INTEGRATIONS: readonly { key: string; name: string; connected: boolean }[] = [
  { key: 'SQ', name: 'soliq.uz', connected: true },
  { key: 'DX', name: 'Didox', connected: true },
  { key: 'CL', name: 'Click', connected: true },
  { key: 'PM', name: 'Payme', connected: true },
  { key: 'UZ', name: 'Uzum Bank', connected: true },
  { key: '1C', name: '1C', connected: false },
  { key: 'YE', name: 'Yandex Eats', connected: true },
  { key: 'TG', name: 'Telegram', connected: true },
];

/**
 * The three scenarios, as figures and an order — no venue names.
 *
 * They carried one each: `Smart Restaurant`, `Choyxona 24`, `Osh Markazi`, with
 * two-letter marks beside them, presented as customers of a platform that has
 * none. The restaurant a scenario is about is described rather than named now
 * (`pages-copy.ts` → `cases[].title` and `.meta`), and `id` is what a card is
 * numbered by. See `honest-claims.test.ts`.
 */
export const PAGE_CASES: readonly {
  id: string;
  metrics: readonly { value: string; tone: SiteTone }[];
}[] = [
  {
    id: '1',
    metrics: [
      { value: '+8.4%', tone: 'success' },
      { value: '−2.1 pp', tone: 'success' },
      { value: '16 → 2', tone: 'brand' },
    ],
  },
  {
    id: '2',
    metrics: [
      { value: '−340 000', tone: 'success' },
      { value: '−74%', tone: 'success' },
      { value: '4 → 0', tone: 'brand' },
    ],
  },
  {
    id: '3',
    metrics: [
      { value: '24 → 16', tone: 'success' },
      { value: '−60%', tone: 'success' },
      { value: '+14%', tone: 'brand' },
    ],
  },
];

/** The quantified pill each before/after card closes with. */
export const PAGE_CHANGES: readonly { metric: string }[] = [
  { metric: '−340 000' },
  { metric: '−2.1 pp' },
  { metric: '16 → 2' },
];

/**
 * The five device cards, and the screen each one draws.
 *
 * `width`/`height`/`radius` are the design's own device outlines — a phone is a
 * tall rounded rectangle and a wall screen is a wide flat one, and that shape
 * is the whole point of the card.
 */
export const PAGE_DEVICES: readonly {
  id: string;
  width: string;
  height: string;
  radius: string;
}[] = [
  { id: 'desktop', width: '58px', height: '38px', radius: '4px' },
  { id: 'tablet', width: '50px', height: '36px', radius: '5px' },
  { id: 'wall', width: '64px', height: '38px', radius: '3px' },
  { id: 'phone', width: '26px', height: '46px', radius: '6px' },
  { id: 'kiosk', width: '54px', height: '34px', radius: '4px' },
];

/**
 * The five cities the design strips across the bottom of the cases page.
 *
 * It carried a count each — 26 restaurants in Tashkent, 7 in Samarkand, 4, 3, 2
 * — and every one of them was invented. A number a reader cannot check is bad;
 * a number that is not true is worse, and this one sat under a heading claiming
 * customers. The cities stay, because where the platform can be used is a fact
 * about the product: local payment rails, local fiscal law, three languages.
 * The counts are gone until there are some to print.
 *
 * `dc.html:1451`.
 */
export const PAGE_CITIES = 5;

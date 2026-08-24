/**
 * MyPOS Marketplace — the consumer side.
 *
 * `specs/11-marketplace-web.md` and `12-marketplace-app.md`. Four screens each,
 * and the design draws them twice because one is a website read on a desktop
 * and one is an app held in a hand. **They are built once here and rendered
 * responsively**, and that is a decision rather than a shortcut: the two sets
 * differ in chrome and in nothing else — the same stores, the same cards, the
 * same basket, the same five-step rail — and two implementations of a
 * marketplace home screen is two of everything to keep in step, starting with
 * the commission arithmetic.
 *
 * What the design's app framing adds and this keeps: a bottom dock instead of a
 * header nav below 640px, and full-bleed cards rather than a grid.
 *
 * The honest part: **there is no marketplace backend at all.** No module, no
 * schema, no endpoints, no `marketplace` order channel, and no merchant role —
 * `GAPS.md K2` calls the supply side the largest gap in the ecosystem and it is
 * right. Everything below is a fixture in the shape the endpoints will answer,
 * and every screen that would write says so on itself.
 */

import type { DishImage } from '../media/image';

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/* ------------------------------------------------------------- discovery */

/**
 * A cuisine chip. `short` is the monogram drawn inside the circle.
 *
 * The design sets a three- or four-letter abbreviation in 15px/700, not a
 * picture — `MyPOS Marketplace - Sayt.dc.html:921-934`. This list held emoji,
 * and two things were wrong with that. The rule first: `FOUNDATIONS §8` allows
 * emoji in the Telegram bot and nowhere else, and a check of all fourteen
 * design files finds them in exactly one — the Telegram file. Then the harder
 * problem: an emoji set has no plov, no somsa, no manti and no choyxona, so the
 * categories had been quietly swapped for the ones the emoji keyboard does
 * have — sushi, ramen, croissant — and an Uzbek marketplace lost the four
 * things people actually order.
 */
export type Cuisine = { key: string; short: string; label: Trilingual };

/** Twelve circles, which is what fits two rows on a phone without scrolling. */
export const CUISINES: readonly Cuisine[] = [
  { key: 'osh', short: 'Osh', label: { uz: 'Osh', ru: 'Плов', en: 'Plov' } },
  { key: 'lavash', short: 'Lav', label: { uz: 'Lavash', ru: 'Лаваш', en: 'Lavash' } },
  { key: 'burger', short: 'Brg', label: { uz: 'Burger', ru: 'Бургеры', en: 'Burgers' } },
  { key: 'pizza', short: 'Piz', label: { uz: 'Pitsa', ru: 'Пицца', en: 'Pizza' } },
  { key: 'shashlik', short: 'Shs', label: { uz: 'Shashlik', ru: 'Шашлык', en: 'Kebab' } },
  { key: 'somsa', short: 'Som', label: { uz: 'Somsa', ru: 'Самса', en: 'Samsa' } },
  { key: 'manti', short: 'Man', label: { uz: 'Manti', ru: 'Манты', en: 'Manti' } },
  { key: 'choyxona', short: 'Choy', label: { uz: 'Choyxona', ru: 'Чайхана', en: 'Choyxona' } },
  { key: 'sweets', short: 'Shir', label: { uz: 'Shirinlik', ru: 'Десерты', en: 'Desserts' } },
  { key: 'healthy', short: 'Sog', label: { uz: "Sog'lom", ru: 'Здоровое', en: 'Healthy' } },
  { key: 'quick', short: 'Tez', label: { uz: 'Tez tayyor', ru: 'Быстро', en: 'Quick' } },
  { key: 'coffee', short: 'Kaf', label: { uz: 'Kofe', ru: 'Кофе', en: 'Coffee' } },
];

/* ============================================================
   The phone app draws a shorter rail — `Ilova.dc.html:476-483`
   ============================================================ */

/**
 * The eight verticals the native app's rail carries, in the design's order.
 *
 * `VERTICALS` above is the WEBSITE's rail — fifteen rows in a sidebar, from
 * `Sayt.dc.html`. The app's design file draws eight chips across the top of the
 * home screen, and the phone was rendering all fifteen plus an "all" chip: a
 * sixteen-chip rail where the drawing has eight, with seven verticals nobody
 * had designed a phone treatment for.
 *
 * Two files, two surfaces, and each is the authority for its own. The keys are
 * the shared ones so a chip is still a query the endpoint understands.
 */
export const APP_VERTICALS: readonly string[] = [
  'food',
  'grocery',
  'bakery',
  'drinks',
  'pharmacy',
  'flowers',
  'electronics',
];

/**
 * The eight cuisine circles the app draws — `Ilova.dc.html:487-495`.
 *
 * Osh · Lavash · Burger · Pitsa · Shashlik · Somsa · Choyxona · Shirinlik. The
 * website's twelve add Manti, Sog'lom, Tez tayyor and Kofe; the phone's rail is
 * eight wide and the design says which eight.
 */
export const APP_CUISINES: readonly string[] = [
  'osh',
  'lavash',
  'burger',
  'pizza',
  'shashlik',
  'somsa',
  'choyxona',
  'sweets',
];

export type FilterKey = 'offers' | 'freeDelivery' | 'under30' | 'rated' | 'openNow' | 'sort';

/**
 * Six chips, and the last one is a sort rather than a filter.
 *
 * `Sayt.dc.html:1035-1042` lists all six in one row and gives two of them a
 * coloured dot — red for offers, brand for free delivery. The dot is the
 * design's way of saying *these two change what you pay*, which the other four
 * do not; a row of six identical pills makes the guest read all six.
 */
export const FILTERS: readonly FilterKey[] = [
  'offers',
  'freeDelivery',
  'under30',
  'rated',
  'openNow',
  'sort',
];

/** The dot the design paints on two of the six chips. */
export const FILTER_DOT: Readonly<Partial<Record<FilterKey, string>>> = {
  offers: 'var(--danger-500)',
  freeDelivery: 'var(--brand-500)',
};

export type Store = {
  id: string;
  /** A restaurant trades under one name in every language. */
  name: string;
  /** What it sells, as the card's own subtitle — the design's `kind`. */
  kind: Trilingual;
  /** Which cuisine circle it answers to. */
  cuisine: string;
  rating: number;
  reviews: number;
  /** Tiyin. Zero means free. */
  deliveryFee: number;
  distanceKm: number;
  /** The delivery window the card prints, both ends. */
  minutesFrom: number;
  minutesTo: number;
  offer?: Trilingual;
  /** Which colour the offer badge wears. The design gives it three. */
  offerTone?: 'brand' | 'warning' | 'danger';
  open: boolean;
  /** Two letters, for the rows that have no room for a picture. */
  initials: string;
  /** A flat tint standing in for the photograph the design slots here. */
  tint: string;
};

export const STORES: readonly Store[] = [
  {
    id: 'osh',
    name: 'Osh Xona',
    kind: {
      uz: 'Milliy taomlar · osh markazi',
      ru: 'Национальная кухня · плов',
      en: 'Uzbek · plov house',
    },
    cuisine: 'osh',
    rating: 4.9,
    reviews: 1_240,
    deliveryFee: som(12_000),
    distanceKm: 1.2,
    minutesFrom: 25,
    minutesTo: 35,
    offer: { uz: 'Yangi narxlar', ru: 'Новые цены', en: 'New prices' },
    offerTone: 'warning',
    open: true,
    initials: 'OX',
    tint: '#C2410C',
  },
  {
    id: 'smart',
    name: 'Smart Restaurant',
    kind: {
      uz: 'Milliy · burger · pitsa',
      ru: 'Национальная · бургеры · пицца',
      en: 'Uzbek · burgers · pizza',
    },
    cuisine: 'osh',
    rating: 4.8,
    reviews: 2_100,
    deliveryFee: 0,
    distanceKm: 1.8,
    minutesFrom: 20,
    minutesTo: 30,
    offer: { uz: 'Bepul yetkazish', ru: 'Бесплатная доставка', en: 'Free delivery' },
    offerTone: 'brand',
    open: true,
    initials: 'SR',
    tint: '#2E74EA',
  },
  {
    id: 'navruz',
    name: 'Choyxona Navruz',
    kind: { uz: 'Choyxona · shashlik', ru: 'Чайхана · шашлык', en: 'Choyxona · kebab' },
    cuisine: 'choyxona',
    rating: 4.7,
    reviews: 860,
    deliveryFee: som(9_000),
    distanceKm: 2.4,
    minutesFrom: 30,
    minutesTo: 40,
    open: true,
    initials: 'CN',
    tint: '#0F766E',
  },
  {
    id: 'baraka',
    name: 'Lavash Baraka',
    kind: { uz: 'Lavash · tez tayyor', ru: 'Лаваш · фастфуд', en: 'Lavash · fast food' },
    cuisine: 'lavash',
    rating: 4.6,
    reviews: 3_400,
    deliveryFee: som(8_000),
    distanceKm: 0.9,
    minutesFrom: 15,
    minutesTo: 25,
    offer: { uz: '−20% ikkinchi lavash', ru: '−20% на второй', en: '−20% second one' },
    offerTone: 'danger',
    open: true,
    initials: 'LB',
    tint: '#7C3AED',
  },
  {
    id: 'roma',
    name: 'Pizza Roma',
    kind: { uz: 'Pitsa · pasta', ru: 'Пицца · паста', en: 'Pizza · pasta' },
    cuisine: 'pizza',
    rating: 4.5,
    reviews: 1_900,
    deliveryFee: som(10_000),
    distanceKm: 3.1,
    minutesFrom: 25,
    minutesTo: 35,
    open: true,
    initials: 'PR',
    tint: '#DC2626',
  },
  {
    id: 'milliy',
    name: 'Milliy Taomlar',
    kind: {
      uz: "Milliy · to'y oshi",
      ru: 'Национальная · свадебный плов',
      en: 'Uzbek · wedding plov',
    },
    cuisine: 'osh',
    rating: 4.8,
    reviews: 640,
    deliveryFee: som(15_000),
    distanceKm: 4.6,
    minutesFrom: 35,
    minutesTo: 45,
    open: true,
    initials: 'MT',
    tint: '#B45309',
  },
  {
    id: 'burger',
    name: 'Burger Xona',
    kind: { uz: 'Burger · qanotcha', ru: 'Бургеры · крылышки', en: 'Burgers · wings' },
    cuisine: 'burger',
    rating: 4.4,
    reviews: 2_800,
    deliveryFee: som(8_000),
    distanceKm: 1.5,
    minutesFrom: 15,
    minutesTo: 25,
    open: true,
    initials: 'BX',
    tint: '#1F2533',
  },
  {
    /*
     * Closed, on purpose. The design keeps one store shut so the dimmed card
     * and its "Yopiq" overlay are a state somebody has actually looked at
     * rather than a branch nobody ever renders.
     */
    id: 'shashlik',
    name: 'Shashlik Markazi',
    kind: { uz: 'Shashlik · kabob', ru: 'Шашлык · кебаб', en: 'Kebab · grill' },
    cuisine: 'shashlik',
    rating: 4.7,
    reviews: 1_100,
    deliveryFee: som(12_000),
    distanceKm: 2.9,
    minutesFrom: 30,
    minutesTo: 40,
    open: false,
    initials: 'SM',
    tint: '#166534',
  },
];

/** The three rails the home screen carries, in the design's order. */
export type Rail = { key: 'offers' | 'fast' | 'top'; storeIds: readonly string[] };

export const RAILS: readonly Rail[] = [
  /* Offers first because that is what a rail is for; then the two that answer
     the guest's actual questions — how soon, and is it any good. Every id here
     has to exist in STORES or the rail renders a hole. */
  { key: 'offers', storeIds: ['osh', 'smart', 'baraka'] },
  { key: 'fast', storeIds: ['baraka', 'burger', 'smart'] },
  { key: 'top', storeIds: ['osh', 'smart', 'milliy'] },
];

export const storeById = (id: string): Store | undefined => STORES.find((store) => store.id === id);

/* ----------------------------------------------------------------- store */

export type MpDish = {
  id: string;
  name: Trilingual;
  category: Trilingual;
  price: number;
  /** The price before a sale, struck through when present. */
  was?: number;
  soldOut?: boolean;
  /**
   * The photograph at every size — see `media/image.ts`.
   *
   * `undefined` is a fixture dish (the literals below carry none, and the
   * store board draws the shop's tint there, as the design does); `null` is a
   * live dish the merchant has not photographed, drawn the same way. Optional
   * so the fixture stays a transcription of the design and nothing more.
   */
  image?: DishImage | null;
};

export const STORE_MENU: readonly MpDish[] = [
  {
    id: 'm1',
    name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
    category: { uz: 'Asosiy', ru: 'Основное', en: 'Mains' },
    price: som(44_000),
    was: som(48_000),
  },
  {
    id: 'm2',
    name: { uz: "Lag'mon", ru: 'Лагман', en: 'Lagman' },
    category: { uz: 'Asosiy', ru: 'Основное', en: 'Mains' },
    price: som(52_000),
  },
  {
    id: 'm3',
    name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pieces' },
    category: { uz: 'Asosiy', ru: 'Основное', en: 'Mains' },
    price: som(38_000),
  },
  {
    id: 'm4',
    name: { uz: "Shashlik, qo'y", ru: 'Шашлык из баранины', en: 'Lamb shashlik' },
    category: { uz: 'Kabob', ru: 'Шашлык', en: 'Grill' },
    price: som(46_000),
  },
  {
    id: 'm5',
    name: { uz: 'Somsa, mol', ru: 'Самса с говядиной', en: 'Beef somsa' },
    category: { uz: 'Kabob', ru: 'Шашлык', en: 'Grill' },
    price: som(12_000),
    soldOut: true,
  },
  {
    id: 'm6',
    name: { uz: 'Achchiq-chuchuk', ru: 'Ачик-чучук', en: 'Achichuk salad' },
    category: { uz: 'Salat', ru: 'Салаты', en: 'Salads' },
    price: som(18_000),
  },
  {
    id: 'm7',
    name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' },
    category: { uz: 'Ichimlik', ru: 'Напитки', en: 'Drinks' },
    price: som(8_000),
  },
];

/* ---------------------------------------------------------------- basket */

export type AddressOption = { key: string; label: Trilingual; detail: Trilingual };

export const ADDRESSES: readonly AddressOption[] = [
  {
    key: 'home',
    label: { uz: 'Uy', ru: 'Дом', en: 'Home' },
    detail: {
      uz: 'Bunyodkor 12, 24-xonadon',
      ru: 'Бунёдкор 12, кв. 24',
      en: 'Bunyodkor 12, flat 24',
    },
  },
  {
    key: 'work',
    label: { uz: 'Ish', ru: 'Работа', en: 'Work' },
    detail: {
      uz: 'Navoiy 44/2, ofis 501',
      ru: 'Навои 44/2, офис 501',
      en: 'Navoiy 44/2, office 501',
    },
  },
  {
    key: 'other',
    label: { uz: 'Boshqa manzil', ru: 'Другой адрес', en: 'Somewhere else' },
    detail: { uz: 'Xaritadan tanlang', ru: 'Выберите на карте', en: 'Pick it on the map' },
  },
];

export type PayRail = 'click' | 'payme' | 'uzum' | 'cash';

export const PAY_RAILS: readonly PayRail[] = ['click', 'payme', 'uzum', 'cash'];

/**
 * What each rail wears on its button — `Ilova.dc.html:262-270`.
 *
 * Four short marks and four colours, and these are the only hex values in this
 * module besides a store's tint. That is deliberate rather than sloppy: Click's
 * blue and Payme's teal belong to those companies, not to this platform's
 * palette, so no theme token can hold them and no screen should re-invent them.
 * A guest picking a payment method finds their wallet by its colour before they
 * read the word next to it.
 *
 * `NAQD` stays Uzbek in all three languages because it is drawn as a logo tile
 * beside three other logos, and a tile that changes width with the language
 * makes the column of four ragged.
 */
export type PayRailMark = { logo: string; tint: string };

export const PAY_RAIL_MARKS: Readonly<Record<PayRail, PayRailMark>> = {
  click: { logo: 'CLICK', tint: '#0A5CD6' },
  payme: { logo: 'PAYME', tint: '#00CCCC' },
  uzum: { logo: 'UZUM', tint: '#7000FF' },
  cash: { logo: 'NAQD', tint: '#4C5568' },
};

/**
 * The one promo code the fixtures know, and what it takes off.
 *
 * `Sayt.dc.html:1288-1296` and `Ilova.dc.html:592` both spend it: the site
 * offers a field to type it into, the app shows it already applied on the
 * summary. One code, one discount, one home — a five-thousand written twice is
 * a five-thousand that will one day be four on one screen and five on another,
 * and the guest reading both is the one who notices.
 */
export const MP_PROMO = { code: 'OSH2026', discount: som(5_000) } as const;

/**
 * The marketplace's own service charge, as a percentage.
 *
 * Three per cent, and it is **not** the restaurant's ten per cent service —
 * that one is dine-in only and never appears on a delivery. This is what the
 * marketplace charges the guest for running the platform, and it is a separate
 * line on the summary for exactly that reason: a guest who sees one "service"
 * line and knows the restaurant does not charge for delivery service concludes
 * they are being double-charged.
 */
export const MARKETPLACE_SERVICE_PERCENT = 3;

/* -------------------------------------------------------------- tracking */

export type MpStep = 'placed' | 'accepted' | 'cooking' | 'courier' | 'delivered';

export const MP_LADDER: readonly MpStep[] = [
  'placed',
  'accepted',
  'cooking',
  'courier',
  'delivered',
];

export const MP_ORDER = {
  number: 'MP-8421',
  /*
   * `'osh'`, the id `STORES` actually uses. This read `'osh-xona'` — the
   * restaurant's slug on the *web* side — and matched no store, so
   * `storeById()` answered `undefined` and the tracking screen fell back to a
   * nameless order. Both builds read this one field; it has to be the key the
   * list is keyed by.
   */
  storeId: 'osh',
  reached: 3,
  stamps: ['19:02', '19:03', '19:11', '19:34', '—'] as const,
  /**
   * When it arrives, and how long that still is — `Ilova.dc.html:311-313`.
   *
   * Two numbers rather than one, because they answer different questions: a
   * clock time is what a person plans around ("I'll eat at 11:38") and a
   * countdown is what they check while waiting. The design prints both, in that
   * order, and the second is a minute count rather than a formatted phrase so
   * every language can wrap its own words around it.
   */
  eta: '11:38',
  minutesLeft: 9,
  courier: {
    name: { uz: 'Oybek S.', ru: 'Ойбек С.', en: 'Oybek S.' } as Trilingual,
    rating: 4.9,
    deliveries: 1_842,
    distanceKm: 1.4,
  },
  total: som(186_000),
  paidWith: {
    uz: 'Click · **** 4417',
    ru: 'Click · **** 4417',
    en: 'Click · **** 4417',
  } as Trilingual,
};

/* ------------------------------------------------------- merchant panel */

/**
 * What the marketplace keeps, as a percentage.
 *
 * **Nine, and it is the argument.** All three marketplace design files carry it:
 * the site's third reason to join is literally "Komissiya 9%, 27% emas", the
 * merchant panel prints "Komissiya 9%" on every order card, and `GAPS.md §5`
 * lists it among the canonical figures. This said fifteen, which made the
 * platform's own sales pitch a lie and — worse — disagreed with
 * `merchant-copy.ts`, so one product showed a merchant 15% on the catalogue
 * screen and 9% on the settlement screen beside it.
 *
 * Change it here and nowhere else: every screen on both sides of the
 * marketplace that prints a cut reads this one number.
 *
 * The merchant panel's own records — its queue, its catalogue, its payouts —
 * used to sit under this line, and they disagreed with the design: two orders
 * against six, five dishes against nine, and a `netOf()` answering a column the
 * design does not have. They live in `(merchant)/merchant-data.ts` now,
 * transcribed from the design file, and this module keeps only the number both
 * sides of the marketplace share.
 */
export const MARKETPLACE_COMMISSION_PERCENT = 9;

/* ============================================================
   Orders and profile — `Ilova.dc.html:358-440`

   The app's fourth and fifth screens. `ORDERS` is the design's own list and it
   carries all four states a customer's history has: one live, two delivered
   (one of which is still un-rated) and one they cancelled. A list that only
   ever showed delivered orders would never draw the row a customer actually
   opens this screen for.
   ============================================================ */

export type MpOrderState = 'live' | 'delivered' | 'past' | 'cancelled';

export type MpOrder = {
  id: string;
  store: string;
  /** Tiyin, like every amount on this platform. */
  total: number;
  state: MpOrderState;
  /** Delivered and not yet rated — the row that grows a star strip. */
  canRate: boolean;
};

export const MP_ORDERS: readonly MpOrder[] = [
  { id: '#4471', store: 'Osh Xona', total: som(134_720), state: 'live', canRate: false },
  { id: '#4462', store: 'Lavash Baraka', total: som(84_000), state: 'delivered', canRate: true },
  { id: '#4418', store: 'Choyxona Navruz', total: som(74_000), state: 'past', canRate: false },
  { id: '#4390', store: 'Pizza Roma', total: som(56_000), state: 'cancelled', canRate: false },
];

/** The six settings rows the profile screen lists. */
export const MP_PROFILE_ROWS: readonly string[] = [
  'addresses',
  'payment',
  'plus',
  'notifications',
  'language',
  'help',
];

/* ============================================================
   The fifteen verticals — `Sayt.dc.html:140-176`, `VERTICALS` at `:907-923`

   The marketplace's left rail, and the single most load-bearing piece of the
   consumer story: it is what says this is a marketplace rather than a food
   delivery app that might grow into one. Four are live and carry a count —
   412 · 86 · 54 · 31 — and eleven are drawn greyed with "Tez orada" beside
   them.

   **Building only the four live ones would have been the wrong shortcut.** The
   architecture note on the home screen (`archH`/`archP` below) exists to
   explain the eleven: a pharmacy needs a licence, alcohol needs age checks and
   hours, flowers need a delivery window. A rail with four rows makes that
   paragraph talk about something the reader cannot see.
   ============================================================ */

export type Vertical = {
  key: string;
  label: Trilingual;
  /** How many stores trade in it today. Zero on the eleven that are not open. */
  count: number;
  live: boolean;
  /** The design's own 24×24 stroked glyph, as a path. `VICON` at `:874-891`. */
  path: string;
};

export const VERTICALS: readonly Vertical[] = [
  {
    key: 'food',
    label: { uz: 'Ovqat', ru: 'Еда', en: 'Food' },
    count: 412,
    live: true,
    path: 'M4 11h16a8 8 0 0 1-16 0zM7.5 11V5M11.5 11V4M15.5 11V5',
  },
  {
    key: 'grocery',
    label: { uz: 'Oziq-ovqat', ru: 'Продукты', en: 'Grocery' },
    count: 86,
    live: true,
    path: 'M5 9h14l-1.4 10.3a2 2 0 0 1-2 1.7H8.4a2 2 0 0 1-2-1.7L5 9zM9 9V6a3 3 0 0 1 6 0v3',
  },
  {
    key: 'bakery',
    label: { uz: 'Non va shirinlik', ru: 'Выпечка', en: 'Bakery' },
    count: 54,
    live: true,
    path: 'M4 13a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2zM8.5 9V7M12 9V6M15.5 9V7',
  },
  {
    key: 'drinks',
    label: { uz: 'Ichimliklar', ru: 'Напитки', en: 'Drinks' },
    count: 31,
    live: true,
    path: 'M6.5 8h11l-1 11.2a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6.5 8zM9.5 8V4.5h5V8',
  },
  {
    key: 'pharmacy',
    label: { uz: 'Dorixona', ru: 'Аптека', en: 'Pharmacy' },
    count: 0,
    live: false,
    path: 'M10.5 3.5 3.5 10.5a5 5 0 0 0 7 7l7-7a5 5 0 0 0-7-7zM7 7l10 10',
  },
  {
    key: 'alcohol',
    label: { uz: 'Alkogol', ru: 'Алкоголь', en: 'Alcohol' },
    count: 0,
    live: false,
    path: 'M10 3h4v3.8l2 3.2V21H8V10l2-3.2V3zM8 14h8',
  },
  {
    key: 'flowers',
    label: { uz: 'Gullar', ru: 'Цветы', en: 'Flowers' },
    count: 0,
    live: false,
    path: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9V4M12 15v5M9 12H4M15 12h5',
  },
  {
    key: 'beauty',
    label: { uz: "Go'zallik", ru: 'Красота', en: 'Beauty' },
    count: 0,
    live: false,
    path: 'M12 20s-7-4.4-7-9.4A4 4 0 0 1 12 7a4 4 0 0 1 7 3.6c0 5-7 9.4-7 9.4z',
  },
  {
    key: 'baby',
    label: { uz: 'Bolalar', ru: 'Детское', en: 'Baby' },
    count: 0,
    live: false,
    path: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 21v-2a6 6 0 0 1 12 0v2',
  },
  {
    key: 'household',
    label: { uz: "Uy-ro'zg'or", ru: 'Для дома', en: 'Household' },
    count: 0,
    live: false,
    path: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  },
  {
    key: 'pet',
    label: { uz: 'Hayvonlar', ru: 'Зоотовары', en: 'Pet' },
    count: 0,
    live: false,
    path: 'M6.5 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 15.5a3 3 0 1 1 6 0c0 2.2-1.1 4.5-3 4.5s-3-2.3-3-4.5z',
  },
  {
    key: 'electronics',
    label: { uz: 'Elektronika', ru: 'Электроника', en: 'Electronics' },
    count: 0,
    live: false,
    path: 'M3 5h18v11H3zM9 20h6M12 16v4',
  },
  {
    key: 'gifts',
    label: { uz: "Sovg'alar", ru: 'Подарки', en: 'Gifts' },
    count: 0,
    live: false,
    path: 'M4 11h16v9.5H4zM3 7h18v4H3zM12 7v13.5',
  },
  {
    key: 'books',
    label: { uz: 'Kitob va kanselyariya', ru: 'Книги и канцтовары', en: 'Books & stationery' },
    count: 0,
    live: false,
    path: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5zM8 3v18',
  },
  {
    key: 'hardware',
    label: { uz: 'Qurilish', ru: 'Стройтовары', en: 'Hardware' },
    count: 0,
    live: false,
    path: 'M15.5 3.5a4.2 4.2 0 0 0-4 6.8L4 17.8 6.2 20l7.5-7.5a4.2 4.2 0 0 0 6.8-4l-2.8 1-2-2 .8-3z',
  },
];

/**
 * Find a store by name, by what it sells, or by the words on its badge.
 *
 * The design's `hits(q)` — `Sayt.dc.html:936-943` — and the three fields it
 * searches are the point: a guest typing "bepul" is looking for free delivery
 * and that phrase lives only on a badge, while "lavash" is a kind rather than
 * a name. Searching the name alone answers neither.
 *
 * All three languages of every translated field are searched, not just the one
 * on screen: somebody typing Russian into an Uzbek page still means the same
 * restaurant.
 */
export const searchStores = (query: string): readonly Store[] => {
  const needle = query.trim().toLowerCase();

  if (needle === '') return STORES;

  const flatten = (text: Trilingual | undefined): string =>
    text === undefined ? '' : Object.values(text).join(' ').toLowerCase();

  return STORES.filter(
    (store) =>
      store.name.toLowerCase().includes(needle) ||
      flatten(store.kind).includes(needle) ||
      flatten(store.offer).includes(needle),
  );
};

/* ------------------------------------------------------ home, lower half */

/**
 * The two banners above the store grid — `Sayt.dc.html:214-231`.
 *
 * One is a restaurant's offer and one is the platform's subscription, and they
 * are deliberately not the same shape of promise: the first costs the
 * restaurant money and the second costs the guest 39 000 a month. The tag
 * colour is what separates them at a glance.
 */
export type PromoBanner = { key: 'offer' | 'plus'; tone: 'danger' | 'brand' };

export const PROMO_BANNERS: readonly PromoBanner[] = [
  { key: 'offer', tone: 'danger' },
  { key: 'plus', tone: 'brand' },
];

/**
 * "Yaqin atrofda" — nine circles, `Sayt.dc.html:425-443`.
 *
 * The design builds them as `STORES.concat(STORES.slice(0, 1))`: eight stores
 * and the nearest one again, because a rail of eight leaves a gap on a wide
 * screen and the ninth is a real store rather than a filler tile.
 */
export const NEARBY: readonly Store[] = [...STORES, ...STORES.slice(0, 1)];

/** Four reasons, numbered — `whys` at `Sayt.dc.html:1201-1206`. */
export const WHY_COUNT = 4;

/** The three-phase rollout table beside them — `phases` at `:1208-1212`. */
export type Phase = {
  key: 'live' | 'licence' | 'density';
  tone: 'success' | 'warning' | 'neutral';
};

export const PHASES: readonly Phase[] = [
  { key: 'live', tone: 'success' },
  { key: 'licence', tone: 'warning' },
  { key: 'density', tone: 'neutral' },
];

/* ---------------------------------------------------------------- modals */

/**
 * The address book — `Sayt.dc.html:724-756`.
 *
 * Three saved addresses and the third one is outside the delivery zone. That
 * row is the whole reason this is a sheet rather than a dropdown: it has to be
 * able to say *no*, and say why, and offer pickup instead. A picker that only
 * ever lists reachable addresses teaches a guest to trust it and then fails at
 * checkout.
 */
export type SavedAddress = {
  key: string;
  label: Trilingual;
  address: Trilingual;
  note: Trilingual;
  /** False when the address is outside the delivery zone. */
  deliverable: boolean;
};

export const SAVED_ADDRESSES: readonly SavedAddress[] = [
  {
    key: 'home',
    label: { uz: 'Uy', ru: 'Дом', en: 'Home' },
    address: {
      uz: 'Chilonzor 24, 3-podyezd, 47-xonadon',
      ru: 'Чиланзар 24, подъезд 3, кв 47',
      en: 'Chilonzor 24, entrance 3, flat 47',
    },
    note: {
      uz: '2.4 km · yetkazish 12 000',
      ru: '2.4 км · доставка 12 000',
      en: '2.4 km · 12 000 delivery',
    },
    deliverable: true,
  },
  {
    key: 'work',
    label: { uz: 'Ish', ru: 'Работа', en: 'Work' },
    address: {
      uz: 'Amir Temur 108, 4-qavat',
      ru: 'Амира Темура 108, 4 этаж',
      en: 'Amir Temur 108, 4th floor',
    },
    note: {
      uz: '5.1 km · yetkazish 18 000',
      ru: '5.1 км · доставка 18 000',
      en: '5.1 km · 18 000 delivery',
    },
    deliverable: true,
  },
  {
    key: 'parents',
    label: { uz: 'Ota-onam', ru: 'Родители', en: 'Parents' },
    address: {
      uz: 'Zangiota, Qorasuv 14',
      ru: 'Зангиата, Карасув 14',
      en: 'Zangiota, Qorasuv 14',
    },
    note: {
      uz: 'Yetkazish zonasidan tashqarida',
      ru: 'Вне зоны доставки',
      en: 'Outside the delivery zone',
    },
    deliverable: false,
  },
];

/** MyPOS Plus, four rows — `plusRows` at `Sayt.dc.html:1341-1346`. */
export type PlusRow = { label: Trilingual; value: Trilingual };

export const PLUS_ROWS: readonly PlusRow[] = [
  {
    label: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
    value: {
      uz: 'Bepul · har qanday summada',
      ru: 'Бесплатно · при любой сумме',
      en: 'Free · at any basket size',
    },
  },
  {
    label: { uz: 'Xizmat haqi', ru: 'Сервисный сбор', en: 'Service fee' },
    value: { uz: "3% · o'zgarmaydi", ru: '3% · без изменений', en: '3% · unchanged' },
  },
  {
    label: { uz: 'Narx', ru: 'Цена', en: 'Price' },
    value: { uz: '39 000 / oy', ru: '39 000 / мес', en: '39 000 / mo' },
  },
  {
    label: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancelling' },
    value: {
      uz: "Istalgan vaqt · jarima yo'q",
      ru: 'В любой момент · без штрафа',
      en: 'Any time · no penalty',
    },
  },
];

/** The subscription's price, in tiyin. `Sayt.dc.html:1344`. */
export const PLUS_MONTHLY = som(39_000);

/** Six rows about the store — `infoRows` at `Sayt.dc.html:1362-1369`. */
export type InfoRow = { label: Trilingual; value: Trilingual };

export const STORE_INFO_ROWS: readonly InfoRow[] = [
  {
    label: { uz: 'Manzil', ru: 'Адрес', en: 'Address' },
    value: {
      uz: 'Chilonzor 24, Toshkent · 2.4 km',
      ru: 'Чиланзар 24, Ташкент · 2.4 км',
      en: 'Chilonzor 24, Tashkent · 2.4 km',
    },
  },
  {
    label: { uz: 'Ish vaqti', ru: 'Часы работы', en: 'Hours' },
    value: {
      uz: 'Har kuni 09:00–23:00',
      ru: 'Ежедневно 09:00–23:00',
      en: 'Daily 09:00–23:00',
    },
  },
  {
    label: { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
    value: { uz: '+998 71 200 44 71', ru: '+998 71 200 44 71', en: '+998 71 200 44 71' },
  },
  {
    label: { uz: 'Filiallar', ru: 'Филиалы', en: 'Branches' },
    value: {
      uz: ' 5 ta · Chilonzor eng yaqin',
      ru: '5 · Чиланзар ближе всех',
      en: '5 · Chilonzor is nearest',
    },
  },
  {
    label: { uz: 'Allergenlar', ru: 'Аллергены', en: 'Allergens' },
    value: {
      uz: "Har bir taom sahifasida ko'rsatilgan",
      ru: 'Указаны на странице каждого блюда',
      en: 'Listed on every dish page',
    },
  },
  {
    label: { uz: "To'lov", ru: 'Оплата', en: 'Payment' },
    value: {
      uz: 'Karta, Click, Payme, naqd',
      ru: 'Карта, Click, Payme, наличные',
      en: 'Card, Click, Payme, cash',
    },
  },
];

/**
 * Four things that go wrong with a delivery, and what each one triggers —
 * `probReasons` at `Sayt.dc.html:1374-1379`.
 *
 * Two of them refund without a human: late, and missing. That is the design's
 * decision and it is stated on the option itself rather than discovered after
 * pressing send, because a guest who does not know a refund is automatic phones
 * an operator to ask.
 */
export type ProblemReason = {
  key: 'late' | 'missing' | 'cold' | 'wrong';
  label: Trilingual;
  outcome: Trilingual;
  /** True when the platform settles it without the store answering. */
  automatic: boolean;
};

export const PROBLEM_REASONS: readonly ProblemReason[] = [
  {
    key: 'late',
    label: {
      uz: 'Buyurtma juda kechikdi',
      ru: 'Заказ сильно опоздал',
      en: 'The order is very late',
    },
    outcome: {
      uz: "30 daqiqadan ko'p kechikkanda yetkazish narxi qaytariladi",
      ru: 'При опоздании свыше 30 минут доставка возвращается',
      en: 'Over 30 minutes late, the delivery fee comes back',
    },
    automatic: true,
  },
  {
    key: 'missing',
    label: { uz: 'Taom kelmadi', ru: 'Блюдо не привезли', en: 'An item is missing' },
    outcome: {
      uz: "20 000 so'mgacha avtomatik qaytariladi, fotosurat kerak emas",
      ru: 'До 20 000 сум возврат автоматический, фото не нужно',
      en: 'Up to 20 000 so’m it refunds automatically, no photo needed',
    },
    automatic: true,
  },
  {
    key: 'cold',
    label: {
      uz: 'Sovuq yoki sifatsiz',
      ru: 'Холодное или некачественное',
      en: 'Cold or poor quality',
    },
    outcome: {
      uz: "Fotosurat kerak · do'kon 2 soatda javob beradi",
      ru: 'Нужно фото · магазин ответит за 2 часа',
      en: 'A photo is required · the store answers within 2 hours',
    },
    automatic: false,
  },
  {
    key: 'wrong',
    label: { uz: 'Boshqa taom keldi', ru: 'Привезли не то', en: 'The wrong item arrived' },
    outcome: {
      uz: "To'liq qaytarish yoki almashtirish · tanlaysiz",
      ru: 'Полный возврат или замена · на ваш выбор',
      en: 'Full refund or a replacement · your choice',
    },
    automatic: false,
  },
];

/**
 * What cancelling costs, told before it is offered — `cxRows` at `:1391-1396`.
 *
 * The refundable amount is zero and the sheet says so on the row above the
 * button. A cancel dialogue that asks "are you sure?" without naming the number
 * is a dialogue that gets pressed and then disputed.
 */
export type CancelRow = { label: Trilingual; value: Trilingual; tone: 'fg' | 'danger' | 'warning' };

export const CANCEL_ROWS: readonly CancelRow[] = [
  {
    label: { uz: 'Buyurtma holati', ru: 'Статус заказа', en: 'Order state' },
    value: {
      uz: "Kuryer yo'lda · 9 daqiqa qoldi",
      ru: 'Курьер в пути · 9 минут',
      en: 'Courier en route · 9 minutes',
    },
    tone: 'fg',
  },
  {
    label: { uz: 'Taomlar tayyorlangan', ru: 'Блюда приготовлены', en: 'Food already cooked' },
    value: {
      uz: 'Ha · qaytarilmaydi',
      ru: 'Да · возврату не подлежит',
      en: 'Yes · not refundable',
    },
    tone: 'danger',
  },
  {
    label: { uz: 'Qaytariladigan summa', ru: 'Сумма возврата', en: 'Refund amount' },
    value: { uz: '0', ru: '0', en: '0' },
    tone: 'danger',
  },
  {
    label: { uz: "Operator tasdig'i", ru: 'Подтверждение оператора', en: 'Operator approval' },
    value: { uz: 'Kerak', ru: 'Требуется', en: 'Required' },
    tone: 'warning',
  },
];

/* ------------------------------------------------------- loyalty, profile */

/**
 * The points card at the top of the profile — `Ilova.dc.html:404-412`.
 *
 * A balance, a tier, a rail and the distance to the next tier. The rail is only
 * meaningful because the sentence under it names what it measures: 71% of the
 * way is nothing until it is "1 160 points to gold".
 */
export const MP_POINTS = {
  balance: 2_840,
  /** How far along the tier is, as the design's own 71%. */
  attainment: 71,
  toNextTier: 1_160,
} as const;

/** Four figures under the points card — `profStats` at `Ilova.dc.html:753-758`. */
export type ProfileStat = { key: string; value: Trilingual };

export const MP_PROFILE_STATS: readonly ProfileStat[] = [
  { key: 'orders', value: { uz: '47', ru: '47', en: '47' } },
  { key: 'spent', value: { uz: '4.2 mln', ru: '4.2 млн', en: '4.2 M' } },
  { key: 'average', value: { uz: '89 000', ru: '89 000', en: '89 000' } },
  { key: 'saved', value: { uz: '312 000', ru: '312 000', en: '312 000' } },
];

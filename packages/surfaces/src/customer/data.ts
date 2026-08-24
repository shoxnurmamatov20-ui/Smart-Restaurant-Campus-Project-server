/**
 * The customer app's shapes and its fixtures.
 *
 * House rule, and this surface needs it more than most: types and fixtures live
 * here, anything that calls the server lives in the sibling `customer-server.ts`.
 * The cart is a client component and imports values from this file, so a single
 * `next/headers` import reaching this module would break the build — see the
 * note at the top of tables-server.ts for the history.
 *
 * **Money is integer tiyin.** 1 so'm = 100 tiyin. The design file writes prices
 * in whole so'm (`48000`) because it is a drawing; every figure below goes
 * through `som()` so nothing in this app ever holds a so'm float. A guest
 * reading a hundredfold price is the bug this convention exists to prevent, and
 * the guest is the audience least able to tell it is a bug.
 *
 * **What is here is data, not copy.** Dish names, branch names, payment rails
 * and the currency word are content a restaurant owns and changes — they belong
 * in the database, arrive as `{uz, ru, en}` columns, and are seeded here in the
 * same shape. Interface text lives in `customer-copy.ts`. The line matters
 * beyond tidiness: `i18n.test.ts` rejects a catalogue key whose three languages
 * are identical, and "so'm" is identical in Uzbek and English.
 */

import type { OrderState as CanonicalOrderState } from '@restaurant/i18n/order-state';

import type { DishImage } from '../media/image';
import { CASH_ROUNDING_TIYIN, VAT_PERCENT as PRICING_VAT_PERCENT } from '../money/pricing';

/** The three languages, equal — Uzbek authors, none is a translation host. */
export type Lang = 'uz' | 'ru' | 'en';

/** The `{uz, ru, en}` jsonb column every guest-facing name is stored in. */
export type Trilingual = Readonly<Record<Lang, string>>;

/**
 * Read a stored name in the reader's language.
 *
 * Falls back to Uzbek rather than to an empty string: a dish a restaurant only
 * named in Uzbek should still be orderable by someone reading in English. An
 * empty line on a menu is a dish nobody buys.
 */
export function say(value: Trilingual, lang: Lang): string {
  return value[lang] || value.uz;
}

/** 1 UZS = 100 tiyin. Prices below are written as the design writes them. */
const som = (value: number): number => value * 100;

/**
 * The currency word, beside the figure rather than inside it.
 *
 * The design sets money as a number and a separate muted unit at a smaller
 * size, which a single formatted currency string cannot express — so
 * `formatTiyinAmount` returns the figure and this supplies the word. Uzbek and
 * English are the same string, which is why it is data and not a catalogue key.
 */
export const CURRENCY_WORD: Trilingual = { uz: "so'm", ru: 'сум', en: "so'm" };

/* ============================================================
   The rules that are not ours to choose

   Each of these is in DECISIONS.md or START-HERE §6 and is enforced in the
   schema. They are repeated here because the screens display them — the VAT
   line, the rounding note — and a screen displaying a different number than
   the ledger is worse than one displaying none.
   ============================================================ */

/**
 * 12%, and already inside the price. Never added at the till.
 *
 * Re-exported from the calculator rather than restated: the paragraph above
 * asks these to match the ledger, and two literals in two files is precisely
 * how they stop matching. `pricing.ts` states the percent; the fraction here is
 * derived from it, so changing the rate is one edit.
 */
export const VAT_PERCENT = PRICING_VAT_PERCENT;
export const VAT_RATE = PRICING_VAT_PERCENT / 100;

/** Cash settles to the nearest 1 000 so'm; the difference is a ledger line. */
export const CASH_ROUNDING = CASH_ROUNDING_TIYIN;

/** One point per 1 000 so'm spent; 100 points buys 1 000 so'm off. */
export const POINTS_PER = som(1_000);

/* ============================================================
   Where the food comes from
   ============================================================ */

export type Branch = {
  id: string;
  /** A branch is named after a district; the name is not translated. */
  name: string;
  address: string;
  /** Distance from the guest, as the design writes it. `null` = out of town. */
  km: string | null;
  /** The delivery window the branch quotes, in minutes. */
  eta: string;
  /** What this branch charges to deliver, in tiyin. */
  deliveryFee: number;
};

export const BRANCHES: readonly Branch[] = [
  {
    id: 'chilonzor',
    name: 'Chilonzor',
    address: 'Bunyodkor 12',
    km: '1.8',
    eta: '25–35',
    deliveryFee: som(12_000),
  },
  {
    id: 'yunusobod',
    name: 'Yunusobod',
    address: 'Amir Temur 108',
    km: '4.2',
    eta: '30–40',
    deliveryFee: som(12_000),
  },
  {
    id: 'sergeli',
    name: 'Sergeli',
    address: 'Yangi Sergeli 4',
    km: '7.6',
    eta: '40–55',
    deliveryFee: som(12_000),
  },
  {
    id: 'mirzo-ulugbek',
    name: "Mirzo Ulug'bek",
    address: 'Mustaqillik 71',
    km: '5.1',
    eta: '35–45',
    deliveryFee: som(12_000),
  },
  {
    // Another city, so no kilometre figure — and a higher fee, which is the
    // reason the fee is per branch rather than one constant.
    id: 'termiz',
    name: 'Termiz',
    address: 'Al-Xorazmiy 9',
    km: null,
    eta: '30–40',
    deliveryFee: som(15_000),
  },
];

/** Free delivery above this, which the home screen states before ordering. */
export const FREE_DELIVERY_OVER = som(250_000);

/* ============================================================
   The menu
   ============================================================ */

export type Category = { id: string; name: Trilingual };

export const CATEGORIES: readonly Category[] = [
  { id: 'national', name: { uz: 'Milliy taomlar', ru: 'Национальная', en: 'Uzbek' } },
  { id: 'burgers', name: { uz: 'Burgerlar', ru: 'Бургеры', en: 'Burgers' } },
  { id: 'pizza', name: { uz: 'Pitsa', ru: 'Пицца', en: 'Pizza' } },
  { id: 'lavash', name: { uz: 'Lavash', ru: 'Лаваш', en: 'Lavash' } },
  { id: 'salads', name: { uz: 'Salatlar', ru: 'Салаты', en: 'Salads' } },
  { id: 'drinks', name: { uz: 'Ichimliklar', ru: 'Напитки', en: 'Drinks' } },
];

export type Dish = {
  id: string;
  categoryId: string;
  name: Trilingual;
  description: Trilingual;
  /** Tiyin, VAT included — the menu price is what the guest pays. */
  price: number;
  rating: string;
  reviews: number;
  calories: number;
  /**
   * The kitchen has 86'd it. Comes from the stop list, which the POS and this
   * app read through the same endpoint — a dish pulled at the pass dims here
   * within the cache window rather than being ordered and then refunded.
   */
  soldOut: boolean;
  /**
   * The questions this kitchen actually asks about this dish, when the menu is
   * a live one.
   *
   * Absent on every fixture dish, and that absence is the difference between a
   * catalogue you can read and one you can order from. `MODIFIERS` and
   * `PORTIONS` below are five extras and three sizes invented for a demo: they
   * exist in no restaurant's database, and their ids are words rather than
   * numbers. `POST /api/v1/public/orders` prices every choice through
   * `MenuCatalog` and refuses one it was never offered, so sending
   * `'extra-meat'` up would refuse the whole basket.
   *
   * So a live dish carries the real sheet, with the real ids, and a screen
   * draws whichever it was handed. See `customerMenuFrom()`.
   */
  groups?: readonly ModifierGroup[];
  /**
   * The photograph at every size — see `media/image.ts`.
   *
   * Absent on every fixture dish, like `groups`: the demo menu has no uploads
   * and the `.c-shot` panel is what the design draws there. `null` on a live
   * dish the restaurant has not photographed — the same panel, honestly. The
   * screens read `dish.image ?? null` and never tell the two apart; the
   * distinction exists for the same reason it does on `groups`.
   */
  image?: DishImage | null;
};

/**
 * One question on the sheet — "Qanday o'lcham?", "Qo'shimchalar?".
 *
 * `min` and `max` are the kitchen's rules rather than the screen's taste, and
 * they are carried rather than approximated: a group with `min: 1` is a choice
 * a guest cannot skip (a size), and one with `max: 3` is an extras list that
 * stops. The server enforces both and refuses the line otherwise — so a screen
 * that guessed would produce baskets that pass locally and fail at the till.
 */
export type ModifierGroup = {
  id: string;
  title: Trilingual;
  /** Whether more than one choice may be taken. */
  multi: boolean;
  min: number;
  max: number;
  choices: readonly Modifier[];
};

export const DISHES: readonly Dish[] = [
  {
    id: 'osh',
    categoryId: 'national',
    name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
    description: {
      uz: "Devzira guruch, mol go'shti, sabzi va zira. Qozonda ochiq olovda pishiriladi.",
      ru: 'Рис девзира, говядина, морковь и зира. Готовится в казане на открытом огне.',
      en: 'Devzira rice, beef, carrot and cumin, cooked in a kazan over an open flame.',
    },
    price: som(48_000),
    rating: '4.8',
    reviews: 612,
    calories: 720,
    soldOut: false,
  },
  {
    id: 'lagmon',
    categoryId: 'national',
    name: { uz: "Achchiq lag'mon", ru: 'Острый лагман', en: 'Spicy lagman' },
    description: {
      uz: "Qo'lda cho'zilgan xamir, mol go'shti, bulg'or qalampiri va achchiq lazzat.",
      ru: 'Тесто ручной вытяжки, говядина, болгарский перец и острая заправка.',
      en: 'Hand-pulled noodles, beef, bell pepper and a chilli dressing.',
    },
    price: som(42_000),
    rating: '4.6',
    reviews: 341,
    calories: 640,
    soldOut: false,
  },
  {
    id: 'manti',
    categoryId: 'national',
    name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pcs' },
    description: {
      uz: "Bug'da pishirilgan, qo'y go'shti va piyoz. Qatiq bilan beriladi.",
      ru: 'На пару, баранина и лук. Подаётся с катыком.',
      en: 'Steamed, lamb and onion. Served with katyk.',
    },
    price: som(36_000),
    rating: '4.7',
    reviews: 288,
    calories: 520,
    soldOut: false,
  },
  {
    id: 'cheeseburger',
    categoryId: 'burgers',
    name: { uz: 'Chizburger', ru: 'Чизбургер', en: 'Cheeseburger' },
    description: {
      uz: "180 g mol go'shti kotleti, cheddar, bodring va uy sousi.",
      ru: 'Котлета из говядины 180 г, чеддер, огурец и домашний соус.',
      en: '180 g beef patty, cheddar, pickle and house sauce.',
    },
    price: som(39_000),
    rating: '4.5',
    reviews: 508,
    calories: 690,
    // On the stop list in the design, and kept that way: the sold-out state is
    // one of the four this screen has to draw, and a fixture where nothing is
    // ever sold out is a fixture that never exercises it.
    soldOut: true,
  },
  {
    id: 'double-burger',
    categoryId: 'burgers',
    name: { uz: 'Ikki qavat burger', ru: 'Двойной бургер', en: 'Double burger' },
    description: {
      uz: 'Ikkita kotlet, ikki qavat cheddar, karamellangan piyoz.',
      ru: 'Две котлеты, двойной чеддер, карамелизованный лук.',
      en: 'Two patties, double cheddar, caramelised onion.',
    },
    price: som(58_000),
    rating: '4.7',
    reviews: 402,
    calories: 940,
    soldOut: false,
  },
  {
    id: 'margherita',
    categoryId: 'pizza',
    name: { uz: 'Margherita, 30 sm', ru: 'Маргарита 30 см', en: 'Margherita 30 cm' },
    description: {
      uz: 'San Marzano pomidori, mozzarella fiordilatte, rayhon.',
      ru: 'Томаты San Marzano, моцарелла фиордилатте, базилик.',
      en: 'San Marzano tomato, fiordilatte mozzarella, basil.',
    },
    price: som(56_000),
    rating: '4.6',
    reviews: 377,
    calories: 860,
    soldOut: false,
  },
  {
    id: 'pepperoni',
    categoryId: 'pizza',
    name: { uz: 'Pepperoni, 30 sm', ru: 'Пепперони 30 см', en: 'Pepperoni 30 cm' },
    description: {
      uz: 'Achchiq pepperoni, mozzarella va oregano.',
      ru: 'Острая пепперони, моцарелла и орегано.',
      en: 'Spicy pepperoni, mozzarella and oregano.',
    },
    price: som(62_000),
    rating: '4.8',
    reviews: 449,
    calories: 980,
    soldOut: false,
  },
  {
    id: 'lavash',
    categoryId: 'lavash',
    name: { uz: 'Tovuqli lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
    description: {
      uz: 'Panjara tovuq, kartoshka, karam va sarimsoqli sous.',
      ru: 'Курица на гриле, картофель, капуста и чесночный соус.',
      en: 'Grilled chicken, potato, cabbage and garlic sauce.',
    },
    price: som(32_000),
    rating: '4.4',
    reviews: 631,
    calories: 610,
    soldOut: false,
  },
  {
    id: 'caesar',
    categoryId: 'salads',
    name: { uz: 'Sezar salat', ru: 'Салат Цезарь', en: 'Caesar salad' },
    description: {
      uz: 'Rimlik salat, parmezan, kruton va klassik sous.',
      ru: 'Романо, пармезан, крутоны и классический соус.',
      en: 'Romaine, parmesan, croutons and the classic dressing.',
    },
    price: som(34_000),
    rating: '4.3',
    reviews: 214,
    calories: 380,
    soldOut: true,
  },
  {
    id: 'cola',
    categoryId: 'drinks',
    name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
    description: { uz: 'Sovuq, muz bilan.', ru: 'Холодная, со льдом.', en: 'Chilled, with ice.' },
    price: som(12_000),
    rating: '4.2',
    reviews: 96,
    calories: 210,
    soldOut: false,
  },
  {
    id: 'green-tea',
    categoryId: 'drinks',
    name: { uz: "Ko'k choy, choynak", ru: 'Зелёный чай, чайник', en: 'Green tea, pot' },
    description: {
      uz: 'Toshkent uslubida, 1 litr choynak.',
      ru: 'По-ташкентски, чайник 1 литр.',
      en: 'Tashkent style, a 1-litre pot.',
    },
    price: som(8_000),
    rating: '4.5',
    reviews: 128,
    calories: 0,
    soldOut: false,
  },
];

/** The four the home screen puts under "most ordered", in that order. */
export const POPULAR_IDS: readonly string[] = ['osh', 'pepperoni', 'lavash', 'double-burger'];

/* ============================================================
   How a dish is configured
   ============================================================ */

export type Portion = { id: string; name: Trilingual; delta: number };

/**
 * Three sizes, priced as a delta on the dish.
 *
 * A delta rather than three prices because the dish carries the price and a
 * restaurant edits it in one place. `regular` is the base and its delta is
 * zero, which is why the middle option is the default everywhere.
 */
export const PORTIONS: readonly Portion[] = [
  { id: 'small', name: { uz: 'Kichik', ru: 'Маленькая', en: 'Small' }, delta: som(-6_000) },
  { id: 'regular', name: { uz: "O'rta", ru: 'Средняя', en: 'Regular' }, delta: 0 },
  { id: 'large', name: { uz: 'Katta', ru: 'Большая', en: 'Large' }, delta: som(12_000) },
];

export const DEFAULT_PORTION = 'regular';

export type Modifier = { id: string; name: Trilingual; price: number };

export const MODIFIERS: readonly Modifier[] = [
  {
    id: 'extra-meat',
    name: {
      uz: "Qo'shimcha go'sht, 80 g",
      ru: 'Дополнительное мясо, 80 г',
      en: 'Extra meat, 80 g',
    },
    price: som(18_000),
  },
  {
    id: 'extra-cheese',
    name: { uz: "Qo'shimcha pishloq", ru: 'Дополнительный сыр', en: 'Extra cheese' },
    price: som(9_000),
  },
  {
    id: 'hot-sauce',
    name: { uz: 'Achchiq sous', ru: 'Острый соус', en: 'Hot sauce' },
    price: som(3_000),
  },
  // Priced at nothing, and still a modifier: the kitchen has to be told, and a
  // free instruction that does not reach the pass is a plate sent back.
  { id: 'no-onion', name: { uz: 'Piyozsiz', ru: 'Без лука', en: 'No onion' }, price: 0 },
  {
    id: 'flatbread',
    name: { uz: "Non qo'shish", ru: 'Добавить лепёшку', en: 'Add flatbread' },
    price: som(5_000),
  },
];

/** The kitchen note a guest can leave on a line, capped as the design caps it. */
export const NOTE_MAX = 90;

/* ============================================================
   Paying
   ============================================================ */

export type PaymentRail = {
  id: string;
  /**
   * What the row is called.
   *
   * A rail is usually a company — Click is Click in all three languages, and
   * "Uzcard · 8712" is a card number — but cash is a word, and a word has to be
   * translated. The type used to be a plain string on the reasoning that a
   * name is a name, and the cash row then carried
   * `'Naqd · Наличными · Cash'`: all three languages printed at once, on the
   * screen a guest is about to pay from.
   *
   * Trilingual throughout, with the company names simply repeating themselves.
   * The alternative — a union of string and Trilingual — is a branch at every
   * call site and a wrong branch at one of them.
   */
  label: Trilingual;
  /** Two or three characters for the chip; the design draws no logos. */
  tag: string;
  note: Trilingual;
  /** Cash is the one that moves the drawer, and the one that rounds. */
  isCash: boolean;
};

/**
 * Four rails, and four is the design's own count.
 *
 * `Mijoz ilovasi.dc.html:1069-1074` lists card, Click, Payme and cash, and the
 * payment screen is drawn for four rows. A fifth — Uzum — had been added here
 * on the strength of START-HERE §6 naming it as a market rail, and the handoff
 * README is explicit about which side wins that argument: where a document and
 * a file disagree, the file wins. Uzum belongs in the tenant's payment settings
 * when those exist, not in a fixture nobody can check against the drawing.
 */
export const PAYMENT_RAILS: readonly PaymentRail[] = [
  {
    id: 'card',
    label: { uz: 'Uzcard · 8712', ru: 'Uzcard · 8712', en: 'Uzcard · 8712' },
    tag: 'UZ',
    note: { uz: 'Asosiy karta', ru: 'Основная карта', en: 'Default card' },
    isCash: false,
  },
  {
    id: 'click',
    label: { uz: 'Click', ru: 'Click', en: 'Click' },
    tag: 'CL',
    note: {
      uz: 'Ilova orqali tasdiqlash',
      ru: 'Подтверждение в приложении',
      en: 'Confirm in the app',
    },
    isCash: false,
  },
  {
    id: 'payme',
    label: { uz: 'Payme', ru: 'Payme', en: 'Payme' },
    tag: 'PM',
    note: {
      uz: 'Ilova orqali tasdiqlash',
      ru: 'Подтверждение в приложении',
      en: 'Confirm in the app',
    },
    isCash: false,
  },
  {
    id: 'cash',
    label: { uz: 'Naqd', ru: 'Наличными', en: 'Cash' },
    tag: '₴',
    note: {
      uz: 'Kuryerga · 1000 ga yaxlitlanadi',
      ru: 'Курьеру · округление до 1000',
      en: 'To the courier · rounded to 1000',
    },
    isCash: true,
  },
];

/** What the tip chips offer, as percentages of the food line. */
export const TIP_STEPS: readonly number[] = [0, 5, 10, 15];

/**
 * Promo codes the fixture accepts, and the floor each one needs.
 *
 * A real code is validated by the server against the tenant's campaign — a
 * client that decides its own discount decides its own price. This exists so
 * the screen's success and failure paths can both be walked with no API.
 *
 * Whole percents, not fractions. `0.15` is a float in a money path, and the
 * platform's first rule is that none of those exist: the discount is taken by
 * `percentOf()` in `pricing.ts`, which is integer arithmetic the server's
 * calculator matches line for line.
 */
export const PROMO_CODES: Readonly<Record<string, number>> = {
  OSH15: 15,
  YANGI10: 10,
  PLOV20: 20,
};

export const PROMO_MINIMUM = som(50_000);

/* ============================================================
   After the order
   ============================================================ */

/**
 * The canonical state key, never the word.
 *
 * DATABASE.md §6.1: one row, three audiences. The POS reads `cooking` as
 * "Tayyorlanmoqda" and the guest reads it as "Oshxonada" — storing the display
 * string is how two ladders appear and drift within a week.
 */
export type OrderState = Extract<
  CanonicalOrderState,
  'accepted' | 'cooking' | 'enroute' | 'handed'
>;

/**
 * Four rungs, and every key is the platform's.
 *
 * `packages/i18n/src/order-state.ts` is the one ladder — the audit that
 * produced it found five vocabularies for a single concept. This surface had a
 * sixth, `on_the_way`/`delivered`, which read the same to a person and matched
 * nothing on the wire: the Telegram mini app, the KDS and the Z report all say
 * `enroute` and `handed`. Renaming costs nothing here because the words a guest
 * reads are in `customer-copy.ts` and did not move.
 *
 * `served` and `topay` are skipped rather than missing — a delivery is never
 * carried to a table and is paid before it leaves. `statesForChannel` says the
 * same thing on the server.
 */
export const ORDER_LADDER: readonly OrderState[] = ['accepted', 'cooking', 'enroute', 'handed'];

export type TrackedOrder = {
  number: string;
  branchId: string;
  state: OrderState;
  /** When each state was reached; absent for one not reached yet. */
  times: Readonly<Partial<Record<OrderState, string>>>;
  eta: string;
  courier: { name: string; vehicle: string; initials: string } | null;
  /**
   * What was ordered, by catalogue id.
   *
   * Ids rather than names and prices copied into the record, because "repeat
   * this order" has to put real lines back in the basket — a stored name is a
   * string nothing can be re-ordered from, and a stored price is one that goes
   * stale the first time the menu changes.
   */
  lines: readonly {
    dishId: string;
    portionId: string;
    quantity: number;
    /**
     * What the line was called when it was rung up.
     *
     * Optional because the fixtures have none — they name a dish the catalogue
     * can look up. A live order's dish id is the kitchen's row id, and the menu
     * on the phone may no longer contain it: a dish withdrawn after the order
     * was placed still has to be printed on the order it was part of. The
     * snapshot on the bill is the only thing that can answer, which is why
     * `order_items` has carried `title` since it was created.
     */
    title?: string;
  }[];
  /** What it came to, tiyin, as charged. Historical: never recomputed. */
  total: number;
};

export const TRACKED_ORDER: TrackedOrder = {
  number: '4471',
  branchId: 'chilonzor',
  state: 'enroute',
  times: { accepted: '19:42', cooking: '19:44', enroute: '20:03' },
  eta: '20:15',
  courier: { name: 'Anvar Toshmatov', vehicle: 'Cobalt · 01 A 777 BB', initials: 'AT' },
  lines: [
    { dishId: 'osh', portionId: 'large', quantity: 1 },
    { dishId: 'lavash', portionId: 'regular', quantity: 2 },
    { dishId: 'green-tea', portionId: 'regular', quantity: 1 },
  ],
  total: som(112_000),
};

/* ============================================================
   The guest
   ============================================================ */

export type SavedAddress = {
  id: string;
  label: Trilingual;
  line: Trilingual;
  /** Where the courier is told to go by default. */
  primary: boolean;
};

/**
 * Two saved addresses, and that is all there is.
 *
 * `GAPS.md §4.2 Y3` — there is no address book in the design: no add, no edit,
 * no map picker, and the "add an address" control does nothing but say the
 * picker would be a map. That gap is drawn as it stands rather than filled in
 * here, because inventing the missing screen means guessing what the designer
 * would have drawn, and a visible gap gets filled correctly later.
 */
export const SAVED_ADDRESSES: readonly SavedAddress[] = [
  {
    id: 'home',
    label: { uz: 'Uy', ru: 'Дом', en: 'Home' },
    line: {
      uz: 'Chilonzor 9, 42-uy, 3-podyezd, 17-xonadon',
      ru: 'Чиланзар 9, дом 42, подъезд 3, кв. 17',
      en: 'Chilonzor 9, block 42, entrance 3, flat 17',
    },
    primary: true,
  },
  {
    id: 'work',
    label: { uz: 'Ish', ru: 'Работа', en: 'Work' },
    line: {
      uz: 'Amir Temur 108, IT Park, 4-qavat',
      ru: 'Амира Темура 108, IT Park, 4 этаж',
      en: 'Amir Temur 108, IT Park, 4th floor',
    },
    primary: false,
  },
];

/** The delivery note the courier gets, attached to the primary address. */
export const ADDRESS_NOTE: Trilingual = {
  uz: 'Domofon 17 · 4-qavat · lift bor',
  ru: 'Домофон 17 · 4 этаж · есть лифт',
  en: 'Intercom 17 · 4th floor · lift available',
};

export type PastOrder = {
  number: string;
  date: Trilingual;
  summary: Trilingual;
  /** Tiyin. */
  total: number;
};

export const ORDER_HISTORY: readonly PastOrder[] = [
  {
    number: '4468',
    date: { uz: '9-avgust', ru: '9 августа', en: '9 August' },
    summary: {
      uz: 'Osh, lavash, choy · yetkazib berish',
      ru: 'Плов, лаваш, чай · доставка',
      en: 'Plov, lavash, tea · delivery',
    },
    total: som(148_000),
  },
  {
    number: '4402',
    date: { uz: '2-avgust', ru: '2 августа', en: '2 August' },
    summary: {
      uz: 'Pepperoni, kola · olib ketish',
      ru: 'Пепперони, кола · самовывоз',
      en: 'Pepperoni, cola · pickup',
    },
    total: som(74_000),
  },
  {
    number: '4361',
    date: { uz: '27-iyul', ru: '27 июля', en: '27 July' },
    summary: {
      uz: 'Manti, Sezar · yetkazib berish',
      ru: 'Манты, Цезарь · доставка',
      en: 'Manti, Caesar · delivery',
    },
    total: som(82_000),
  },
];

/**
 * The guest, as the design names her.
 *
 * A fixture identity, and the phone is the whole of it: START-HERE §4 makes
 * `people.phone_e164` the only identity key, so this record has no id of its
 * own. A Telegram id or a device id would be an alias onto this number, never
 * a second person — that is how loyalty balances fragment across five channels.
 */
export const GUEST = {
  name: 'Dilnoza Aliyeva',
  initials: 'DA',
  phone: '+998 90 123 45 67',
  orders: 38,
  spent: som(3_600_000),
} as const;

/* ============================================================
   Loyalty
   ============================================================ */

export type Coupon = {
  id: string;
  name: Trilingual;
  note: Trilingual;
  expires: Trilingual;
  /** The rail colour down the left edge. One of the design's four accents. */
  tone: 'accent' | 'brand' | 'warning';
};

export const COUPONS: readonly Coupon[] = [
  {
    id: 'pickup-5',
    name: { uz: 'Olib ketishga 5%', ru: '5% на самовывоз', en: '5% off pickup' },
    note: { uz: 'Har qanday buyurtmada', ru: 'На любой заказ', en: 'On any order' },
    expires: { uz: '31-avgustgacha', ru: 'до 31 августа', en: 'until 31 August' },
    tone: 'accent',
  },
  {
    id: 'free-delivery',
    name: {
      uz: 'Bepul yetkazib berish',
      ru: 'Бесплатная доставка',
      en: 'Free delivery',
    },
    note: { uz: "150 000 so'mdan", ru: 'от 150 000 сум', en: "from 150 000 so'm" },
    expires: { uz: '3 kun qoldi', ru: 'осталось 3 дня', en: '3 days left' },
    tone: 'brand',
  },
  {
    id: 'second-lavash',
    name: {
      uz: "Ikkinchi lavash sovg'a",
      ru: 'Второй лаваш в подарок',
      en: 'Second lavash free',
    },
    note: { uz: 'Faqat 11:00–15:00', ru: 'Только 11:00–15:00', en: '11:00–15:00 only' },
    expires: { uz: 'Bugun oxirgi kun', ru: 'Сегодня последний день', en: 'Last day today' },
    tone: 'warning',
  },
];

/**
 * The balance, the tier and the distance to the next one.
 *
 * Read-only here and read-only in the app: points are awarded by the ledger
 * ten minutes after payment clears, and a client that can write its own
 * balance can write any balance.
 */
export const LOYALTY = {
  points: 2_480,
  tier: 'silver',
  nextTier: 'gold',
  toNextTier: 1_520,
  /** How far along the rail the bar is drawn, as the design draws it. */
  progressPercent: 62,
} as const;

export const LOYALTY_RULES: readonly Trilingual[] = [
  {
    uz: "Har 1 000 so'm uchun 1 ball. Ballar to'lovdan keyin 10 daqiqada tushadi.",
    ru: '1 балл за каждые 1 000 сум. Баллы начисляются через 10 минут после оплаты.',
    en: 'One point per 1 000 so’m. Points land 10 minutes after payment.',
  },
  {
    uz: "100 ball = 1 000 so'm chegirma. Chegirma to'lov ekranida qo'llanadi.",
    ru: '100 баллов = скидка 1 000 сум. Скидка применяется на экране оплаты.',
    en: '100 points = 1 000 so’m off, applied at the payment screen.',
  },
  {
    uz: "Ballar oxirgi buyurtmadan 12 oy o'tgach kuyadi.",
    ru: 'Баллы сгорают через 12 месяцев после последнего заказа.',
    en: 'Points expire 12 months after your last order.',
  },
];

/* ============================================================
   Lookups

   Maps rather than repeated `.find()` calls: the cart re-derives every line on
   every keystroke in the promo field, and a linear scan per line per render is
   the kind of thing that is free at eleven dishes and is not at four hundred.
   ============================================================ */

export const DISH_BY_ID: ReadonlyMap<string, Dish> = new Map(DISHES.map((d) => [d.id, d]));

export const MODIFIER_BY_ID: ReadonlyMap<string, Modifier> = new Map(
  MODIFIERS.map((m) => [m.id, m]),
);

export const PORTION_BY_ID: ReadonlyMap<string, Portion> = new Map(PORTIONS.map((p) => [p.id, p]));

export const BRANCH_BY_ID: ReadonlyMap<string, Branch> = new Map(BRANCHES.map((b) => [b.id, b]));

export const CATEGORY_BY_ID: ReadonlyMap<string, Category> = new Map(
  CATEGORIES.map((c) => [c.id, c]),
);

/**
 * What the wizard knows that a restaurant owns, and the shapes it moves around.
 *
 * The split this file exists for: a dish name, a zone name, a payment rail and
 * the word "so'm" are content a restaurant edits, so they live here as
 * `{uz, ru, en}` columns. What the product itself says — labels, warnings,
 * button text — is in `setup-copy.ts`. Getting this backwards puts a menu into
 * a translation catalogue, where the next person to change a price edits it in
 * the wrong place and only one language moves.
 *
 * There is a second, harder reason for the line. `i18n.test.ts` rejects any
 * catalogue key whose three languages are identical, and it is right to: "Pizza"
 * and "so'm" read the same in Uzbek and English, so a key holding them is data
 * wearing a catalogue key. Everything in this file is allowed to be identical
 * across the three columns; nothing in `setup-copy.ts` is.
 *
 * No `next/headers`, no `fetch`, no server import anywhere in here — the wizard
 * is a client component and imports this module for values, not just types.
 * Anything that talks to Laravel is in `setup-server.ts`.
 */

export const LANGS = ['uz', 'ru', 'en'] as const;

export type Lang = (typeof LANGS)[number];

/** A value a restaurant reads in whichever of the three languages it works in. */
export type Trilingual = Readonly<Record<Lang, string>>;

/** Narrow an unknown — a header, a stored preference — to a language we ship. */
export function isLang(value: unknown): value is Lang {
  return value === 'uz' || value === 'ru' || value === 'en';
}

/**
 * The currency, and the reason it is here rather than in the catalogue.
 *
 * Uzbek and English spell it the same. A key whose three languages agree is
 * data, and this is the example that catches people out.
 */
export const CURRENCY_WORD: Trilingual = { uz: "so'm", ru: 'сум', en: "so'm" };

export const CURRENCY_CODE = 'UZS';

/* ============================================================
   The eight steps
   ============================================================ */

export const STEP_IDS = [
  'restaurant',
  'branch',
  'floor',
  'menu',
  'tax',
  'crew',
  'devices',
  'ready',
] as const;

export type StepId = (typeof STEP_IDS)[number];

/**
 * How long each step takes and whether it can wait.
 *
 * `minutes` is the design's own estimate, and the header adds up whatever is
 * still unfinished into "about 24 minutes left". It is a promise to somebody
 * deciding whether to start now or after the lunch service, so it is written
 * down per step rather than divided evenly.
 *
 * `deferrable` marks the two steps the design draws with a "can be done later"
 * chip and a `Later` button beside `Continue` — people and devices. Both were
 * marked required in the written spec; the design file marks them optional and
 * the file wins. It is also the better product: a wizard that will not let a
 * restaurant reach its first order until every waiter has a PIN is a wizard
 * that gets abandoned at step six, and the owner can work every role alone for
 * one evening.
 */
export const STEPS: readonly { id: StepId; minutes: number; deferrable: boolean }[] = [
  { id: 'restaurant', minutes: 3, deferrable: false },
  { id: 'branch', minutes: 4, deferrable: false },
  { id: 'floor', minutes: 3, deferrable: false },
  { id: 'menu', minutes: 6, deferrable: false },
  { id: 'tax', minutes: 4, deferrable: false },
  { id: 'crew', minutes: 5, deferrable: true },
  { id: 'devices', minutes: 4, deferrable: true },
  { id: 'ready', minutes: 1, deferrable: false },
];

/* ============================================================
   Step 1 — the restaurant
   ============================================================ */

/**
 * The kinds of kitchen the wizard offers.
 *
 * Not decoration: the choice is what picks the menu template and the kitchen
 * stations, so the list is the set of templates that exist, not a taxonomy of
 * cuisine. Adding a row here without adding the template behind it gives an
 * owner a choice that silently does nothing.
 */
export const CUISINES: readonly { id: string; name: Trilingual }[] = [
  { id: 'uzbek', name: { uz: 'Milliy oshxona', ru: 'Национальная кухня', en: 'Uzbek' } },
  { id: 'fast-casual', name: { uz: 'Fast-casual', ru: 'Fast-casual', en: 'Fast-casual' } },
  { id: 'pizza', name: { uz: 'Pizza', ru: 'Пицца', en: 'Pizza' } },
  { id: 'burger', name: { uz: 'Burger', ru: 'Бургеры', en: 'Burgers' } },
  { id: 'cafe', name: { uz: 'Kafe', ru: 'Кафе', en: 'Cafe' } },
  { id: 'teahouse', name: { uz: 'Choyxona', ru: 'Чайхана', en: 'Teahouse' } },
];

/**
 * The working languages, written the way each one writes itself.
 *
 * Endonyms, so the row a Russian-speaking manager is looking for says
 * "Русский" whatever language the wizard is currently in. Identical in all
 * three columns on purpose — see the note at the top of this file.
 */
export const WORKING_LANGUAGES: readonly { id: Lang; label: string }[] = [
  { id: 'uz', label: "O'zbekcha" },
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
];

/* ============================================================
   Step 2 — the branch
   ============================================================ */

/**
 * When the business day turns over, and why it is not midnight.
 *
 * A restaurant works past midnight, so an order rung up at 01:30 belongs to the
 * evening that produced it. Reports group by `business_date`, never by
 * `created_at` — DECISIONS §3 — and 06:00 is the platform's default boundary.
 * Change it here and the wizard offers a different default; the boundary the
 * server actually applies is its own configuration, not this value.
 */
export const BUSINESS_DAY_DEFAULT = '06:00';

export const OPEN_TIME_DEFAULT = '10:00';
export const CLOSE_TIME_DEFAULT = '02:00';

/** `HH:MM`, 24-hour. Rejects 24:00 and 09:60, which both parse as numbers. */
export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* ============================================================
   Step 3 — zones and tables
   ============================================================ */

/**
 * A zone of the floor, before it becomes a hall and a run of tables.
 *
 * `prefix` is what a waiter says out loud — T4, TR2, V1 — so it is short and
 * upper case, and it becomes the table label the API stores. Table labels are
 * unique per restaurant, which is why two zones may never share a prefix.
 */
export type ZonePreset = {
  key: string;
  name: Trilingual;
  prefix: string;
  tables: number;
  seats: number;
};

export const ZONE_PRESETS: readonly ZonePreset[] = [
  {
    key: 'hall',
    name: { uz: 'Asosiy zal', ru: 'Основной зал', en: 'Main hall' },
    prefix: 'T',
    tables: 18,
    seats: 4,
  },
  {
    key: 'terrace',
    name: { uz: 'Terrasa', ru: 'Терраса', en: 'Terrace' },
    prefix: 'TR',
    tables: 8,
    seats: 4,
  },
  {
    key: 'vip',
    name: { uz: 'VIP xona', ru: 'VIP-комната', en: 'VIP room' },
    prefix: 'V',
    tables: 3,
    seats: 8,
  },
];

/**
 * What "Add a zone" adds, in order.
 *
 * Four of them, each with its own name and its own letter, rather than one
 * template repeated. Two zones sharing a prefix would produce two tables
 * called T1, and a table label is unique per restaurant — so the second zone's
 * tables would be refused one at a time, half-way through a run of writes,
 * with a validation message about a field the owner never filled in.
 *
 * Four is where the wizard stops. A floor plan that needs a fifth zone needs
 * the Tables screen, where zones can be named, reordered and drawn on a map;
 * what this step is for is getting a restaurant to its first order, and no
 * restaurant needs seven zones to do that.
 */
export const ZONE_EXTRAS: readonly ZonePreset[] = [
  {
    key: 'extra-1',
    name: { uz: 'Yangi zona', ru: 'Новая зона', en: 'New zone' },
    prefix: 'Z',
    tables: 4,
    seats: 4,
  },
  {
    key: 'extra-2',
    name: { uz: 'Yozgi maydon', ru: 'Летняя площадка', en: 'Summer area' },
    prefix: 'Y',
    tables: 4,
    seats: 4,
  },
  {
    key: 'extra-3',
    name: { uz: 'Ikkinchi qavat', ru: 'Второй этаж', en: 'Upper floor' },
    prefix: 'U',
    tables: 4,
    seats: 4,
  },
  {
    key: 'extra-4',
    name: { uz: 'Bar zonasi', ru: 'Барная зона', en: 'Bar area' },
    prefix: 'B',
    tables: 4,
    seats: 2,
  },
];

/** The API caps a table at 100 seats and a hall at 5000 covers; these are tighter. */
export const MAX_TABLES_PER_ZONE = 60;
export const MAX_SEATS_PER_TABLE = 24;

/* ============================================================
   Step 4 — the menu
   ============================================================ */

export type MenuRoute = 'excel' | 'template' | 'manual';

export type TemplateDish = {
  /** Unique per restaurant, and the API enforces that. */
  sku: string;
  name: Trilingual;
  /**
   * In tiyin. 1 so'm = 100 tiyin, and the whole platform stores money this way
   * so a rounding error can never reach a bill — `price` on the API is an
   * integer in tiyin too, so nothing is converted on the way out of here.
   *
   * These are placeholders. The design says so on the screen, in all three
   * languages, because a restaurant that opens on template prices sells plov
   * at somebody else's margin for a week.
   */
  priceTiyin: number;
};

export type TemplateCategory = {
  slug: string;
  name: Trilingual;
  /** One of `MenuItem::STATIONS` on the server: hot, cold, grill, bar, pastry. */
  station: 'hot' | 'cold' | 'grill' | 'bar' | 'pastry';
  dishes: readonly TemplateDish[];
};

/**
 * The 68-dish starter menu, and the reason it is the most important object here.
 *
 * Step 4 is where an owner stalls. Typing sixty-eight dishes in three languages
 * before the restaurant can take a single order is the point at which people
 * close the tab and telephone support, so the wizard offers a real Uzbek menu
 * that is already priced, already categorised and already assigned to kitchen
 * stations — and then says, on screen, that the prices are placeholders.
 *
 * The station on each category is what routes a ticket to the right printer
 * later. Getting it wrong is not cosmetic: a grill ticket printing at the cold
 * station means a kebab nobody starts cooking.
 */
export const MENU_TEMPLATE: readonly TemplateCategory[] = [
  {
    slug: 'milliy-taomlar',
    name: { uz: 'Milliy taomlar', ru: 'Национальные', en: 'Uzbek dishes' },
    station: 'hot',
    dishes: [
      {
        sku: 'NAT-01',
        name: { uz: "To'y oshi", ru: 'Свадебный плов', en: 'Wedding plov' },
        priceTiyin: 4_200_000,
      },
      {
        sku: 'NAT-02',
        name: { uz: 'Chuchvara', ru: 'Чучвара', en: 'Chuchvara' },
        priceTiyin: 3_200_000,
      },
      { sku: 'NAT-03', name: { uz: "Lag'mon", ru: 'Лагман', en: 'Lagman' }, priceTiyin: 3_800_000 },
      {
        sku: 'NAT-04',
        name: { uz: "Qovurma lag'mon", ru: 'Жареный лагман', en: 'Fried lagman' },
        priceTiyin: 4_200_000,
      },
      { sku: 'NAT-05', name: { uz: 'Manti', ru: 'Манты', en: 'Manti' }, priceTiyin: 3_600_000 },
      {
        sku: 'NAT-06',
        name: { uz: "Go'shtli somsa", ru: 'Самса с мясом', en: 'Meat samsa' },
        priceTiyin: 1_200_000,
      },
      { sku: 'NAT-07', name: { uz: 'Norin', ru: 'Норин', en: 'Norin' }, priceTiyin: 4_000_000 },
      {
        sku: 'NAT-08',
        name: { uz: 'Mastava', ru: 'Мастава', en: 'Mastava' },
        priceTiyin: 2_600_000,
      },
      { sku: 'NAT-09', name: { uz: 'Shorva', ru: 'Шурпа', en: 'Shurpa' }, priceTiyin: 3_000_000 },
      {
        sku: 'NAT-10',
        name: { uz: 'Dimlama', ru: 'Димлама', en: 'Dimlama' },
        priceTiyin: 4_600_000,
      },
      {
        sku: 'NAT-11',
        name: { uz: 'Beshbarmoq', ru: 'Бешбармак', en: 'Beshbarmak' },
        priceTiyin: 5_200_000,
      },
      { sku: 'NAT-12', name: { uz: 'Xonim', ru: 'Ханум', en: 'Khanum' }, priceTiyin: 3_400_000 },
      {
        sku: 'NAT-13',
        name: { uz: 'Qozon kabob', ru: 'Казан-кебаб', en: 'Kazan kebab' },
        priceTiyin: 5_500_000,
      },
      {
        sku: 'NAT-14',
        name: { uz: "Tandir go'sht", ru: 'Мясо из тандыра', en: 'Tandoor lamb' },
        priceTiyin: 6_800_000,
      },
    ],
  },
  {
    slug: 'grill-kabob',
    name: { uz: 'Grill va kabob', ru: 'Гриль и кебаб', en: 'Grill and kebab' },
    station: 'grill',
    dishes: [
      {
        sku: 'GRL-01',
        name: { uz: "Qo'y kabob", ru: 'Шашлык из баранины', en: 'Lamb kebab' },
        priceTiyin: 2_800_000,
      },
      {
        sku: 'GRL-02',
        name: { uz: 'Mol kabob', ru: 'Шашлык из говядины', en: 'Beef kebab' },
        priceTiyin: 2_600_000,
      },
      {
        sku: 'GRL-03',
        name: { uz: 'Tovuq kabob', ru: 'Куриный шашлык', en: 'Chicken kebab' },
        priceTiyin: 2_200_000,
      },
      {
        sku: 'GRL-04',
        name: { uz: 'Qiyma kabob', ru: 'Люля-кебаб', en: 'Lyulya kebab' },
        priceTiyin: 2_400_000,
      },
      {
        sku: 'GRL-05',
        name: { uz: 'Jigar kabob', ru: 'Шашлык из печени', en: 'Liver kebab' },
        priceTiyin: 2_200_000,
      },
      {
        sku: 'GRL-06',
        name: { uz: "Qovurg'a", ru: 'Рёбрышки', en: 'Ribs' },
        priceTiyin: 3_400_000,
      },
      {
        sku: 'GRL-07',
        name: { uz: 'Baliq kabob', ru: 'Шашлык из рыбы', en: 'Fish kebab' },
        priceTiyin: 3_800_000,
      },
      {
        sku: 'GRL-08',
        name: { uz: 'Sabzavot kabob', ru: 'Овощной шашлык', en: 'Grilled vegetables' },
        priceTiyin: 1_800_000,
      },
      {
        sku: 'GRL-09',
        name: { uz: 'Tovuq qanoti', ru: 'Куриные крылья', en: 'Chicken wings' },
        priceTiyin: 2_400_000,
      },
      {
        sku: 'GRL-10',
        name: { uz: 'Tandir baliq', ru: 'Рыба в тандыре', en: 'Tandoor fish' },
        priceTiyin: 6_200_000,
      },
      {
        sku: 'GRL-11',
        name: { uz: 'Grill assorti', ru: 'Ассорти гриль', en: 'Mixed grill' },
        priceTiyin: 9_600_000,
      },
    ],
  },
  {
    slug: 'salatlar',
    name: { uz: 'Salatlar', ru: 'Салаты', en: 'Salads' },
    station: 'cold',
    dishes: [
      {
        sku: 'SAL-01',
        name: { uz: 'Achichuk', ru: 'Ачичук', en: 'Achichuk' },
        priceTiyin: 1_400_000,
      },
      {
        sku: 'SAL-02',
        name: { uz: 'Tovuqli Sezar', ru: 'Цезарь с курицей', en: 'Chicken Caesar' },
        priceTiyin: 3_400_000,
      },
      { sku: 'SAL-03', name: { uz: 'Olivye', ru: 'Оливье', en: 'Olivier' }, priceTiyin: 2_400_000 },
      {
        sku: 'SAL-04',
        name: { uz: 'Vinegret', ru: 'Винегрет', en: 'Vinaigrette' },
        priceTiyin: 1_800_000,
      },
      {
        sku: 'SAL-05',
        name: { uz: 'Grek salati', ru: 'Греческий салат', en: 'Greek salad' },
        priceTiyin: 3_000_000,
      },
      { sku: 'SAL-06', name: { uz: 'Mimoza', ru: 'Мимоза', en: 'Mimosa' }, priceTiyin: 2_200_000 },
      {
        sku: 'SAL-07',
        name: { uz: 'Bodring va pomidor', ru: 'Огурцы с помидорами', en: 'Cucumber and tomato' },
        priceTiyin: 1_600_000,
      },
      {
        sku: 'SAL-08',
        name: { uz: 'Toshkent salati', ru: 'Ташкентский салат', en: 'Tashkent salad' },
        priceTiyin: 3_200_000,
      },
      {
        sku: 'SAL-09',
        name: { uz: 'Baqlajon salati', ru: 'Салат из баклажанов', en: 'Aubergine salad' },
        priceTiyin: 2_600_000,
      },
    ],
  },
  {
    slug: 'lavash-burger',
    name: { uz: 'Lavash va burger', ru: 'Лаваш и бургеры', en: 'Lavash and burgers' },
    station: 'hot',
    dishes: [
      {
        sku: 'LAV-01',
        name: { uz: 'Tovuqli lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
        priceTiyin: 2_600_000,
      },
      {
        sku: 'LAV-02',
        name: { uz: "Mol go'shtli lavash", ru: 'Лаваш с говядиной', en: 'Beef lavash' },
        priceTiyin: 3_000_000,
      },
      {
        sku: 'LAV-03',
        name: { uz: 'Fri lavash', ru: 'Лаваш с картофелем фри', en: 'Lavash with fries' },
        priceTiyin: 2_800_000,
      },
      {
        sku: 'LAV-04',
        name: { uz: "Qo'sh lavash", ru: 'Двойной лаваш', en: 'Double lavash' },
        priceTiyin: 3_800_000,
      },
      {
        sku: 'LAV-05',
        name: { uz: 'Klassik burger', ru: 'Классический бургер', en: 'Classic burger' },
        priceTiyin: 3_200_000,
      },
      {
        sku: 'LAV-06',
        name: { uz: 'Chizburger', ru: 'Чизбургер', en: 'Cheeseburger' },
        priceTiyin: 3_600_000,
      },
      {
        sku: 'LAV-07',
        name: { uz: 'Ikki qavatli burger', ru: 'Двойной бургер', en: 'Double burger' },
        priceTiyin: 4_600_000,
      },
      {
        sku: 'LAV-08',
        name: { uz: 'Tovuq burger', ru: 'Куриный бургер', en: 'Chicken burger' },
        priceTiyin: 3_000_000,
      },
      {
        sku: 'LAV-09',
        name: { uz: 'Xot-dog', ru: 'Хот-дог', en: 'Hot dog' },
        priceTiyin: 1_800_000,
      },
      { sku: 'LAV-10', name: { uz: 'Donar', ru: 'Донер', en: 'Doner' }, priceTiyin: 2_800_000 },
      {
        sku: 'LAV-11',
        name: { uz: 'Fri kartoshka', ru: 'Картофель фри', en: 'French fries' },
        priceTiyin: 1_400_000,
      },
      {
        sku: 'LAV-12',
        name: { uz: 'Nagets', ru: 'Наггетсы', en: 'Nuggets' },
        priceTiyin: 2_200_000,
      },
    ],
  },
  {
    slug: 'pizza',
    name: { uz: 'Pizza', ru: 'Пицца', en: 'Pizza' },
    station: 'hot',
    dishes: [
      {
        sku: 'PIZ-01',
        name: { uz: 'Margarita', ru: 'Маргарита', en: 'Margherita' },
        priceTiyin: 4_200_000,
      },
      {
        sku: 'PIZ-02',
        name: { uz: 'Pepperoni', ru: 'Пепперони', en: 'Pepperoni' },
        priceTiyin: 5_200_000,
      },
      {
        sku: 'PIZ-03',
        name: { uz: "To'rt xil pishloq", ru: 'Четыре сыра', en: 'Four cheeses' },
        priceTiyin: 5_600_000,
      },
      {
        sku: 'PIZ-04',
        name: { uz: 'Tovuqli pizza', ru: 'Пицца с курицей', en: 'Chicken pizza' },
        priceTiyin: 4_800_000,
      },
      {
        sku: 'PIZ-05',
        name: { uz: "Go'shtli pizza", ru: 'Мясная пицца', en: 'Meat pizza' },
        priceTiyin: 5_800_000,
      },
      {
        sku: 'PIZ-06',
        name: { uz: 'Sabzavotli pizza', ru: 'Овощная пицца', en: 'Vegetable pizza' },
        priceTiyin: 4_400_000,
      },
      {
        sku: 'PIZ-07',
        name: { uz: 'Dengiz mahsulotlari', ru: 'Морская', en: 'Seafood pizza' },
        priceTiyin: 6_400_000,
      },
      {
        sku: 'PIZ-08',
        name: { uz: 'Barbekyu', ru: 'Барбекю', en: 'Barbecue pizza' },
        priceTiyin: 5_400_000,
      },
    ],
  },
  {
    slug: 'ichimliklar',
    name: { uz: 'Ichimliklar', ru: 'Напитки', en: 'Drinks' },
    station: 'bar',
    dishes: [
      {
        sku: 'DRK-01',
        name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' },
        priceTiyin: 800_000,
      },
      {
        sku: 'DRK-02',
        name: { uz: 'Qora choy', ru: 'Чёрный чай', en: 'Black tea' },
        priceTiyin: 800_000,
      },
      {
        sku: 'DRK-03',
        name: { uz: 'Choynak choy', ru: 'Чайник чая', en: 'Pot of tea' },
        priceTiyin: 1_500_000,
      },
      {
        sku: 'DRK-04',
        name: { uz: 'Espresso', ru: 'Эспрессо', en: 'Espresso' },
        priceTiyin: 1_600_000,
      },
      {
        sku: 'DRK-05',
        name: { uz: 'Amerikano', ru: 'Американо', en: 'Americano' },
        priceTiyin: 1_800_000,
      },
      {
        sku: 'DRK-06',
        name: { uz: 'Kapuchino', ru: 'Капучино', en: 'Cappuccino' },
        priceTiyin: 2_400_000,
      },
      { sku: 'DRK-07', name: { uz: 'Latte', ru: 'Латте', en: 'Latte' }, priceTiyin: 2_600_000 },
      { sku: 'DRK-08', name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' }, priceTiyin: 1_000_000 },
      { sku: 'DRK-09', name: { uz: 'Kompot', ru: 'Компот', en: 'Compote' }, priceTiyin: 900_000 },
      {
        sku: 'DRK-10',
        name: { uz: 'Limonad', ru: 'Лимонад', en: 'Lemonade' },
        priceTiyin: 1_600_000,
      },
      {
        sku: 'DRK-11',
        name: { uz: 'Suv 0.5', ru: 'Вода 0,5', en: 'Water 0.5' },
        priceTiyin: 600_000,
      },
      {
        sku: 'DRK-12',
        name: { uz: 'Gazli suv 0.5', ru: 'Газированная вода 0,5', en: 'Sparkling water 0.5' },
        priceTiyin: 700_000,
      },
      {
        sku: 'DRK-13',
        name: { uz: 'Apelsin fresh', ru: 'Апельсиновый фреш', en: 'Orange juice' },
        priceTiyin: 2_800_000,
      },
      {
        sku: 'DRK-14',
        name: { uz: 'Milkshake', ru: 'Милкшейк', en: 'Milkshake' },
        priceTiyin: 2_600_000,
      },
    ],
  },
];

/** 68, and the screen says 68. Computed rather than written twice. */
export const TEMPLATE_DISH_COUNT = MENU_TEMPLATE.reduce((all, c) => all + c.dishes.length, 0);

/** One dish typed by hand. The design's third route needs exactly this much. */
export type ManualDish = { id: string; name: string; priceSom: string };

/* ============================================================
   Step 5 — tax, rounding and payment
   ============================================================ */

/**
 * VAT, price-inclusive, and not a setting.
 *
 * DECISIONS §1 and START-HERE §6: the menu price is what the guest pays and VAT
 * is shown on the receipt for information only. Revenue is `total / 1.12`, cash
 * turnover is `total`, and mixing the two in one report is the mistake this
 * rule exists to prevent. Nothing on this screen computes either — a derived
 * figure belongs on the server; a screen displays.
 */
export const VAT_PERCENT = 12;

/** The default the design draws. Editable per restaurant, once an endpoint exists. */
export const SERVICE_PERCENT = 10;

/** Where a service charge may be applied. Dine-in only by default. */
export const SERVICE_SCOPES: readonly { id: string; name: Trilingual }[] = [
  {
    id: 'dine_in',
    name: { uz: 'Zaldagi buyurtmalarga', ru: 'К заказам в зале', en: 'Dine-in orders' },
  },
  { id: 'takeaway', name: { uz: 'Olib ketishga', ru: 'К заказам на вынос', en: 'Takeaway' } },
  { id: 'delivery', name: { uz: 'Yetkazishga', ru: 'К доставке', en: 'Delivery' } },
];

/**
 * Cash rounding steps, in tiyin.
 *
 * 1 000 so'm is the default because that is what Uzbekistan actually does — the
 * smallest note in daily circulation. The difference between the bill and what
 * the drawer takes is a real ledger line, not a rounding artefact: booked
 * anywhere else, every shift closes with a variance and the cashier gets blamed
 * for it.
 *
 * Card, Click and Payme are taken to the tiyin. Rounding an electronic payment
 * would put the venue and the rail out of step by up to a thousand so'm per
 * transaction, and the rail is the one keeping the authoritative number.
 */
export const ROUNDING_STEPS_TIYIN: readonly number[] = [100, 10_000, 100_000, 500_000];
export const ROUNDING_DEFAULT_TIYIN = 100_000;

/**
 * The rails a restaurant can be paid on, with what each one costs it.
 *
 * Card is not dominant here — Click, Payme and Uzum carry a large share of
 * everything that is not cash — so the list is not "cash and card, plus
 * others". The percentage is the acquirer's commission and it is what makes
 * the difference between two rails visible while somebody is choosing.
 */
export const PAYMENT_RAILS: readonly { id: string; name: Trilingual; feePercent: number | null }[] =
  [
    { id: 'cash', name: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' }, feePercent: null },
    {
      id: 'uzcard',
      name: { uz: 'Uzcard · Humo', ru: 'Uzcard · Humo', en: 'Uzcard · Humo' },
      feePercent: 1.2,
    },
    {
      id: 'visa',
      name: { uz: 'Visa · Mastercard', ru: 'Visa · Mastercard', en: 'Visa · Mastercard' },
      feePercent: 2.4,
    },
    { id: 'click', name: { uz: 'Click', ru: 'Click', en: 'Click' }, feePercent: 1.5 },
    { id: 'payme', name: { uz: 'Payme', ru: 'Payme', en: 'Payme' }, feePercent: 1.5 },
    {
      id: 'account',
      name: { uz: 'Kompaniya hisobi', ru: 'Счёт компании', en: 'Company account' },
      feePercent: null,
    },
  ];

/** What the design switches on by default: cash, both card schemes, Click. */
export const PAYMENT_RAILS_DEFAULT: readonly string[] = ['cash', 'uzcard', 'visa', 'click'];

/**
 * The fiscal module number, checked the way the design checks it.
 *
 * Eight digits minimum. This is a shape check and nothing more — whether the
 * number belongs to a real module registered with soliq.uz is a question only
 * soliq.uz can answer, and there is no endpoint on this platform that asks it.
 * See `setup-server.ts`.
 */
export function isFiscalNumber(value: string): boolean {
  return value.replace(/\D/g, '').length >= 8;
}

/* ============================================================
   Step 6 — people
   ============================================================ */

/**
 * The posts a person can hold, as the server spells them.
 *
 * These ids are `StaffMember::POSITIONS` verbatim. A label invented here that
 * does not match one of them is a 422 at the end of a form somebody has just
 * filled in, which is the worst possible moment to discover a typo.
 */
export const STAFF_POSITIONS: readonly { id: string; name: Trilingual }[] = [
  { id: 'manager', name: { uz: 'Menejer', ru: 'Менеджер', en: 'Manager' } },
  { id: 'waiter', name: { uz: 'Ofitsiant', ru: 'Официант', en: 'Waiter' } },
  { id: 'cashier', name: { uz: 'Kassir', ru: 'Кассир', en: 'Cashier' } },
  { id: 'cook', name: { uz: 'Oshpaz', ru: 'Повар', en: 'Cook' } },
  { id: 'chef', name: { uz: 'Shef oshpaz', ru: 'Шеф-повар', en: 'Head chef' } },
  { id: 'bartender', name: { uz: 'Barmen', ru: 'Бармен', en: 'Bartender' } },
  { id: 'host', name: { uz: 'Xostes', ru: 'Хостес', en: 'Host' } },
  { id: 'storekeeper', name: { uz: 'Omborchi', ru: 'Кладовщик', en: 'Storekeeper' } },
  { id: 'courier', name: { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' } },
];

/** One row of the crew table, before it becomes a staff member on the server. */
export type CrewDraft = {
  id: string;
  firstName: string;
  lastName: string;
  /** A phone for a PIN sign-in, an email for a manager who is invited instead. */
  contact: string;
  position: string;
  /** Four digits, shown once. Empty means "signs in with email and password". */
  pin: string;
};

/**
 * A manager signs in with an email; everyone else taps a PIN on the tablet.
 *
 * A PIN is fast and it is enough for a waiter opening a table. It is not enough
 * for the person who can void a bill and read the day's takings, and a manager
 * standing at a tablet with three colleagues watching should not be typing four
 * digits that unlock the money.
 */
export function signsInWithPin(position: string): boolean {
  return position !== 'manager';
}

export function isPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

/* ============================================================
   Step 7 — devices
   ============================================================ */

/** A till, as `GET /api/v1/pos/terminals` describes it. */
export type TerminalRow = {
  id: number;
  code: string;
  name: string;
  mode: string;
  is_paired: boolean;
  is_online: boolean;
  branch?: { name: string } | null;
};

/** A printer, as `GET /api/v1/kitchen/printers` describes it. */
export type PrinterRow = {
  id: number;
  code: string;
  name: string;
  role: string;
  connection: string;
  state: string;
  last_seen_at: string | null;
};

/* ============================================================
   Formatting
   ============================================================ */

/**
 * A so'm figure from a tiyin integer.
 *
 * Grouped with spaces rather than commas: a comma is a decimal separator in
 * Uzbek and Russian typography, so `45,240` reads as forty-five so'm on two of
 * the three screens this is opened on.
 *
 * The division by 100 happens here, at the last moment before a screen, and
 * nowhere else. Every figure that travels — to the API, between steps — stays
 * an integer in tiyin.
 */
export function som(tiyin: number, lang: Lang): string {
  return Math.round(tiyin / 100)
    .toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')
    .replace(/[\s,]/g, ' ');
}

/** Initials for an avatar, from whatever the person is actually called. */
export function initialsOf(first: string, last: string): string {
  return ((first.trim()[0] ?? '') + (last.trim()[0] ?? '')).toUpperCase() || '··';
}

/**
 * A URL-safe slug from a restaurant's own words.
 *
 * The API wants `^[a-z0-9-]+$` for a branch and a menu category. Cyrillic and
 * the Uzbek apostrophe both survive `toLowerCase()` and both fail that regex,
 * so a branch called "Чиланзар" would be refused at the end of step 2 with a
 * validation message about a field the owner never saw. Transliterating the
 * Cyrillic is what keeps that from happening.
 */
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ў: 'o',
  қ: 'q',
  ғ: 'g',
  ҳ: 'h',
};

export function slugify(value: string): string {
  const latin = value
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('');

  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/* ============================================================
   What the server answers with

   These types live here rather than beside the calls that produce them
   because `setup-server.ts` carries a `'use server'` directive, and such a
   module may export nothing but async functions. They are erased at build
   time, so a client component importing them costs nothing and reaches
   nothing — which is the whole reason the split exists.
   ============================================================ */

/** The API's refusal envelope, narrowed to what a screen shows a person. */
export type ApiRefusal = {
  code: string | null;
  /** The API writes its own sentence in all three languages; we never invent one. */
  message: Trilingual | null;
  /** Present when one input field is to blame. */
  field: string | null;
};

/**
 * Why a step did not finish, in the three kinds that need different words.
 *
 * "The server did not answer" and "the server said no" are the same colour of
 * red and opposite instructions: wait and try again, against change something
 * first. An expired session is a third case again — nothing about the form is
 * wrong, the person simply has to sign in.
 */
export type StepFailure =
  { kind: 'offline' } | { kind: 'unauthorised' } | { kind: 'refused'; refusal: ApiRefusal };

export type StepResult<T> = { ok: true; value: T } | { ok: false; failure: StepFailure };

/**
 * A step that writes many rows.
 *
 * `created` is how far it got before it stopped, and it is not decoration: a
 * floor of three zones is twenty-nine separate writes, and telling an owner
 * "eighteen tables created, then the connection dropped" is the difference
 * between a retry they trust and one they are afraid of.
 */
export type BulkOutcome = { created: number; failure: StepFailure | null };

export type DeviceInventory = {
  terminals: readonly TerminalRow[];
  printers: readonly PrinterRow[];
  /** False when the API did not answer, so the screen can say so rather than draw an empty floor. */
  live: boolean;
};

export type PairingCode = { code: string; expiresAt: string | null };

/* ============================================================
   The draft — what the wizard is holding before any of it is written
   ============================================================ */

/** The cities the first branch can be in. Extended in Settings, not here. */
export const CITIES: readonly string[] = [
  'Toshkent',
  'Samarqand',
  'Buxoro',
  'Andijon',
  "Farg'ona",
  'Namangan',
  'Nukus',
  'Qarshi',
  'Urganch',
  'Termiz',
  'Jizzax',
  'Navoiy',
  'Guliston',
];

export type ZoneRow = { id: string; presetKey: string; tables: number; seats: number };

export type SetupDraft = {
  restaurant: { name: string; taxId: string; cuisine: string; langs: readonly Lang[] };
  branch: {
    name: string;
    city: string;
    address: string;
    phone: string;
    openAt: string;
    closeAt: string;
    businessDayStart: string;
  };
  zones: readonly ZoneRow[];
  menu: { route: MenuRoute; manual: readonly ManualDish[] };
  tax: {
    service: readonly string[];
    roundingTiyin: number;
    rails: readonly string[];
    fiscalNo: string;
  };
  crew: readonly CrewDraft[];
};

/**
 * What has actually reached the server.
 *
 * Kept apart from the draft on purpose. The draft is what an owner has typed;
 * this is what exists in the database, and the summary reports the second one.
 * Merging them is how a wizard ends up ticking "menu created" because somebody
 * chose a template, rather than because sixty-eight rows were written.
 */
export type SetupProgress = {
  branchId: number | null;
  tablesCreated: number;
  dishesCreated: number;
  crewCreated: number;
  shiftOpened: boolean;
};

/** The zone preset behind a row of the floor plan. */
export function zonePreset(key: string): ZonePreset {
  return (
    ZONE_PRESETS.find((zone) => zone.key === key) ??
    ZONE_EXTRAS.find((zone) => zone.key === key) ??
    ZONE_PRESETS[0]!
  );
}

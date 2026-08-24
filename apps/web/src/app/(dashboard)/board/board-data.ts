/**
 * The menu board — what the screen above the counter shows.
 *
 * The design file's `board` module, absent from `specs/01-os.md` and therefore
 * absent from this build until the file was read instead of the document.
 *
 * Three things are configured here and the fourth is the point of all of them:
 * which columns the board draws and in what order, which screens rotate and for
 * how long, which banners are live — and a preview, in the board's own dark
 * palette, of exactly what a customer standing at the counter is looking at
 * right now. A configuration screen for a display nobody can see from their
 * desk is a screen where mistakes live for a week.
 *
 * The dimming rule is the one behaviour worth stating: a dish on the stop list
 * dims on the board by itself. Nobody edits the board when the beef runs out —
 * the 86 sheet in the kitchen is the single place that happens, and this
 * follows it. A board that has to be edited separately is a board that sells
 * what the kitchen cannot cook.
 *
 * Fixtures. The board's own configuration has no table yet; the dish names and
 * prices below stand in for `menu.menu_items`, which does exist.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

export type BoardDish = {
  name: Trilingual;
  /** Tiyin. */
  price: number;
  /** On the stop list. Dims on the board, and is not editable from here. */
  soldOut?: boolean;
};

export type BoardColumn = {
  key: string;
  title: Trilingual;
  /**
   * The column's heading colour, as it appears on the dark board.
   *
   * A literal hex rather than a token, and deliberately: these are the board's
   * own palette, mixed for a backlit screen several metres away, and they are
   * not the console's brand ramp. Reusing `--brand-500` here would put a colour
   * chosen for a 14px label on a 40px heading at four metres.
   */
  accent: string;
  items: readonly BoardDish[];
};

export const COLUMNS: readonly BoardColumn[] = [
  {
    key: 'uzbek',
    title: { uz: 'Milliy taomlar', ru: 'Национальная кухня', en: 'Uzbek kitchen' },
    accent: '#7FB0FF',
    items: [
      {
        name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
        price: 48_000_00,
      },
      {
        name: { uz: "Lag'mon, qovurma", ru: 'Лагман жареный', en: 'Lagman, fried' },
        price: 52_000_00,
      },
      { name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pieces' }, price: 38_000_00 },
      {
        name: { uz: "Shashlik, qo'y", ru: 'Шашлык из баранины', en: 'Lamb shashlik' },
        price: 46_000_00,
      },
      { name: { uz: 'Somsa, mol', ru: 'Самса с говядиной', en: 'Beef somsa' }, price: 12_000_00 },
    ],
  },
  {
    key: 'fast',
    title: { uz: 'Fast-casual', ru: 'Фаст-казуал', en: 'Fast casual' },
    accent: '#5EE9B5',
    items: [
      {
        name: { uz: 'Chizburger', ru: 'Чизбургер', en: 'Cheeseburger' },
        price: 39_000_00,
        soldOut: true,
      },
      { name: { uz: 'Double beef', ru: 'Double beef', en: 'Double beef' }, price: 58_000_00 },
      {
        name: { uz: 'Tovuq lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
        price: 32_000_00,
      },
      { name: { uz: 'Margherita 30', ru: 'Маргарита 30', en: 'Margherita 30' }, price: 56_000_00 },
      { name: { uz: 'Pepperoni 30', ru: 'Пепперони 30', en: 'Pepperoni 30' }, price: 64_000_00 },
    ],
  },
  {
    key: 'drinks',
    title: { uz: 'Ichimliklar', ru: 'Напитки', en: 'Drinks' },
    accent: '#FFC46B',
    items: [
      { name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' }, price: 8_000_00 },
      { name: { uz: 'Qora choy', ru: 'Чёрный чай', en: 'Black tea' }, price: 8_000_00 },
      { name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' }, price: 10_000_00 },
      { name: { uz: 'Coca-Cola 0.5', ru: 'Coca-Cola 0.5', en: 'Coca-Cola 0.5' }, price: 14_000_00 },
      { name: { uz: 'Chalop', ru: 'Чалоп', en: 'Chalop' }, price: 12_000_00 },
    ],
  },
];

/** How many dishes on the board are currently dimmed by the stop list. */
export const soldOutCount = (): number =>
  COLUMNS.reduce((n, column) => n + column.items.filter((item) => item.soldOut).length, 0);

export type PlaylistState = 'on' | 'scheduled';

/**
 * The screens that rotate, and how long each holds.
 *
 * A duration in seconds where the screen is always on, and a time window where
 * it is not: breakfast has no seconds because it does not take a turn — it
 * replaces the rotation between eight and eleven and then stops existing.
 */
export type PlaylistEntry = {
  key: string;
  name: Trilingual;
  seconds?: number;
  window?: Trilingual;
  state: PlaylistState;
};

export const PLAYLIST: readonly PlaylistEntry[] = [
  {
    key: 'main',
    name: { uz: 'Asosiy menyu', ru: 'Основное меню', en: 'Main menu' },
    seconds: 20,
    state: 'on',
  },
  {
    key: 'today',
    name: { uz: 'Kunlik taklif', ru: 'Предложение дня', en: "Today's offer" },
    seconds: 8,
    state: 'on',
  },
  {
    key: 'combo',
    name: { uz: 'Kombo takliflar', ru: 'Комбо-предложения', en: 'Combo deals' },
    seconds: 12,
    state: 'on',
  },
  {
    key: 'breakfast',
    name: { uz: 'Nonushta menyusi', ru: 'Меню завтрака', en: 'Breakfast menu' },
    window: { uz: 'faqat 08:00–11:00', ru: 'только 08:00–11:00', en: '08:00–11:00 only' },
    state: 'scheduled',
  },
];

/** One full turn of the rotation, in seconds. Scheduled screens take no turn. */
export const rotationSeconds = (): number =>
  PLAYLIST.reduce((total, entry) => total + (entry.state === 'on' ? (entry.seconds ?? 0) : 0), 0);

export type BannerKind = 'offer' | 'new' | 'loyalty';

export type Banner = {
  key: string;
  text: Trilingual;
  when: Trilingual;
  kind: BannerKind;
  live: boolean;
  /** The board's own colours again — a wash and a text colour for the dark strip. */
  wash: string;
  ink: string;
};

export const BANNERS: readonly Banner[] = [
  {
    key: 'lavash',
    text: {
      uz: 'Ikkinchi lavash 50% chegirma',
      ru: 'Второй лаваш −50%',
      en: 'Second lavash 50% off',
    },
    when: { uz: 'Har kuni 15:00–17:00', ru: 'Ежедневно 15:00–17:00', en: 'Daily 15:00–17:00' },
    kind: 'offer',
    live: true,
    wash: 'rgba(18,183,106,.22)',
    ink: '#5EE9B5',
  },
  {
    key: 'qaynatma',
    text: {
      uz: "Yangi: Qaynatma mol go'sht",
      ru: 'Новинка: кайнатма из говядины',
      en: 'New: beef qaynatma',
    },
    when: { uz: '17.08 — 31.08', ru: '17.08 — 31.08', en: '17.08 — 31.08' },
    kind: 'new',
    live: true,
    wash: 'rgba(46,116,234,.24)',
    ink: '#7FB0FF',
  },
  {
    key: 'birthday',
    text: {
      uz: "Tug'ilgan kunga 10% chegirma",
      ru: '10% скидка в день рождения',
      en: '10% off on your birthday',
    },
    when: { uz: 'Doimiy', ru: 'Постоянно', en: 'Always on' },
    kind: 'loyalty',
    live: false,
    wash: 'rgba(247,144,9,.22)',
    ink: '#FFC46B',
  },
];

/** How many screens this branch drives. Two, in the fixture. */
export const SCREEN_COUNT = 2;

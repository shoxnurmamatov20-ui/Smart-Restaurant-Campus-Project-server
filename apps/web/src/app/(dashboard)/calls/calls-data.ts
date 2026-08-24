/**
 * Order intake — the five inbound channels, as one queue.
 *
 * Read line by line off `docs/design/source/Smart Restaurant OS.dc.html:3872-4247`
 * (the `atCalls` view) and its `callVals()` fixtures at `:10654-10990`. Every
 * count, price, per cent and sentence below is the design's own; nothing here
 * was invented to fill a column.
 *
 * The screen is five tabs, not five stacked sections: `cT1` queue, `cT2` a new
 * order, `cT3` delivery, `cT4` aggregators, `cT5` channels. An earlier build
 * flattened them into one page on the argument that the queue should always be
 * visible — but the design puts the queue first *inside* the strip and gives
 * the operator four KPIs above it that stay put whichever tab is open, which is
 * the same guarantee without hiding four screens.
 *
 * Fixtures, with one exception: the delivery tab's two lists are stitched to
 * `GET /api/v1/orders/deliveries` in `./calls-server.ts`, and the constants
 * below are what that tab falls back to. The other four are fixtures for the
 * reason they always were — `GET /api/v1/orders/orders` lists orders but
 * nothing distinguishes a phone order waiting to be accepted from a dine-in
 * ticket, and the two aggregator integrations do not exist at all. The shapes
 * below are what those endpoints will answer with, so the screen does not move
 * when they land.
 *
 * House rule: types and fixtures here, anything that calls the server in a
 * sibling `*-server.ts` only server components import.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export function say(value: Trilingual, lang: Lang): string {
  return value[lang] || value.uz;
}

/** 1 UZS = 100 tiyin. Design figures are so'm; the app stores tiyin. */
export function som(amount: number): number {
  return amount * 100;
}

/* ============================================================
   The five doors an order can arrive through
   ============================================================ */

/**
 * The design's own keys, kept verbatim.
 *
 * `tel`, `tg`, `web`, `ye`, `uz` — not "phone/telegram/site/yandex/uzum".
 * Renaming them looks tidier and costs the ability to diff this file against
 * `CHANS` at `:10552` when a colour or a channel changes.
 */
export type ChannelKey = 'tel' | 'tg' | 'web' | 'ye' | 'uz' | 'wo';

export const CHANNEL_NAME: Readonly<Record<ChannelKey, Trilingual>> = {
  tel: { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
  tg: { uz: 'Telegram', ru: 'Telegram', en: 'Telegram' },
  web: { uz: 'Sayt', ru: 'Сайт', en: 'Web' },
  ye: { uz: 'Yandex Eats', ru: 'Yandex Eats', en: 'Yandex Eats' },
  uz: { uz: 'Uzum Tezkor', ru: 'Uzum Tezkor', en: 'Uzum Tezkor' },
  /*
   * The sixth lane, which the design does not draw a chip for.
   *
   * `Order::INTAKE_CHANNELS` on the server is six — `phone, telegram, site,
   * yandex, uzum, wolt` — and the design's strip is five. A card that arrives
   * down the sixth still has to render with a name and a colour, so it is here;
   * it is deliberately absent from `CHANNEL_ORDER` below, so no sixth chip is
   * invented in a file that is meant to match the drawing. Those cards show
   * under *Hammasi* and are filtered out by the five, which is the honest
   * behaviour until the design grows the chip.
   */
  wo: { uz: 'Wolt', ru: 'Wolt', en: 'Wolt' },
};

/**
 * `CHANS`, `:10552`. Tokens, never hexes — the one exception is a channel's own
 * brand colour further down, which is not ours to re-token.
 */
export const CHANNEL_TINT: Readonly<Record<ChannelKey, { dot: string; bg: string; fg: string }>> = {
  tel: { dot: 'var(--brand-500)', bg: 'var(--brand-50)', fg: 'var(--brand-700)' },
  tg: { dot: 'var(--accent-500)', bg: 'var(--accent-50)', fg: 'var(--accent-700)' },
  web: { dot: 'var(--n-500)', bg: 'var(--bg-muted)', fg: 'var(--fg-muted)' },
  ye: { dot: 'var(--warning-500)', bg: 'var(--warning-50)', fg: 'var(--warning-700)' },
  uz: { dot: 'var(--danger-500)', bg: 'var(--danger-50)', fg: 'var(--danger-700)' },
  // Wolt's own blue, the way the other four carry their channel's colour.
  wo: { dot: 'var(--accent-600)', bg: 'var(--accent-50)', fg: 'var(--accent-700)' },
};

export const CHANNEL_ORDER: readonly ChannelKey[] = ['tel', 'tg', 'web', 'ye', 'uz'];

/* ============================================================
   1 · The queue
   ============================================================ */

/** `ST`, `:10659`. Three words, and none of them is "pending". */
export type QueueState = 'nw' | 'acc' | 'way';

export const QUEUE_STATE: Readonly<Record<QueueState, Trilingual>> = {
  nw: { uz: 'Yangi', ru: 'Новый', en: 'New' },
  acc: { uz: 'Oshxonada', ru: 'На кухне', en: 'In the kitchen' },
  way: { uz: "Yo'lda", ru: 'В пути', en: 'On the way' },
};

export type QueueOrder = {
  /** The design prints the hash. It is an id a guest reads aloud, not a slug. */
  id: string;
  /**
   * The row behind the card, when there is one.
   *
   * `id` above is what a guest reads down the telephone — `#4824`, or `A-0041`
   * on a live board — and every endpoint is addressed by the database's own
   * integer instead. Absent on the design's own eight, which is exactly what
   * tells the panel it has nothing real to accept or decline.
   */
  rowId?: number;
  channel: ChannelKey;
  customer: Trilingual;
  phone: string;
  address: Trilingual;
  /** How many lines are on the ticket. */
  items: number;
  /** Tiyin. */
  total: number;
  /**
   * Time left against the promise, `m:ss`, or an em dash once it is moot.
   *
   * A string rather than a number of seconds because the design never counts
   * down: it is a figure printed at the moment the page rendered, and turning
   * it into a live timer would be a different product decision.
   */
  sla: string;
  late: boolean;
  state: QueueState;
  pay: Trilingual;
};

export const QUEUE: readonly QueueOrder[] = [
  {
    id: '#4824',
    channel: 'uz',
    customer: {
      uz: 'Uzum Tezkor mijozi',
      ru: 'Клиент Uzum Tezkor',
      en: 'Uzum Tezkor customer',
    },
    phone: '+998 •• ••• 90 33',
    address: {
      uz: "Sergeli, 7-kvartal, Yangi Sergeli ko'chasi 3",
      ru: 'Сергели, 7-й квартал, ул. Янги Сергели 3',
      en: 'Sergeli, block 7, Yangi Sergeli street 3',
    },
    items: 4,
    total: som(174_000),
    sla: '2:05',
    late: true,
    state: 'nw',
    pay: { uz: "Oldindan to'langan", ru: 'Оплачен заранее', en: 'Prepaid' },
  },
  {
    id: '#4822',
    channel: 'ye',
    customer: {
      uz: 'Yandex Eats mijozi',
      ru: 'Клиент Yandex Eats',
      en: 'Yandex Eats customer',
    },
    phone: '+998 •• ••• 44 12',
    address: {
      uz: 'Yunusobod, 4-kvartal, Amir Temur 108',
      ru: 'Юнусабад, 4-й квартал, Амира Темура 108',
      en: 'Yunusobod, block 4, Amir Temur 108',
    },
    items: 5,
    total: som(236_000),
    sla: '1:18',
    late: false,
    state: 'nw',
    pay: { uz: "Oldindan to'langan", ru: 'Оплачен заранее', en: 'Prepaid' },
  },
  {
    id: '#4821',
    channel: 'tel',
    customer: { uz: 'Nilufar Karimova', ru: 'Nilufar Karimova', en: 'Nilufar Karimova' },
    phone: '+998 90 123 45 67',
    address: {
      uz: 'Chilonzor, 12-kvartal, Bunyodkor 41, kv. 18',
      ru: 'Чиланзар, 12-й квартал, Бунёдкор 41, кв. 18',
      en: 'Chilonzor, block 12, Bunyodkor 41, apt 18',
    },
    items: 3,
    total: som(148_000),
    sla: '0:42',
    late: false,
    state: 'nw',
    pay: { uz: 'Naqd, kuryerga', ru: 'Наличные курьеру', en: 'Cash to the courier' },
  },
  {
    id: '#4823',
    channel: 'tg',
    customer: { uz: 'Jahongir Sattorov', ru: 'Jahongir Sattorov', en: 'Jahongir Sattorov' },
    phone: '+998 93 774 22 09',
    address: {
      uz: "Mirzo Ulug'bek, Buyuk Ipak Yo'li 74",
      ru: 'Мирзо Улугбек, Буюк Ипак Йули 74',
      en: "Mirzo Ulug'bek, Buyuk Ipak Yo'li 74",
    },
    items: 2,
    total: som(96_000),
    sla: '0:11',
    late: false,
    state: 'nw',
    pay: { uz: 'Click', ru: 'Click', en: 'Click' },
  },
  {
    id: '#4819',
    channel: 'tel',
    customer: { uz: 'Malika Ergasheva', ru: 'Malika Ergasheva', en: 'Malika Ergasheva' },
    phone: '+998 99 220 15 80',
    address: {
      uz: 'Chilonzor, Qatortol 22',
      ru: 'Чиланзар, Каттортол 22',
      en: 'Chilonzor, Qatortol 22',
    },
    items: 6,
    total: som(312_000),
    sla: '—',
    late: false,
    state: 'acc',
    pay: { uz: 'Karta', ru: 'Карта', en: 'Card' },
  },
  {
    id: '#4818',
    channel: 'web',
    customer: { uz: 'Sanjar Qodirov', ru: 'Sanjar Qodirov', en: 'Sanjar Qodirov' },
    phone: '+998 94 561 07 23',
    address: {
      uz: 'Yunusobod, Shahrisabz 9',
      ru: 'Юнусабад, Шахрисабз 9',
      en: 'Yunusobod, Shahrisabz 9',
    },
    items: 3,
    total: som(128_000),
    sla: '—',
    late: false,
    state: 'way',
    pay: { uz: 'Click', ru: 'Click', en: 'Click' },
  },
  {
    id: '#4817',
    channel: 'tg',
    customer: { uz: 'Zilola Umarova', ru: 'Zilola Umarova', en: 'Zilola Umarova' },
    phone: '+998 90 405 66 71',
    address: {
      uz: 'Termiz Markaz, Alpomish 15',
      ru: 'Термез Центр, Алпомиш 15',
      en: 'Termiz Markaz, Alpomish 15',
    },
    items: 2,
    total: som(84_000),
    sla: '—',
    late: false,
    state: 'way',
    pay: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
  },
  {
    id: '#4816',
    channel: 'ye',
    customer: {
      uz: 'Yandex Eats mijozi',
      ru: 'Клиент Yandex Eats',
      en: 'Yandex Eats customer',
    },
    phone: '+998 •• ••• 12 70',
    address: {
      uz: 'Chilonzor, Lutfiy 6',
      ru: 'Чиланзар, Лутфий 6',
      en: 'Chilonzor, Lutfiy 6',
    },
    items: 4,
    total: som(196_000),
    sla: '—',
    late: false,
    state: 'acc',
    pay: { uz: "Oldindan to'langan", ru: 'Оплачен заранее', en: 'Prepaid' },
  },
];

/* ============================================================
   2 · Compose — the operator taking an order on the telephone
   ============================================================ */

export type ComposeItem = {
  id: string;
  name: Trilingual;
  /** Tiyin. */
  price: number;
  /**
   * The catalogue row this tile stands for, when the menu came from the API.
   *
   * The design's eight tiles carry word ids (`osh`, `lag`) and
   * `POST /orders/orders` takes a `menu_item_id`, so a tile with no number
   * behind it cannot become a line. Absent on the fixtures, which is what keeps
   * the compose flow demonstrating rather than posting nonsense.
   */
  menuItemId?: number;
};

/** `MENU`, `:10719`. Eight tiles, the eight things people ring up about. */
export const COMPOSE_MENU: readonly ComposeItem[] = [
  { id: 'osh', name: { uz: 'Osh', ru: 'Плов', en: 'Plov' }, price: som(42_000) },
  { id: 'lag', name: { uz: "Lag'mon", ru: 'Лагман', en: 'Lagman' }, price: som(38_000) },
  { id: 'som', name: { uz: 'Somsa', ru: 'Самса', en: 'Somsa' }, price: som(12_000) },
  { id: 'bur', name: { uz: 'Burger', ru: 'Бургер', en: 'Burger' }, price: som(46_000) },
  { id: 'lav', name: { uz: 'Lavash', ru: 'Лаваш', en: 'Lavash' }, price: som(34_000) },
  {
    id: 'piz',
    name: { uz: 'Pizza Margarita', ru: 'Pizza Margarita', en: 'Pizza Margarita' },
    price: som(78_000),
  },
  { id: 'cha', name: { uz: 'Choy', ru: 'Чай', en: 'Tea' }, price: som(8_000) },
  { id: 'ayr', name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' }, price: som(12_000) },
];

/** `fee`, `:10746`. Flat, and only on delivery with something in the cart. */
export const DELIVERY_FEE = som(15_000);

/** The one profile the lookup can find, `coCust` at `:10930`. */
export const KNOWN_CUSTOMER = {
  initials: 'NK',
  name: 'Nilufar Karimova',
  orders: 24,
  meta: {
    uz: 'buyurtma · oxirgisi 4 kun oldin',
    ru: 'заказа · последний 4 дня назад',
    en: 'orders · last one 4 days ago',
  } satisfies Trilingual,
  address: {
    uz: 'Chilonzor, 12-kvartal, Bunyodkor 41, kv. 18',
    ru: 'Чиланзар, 12-й квартал, Бунёдкор 41, кв. 18',
    en: 'Chilonzor, block 12, Bunyodkor 41, apt 18',
  } satisfies Trilingual,
  favourite: {
    uz: 'Odatda buyurtma qiladi: Osh × 2, Ayron',
    ru: 'Обычно заказывает: Плов × 2, Айран',
    en: 'Usually orders: Plov × 2, Ayran',
  } satisfies Trilingual,
  /** Tiyin. */
  spend: som(3_840_000),
} as const;

/* ============================================================
   3 · Delivery — who is out, and what is waiting for them
   ============================================================ */

/** `CU`, `:10761`. Four states; "waiting for a courier" is one of them. */
export type CourierState = 'waiting' | 'free' | 'onway' | 'returning';

export const COURIER_STATE: Readonly<
  Record<CourierState, { label: Trilingual; dot: string; bg: string; fg: string }>
> = {
  waiting: {
    label: { uz: 'Kuryer kutmoqda', ru: 'Ждёт курьера', en: 'Waiting' },
    dot: 'var(--warning-500)',
    bg: 'var(--warning-50)',
    fg: 'var(--warning-700)',
  },
  free: {
    label: { uz: "Bo'sh", ru: 'Свободен', en: 'Free' },
    dot: 'var(--success-500)',
    bg: 'var(--success-50)',
    fg: 'var(--success-700)',
  },
  onway: {
    label: { uz: "Yo'lda", ru: 'В пути', en: 'On the way' },
    dot: 'var(--brand-500)',
    bg: 'var(--brand-50)',
    fg: 'var(--brand-700)',
  },
  returning: {
    label: { uz: 'Qaytmoqda', ru: 'Возвращается', en: 'Returning' },
    dot: 'var(--n-400)',
    bg: 'var(--bg-muted)',
    fg: 'var(--fg-muted)',
  },
};

export type Courier = {
  name: string;
  initials: string;
  vehicle: Trilingual;
  state: CourierState;
  /** Orders on this run. Zero reads as "no load", never as "0". */
  load: number;
};

export const COURIERS: readonly Courier[] = [
  {
    name: 'Bekzod Tursunov',
    initials: 'BT',
    vehicle: {
      uz: 'Mototsikl · TM 4180',
      ru: 'Мотоцикл · TM 4180',
      en: 'Motorcycle · TM 4180',
    },
    state: 'onway',
    load: 2,
  },
  {
    name: 'Aziz Xolmatov',
    initials: 'AX',
    vehicle: { uz: 'Velosiped', ru: 'Велосипед', en: 'Bicycle' },
    state: 'free',
    load: 0,
  },
  {
    name: "Rustam Yo'ldoshev",
    initials: 'RY',
    vehicle: {
      uz: 'Mototsikl · TM 2907',
      ru: 'Мотоцикл · TM 2907',
      en: 'Motorcycle · TM 2907',
    },
    state: 'onway',
    load: 1,
  },
  {
    name: 'Shohruh Nazarov',
    initials: 'SN',
    vehicle: {
      uz: 'Avtomobil · 01 A 774 BC',
      ru: 'Автомобиль · 01 A 774 BC',
      en: 'Car · 01 A 774 BC',
    },
    state: 'returning',
    load: 0,
  },
  {
    name: 'Doston Aliyev',
    initials: 'DA',
    vehicle: {
      uz: 'Mototsikl · TM 1155',
      ru: 'Мотоцикл · TM 1155',
      en: 'Motorcycle · TM 1155',
    },
    state: 'free',
    load: 0,
  },
];

export type Assignment = {
  id: string;
  /** Tiyin. */
  total: number;
  address: Trilingual;
  due: Trilingual;
  late: boolean;
};

export const TO_ASSIGN: readonly Assignment[] = [
  {
    id: '#4824',
    total: som(174_000),
    address: {
      uz: 'Sergeli, Yangi Sergeli 3',
      ru: 'Сергели, Янги Сергели 3',
      en: 'Sergeli, Yangi Sergeli 3',
    },
    due: { uz: '12 daqiqa kechikdi', ru: 'опоздание 12 минут', en: '12 minutes late' },
    late: true,
  },
  {
    id: '#4821',
    total: som(148_000),
    address: {
      uz: 'Chilonzor, Bunyodkor 41',
      ru: 'Чиланзар, Бунёдкор 41',
      en: 'Chilonzor, Bunyodkor 41',
    },
    due: {
      uz: '18 daqiqada yetkazish',
      ru: 'доставить за 18 минут',
      en: 'deliver within 18 minutes',
    },
    late: false,
  },
  {
    id: '#4823',
    total: som(96_000),
    address: {
      uz: "Mirzo Ulug'bek, Buyuk Ipak Yo'li 74",
      ru: 'Мирзо Улугбек, Буюк Ипак Йули 74',
      en: "Mirzo Ulug'bek, Buyuk Ipak Yo'li 74",
    },
    due: {
      uz: '26 daqiqada yetkazish',
      ru: 'доставить за 26 минут',
      en: 'deliver within 26 minutes',
    },
    late: false,
  },
];

/** Whoever the design assigns to, every time: `:10783`. */
export const ASSIGN_TO = 'Bekzod Tursunov';

/* ============================================================
   4 · Aggregators
   ============================================================ */

export type Aggregator = {
  key: string;
  name: string;
  connected: boolean;
  /** Written as the design writes it — a whole per cent, not basis points. */
  fee: string;
  orders: number;
  /** Tiyin. Zero prints as an em dash, never as "0". */
  revenue: number;
  sync: Trilingual;
};

export const AGGREGATORS: readonly Aggregator[] = [
  {
    key: 'ye',
    name: 'Yandex Eats',
    connected: true,
    fee: '18%',
    orders: 34,
    revenue: som(6_200_000),
    sync: { uz: '4 daqiqa oldin', ru: '4 минуты назад', en: '4 minutes ago' },
  },
  {
    key: 'uz',
    name: 'Uzum Tezkor',
    connected: true,
    fee: '15%',
    orders: 21,
    revenue: som(3_800_000),
    sync: { uz: '11 daqiqa oldin', ru: '11 минут назад', en: '11 minutes ago' },
  },
  {
    key: 'wo',
    name: 'Wolt',
    connected: false,
    fee: '20%',
    orders: 0,
    revenue: 0,
    sync: { uz: 'Ulanmagan', ru: 'Не подключено', en: 'Not connected' },
  },
];

export const AGG_AUTO_ON: Trilingual = {
  uz: 'Buyurtmalar avtomatik qabul qilinadi',
  ru: 'Заказы принимаются автоматически',
  en: 'Orders are accepted automatically',
};

export const AGG_AUTO_OFF: Trilingual = {
  uz: 'Har bir buyurtmani operator tasdiqlaydi',
  ru: 'Каждый заказ подтверждает оператор',
  en: 'The operator confirms every order',
};

/* ============================================================
   5 · Channels — the routing tab
   ============================================================ */

export type ChannelRow = {
  key: ChannelKey;
  /** One letter in the design's 34px square. `W`, `T`, `P`, `Y`, `U`. */
  initial: string;
  name: Trilingual;
  /** A domain, a bot handle, a telephone number or a contract number. */
  owner: Trilingual;
  /** The channel's own brand colour where it has one; a token where it does not. */
  colour: string;
  tint: string;
  orders: number;
  /** Tiyin. */
  revenue: number;
  /** Commission per cent. Zero means the restaurant's own door. */
  fee: number;
  /** What is left after the commission, as a per cent of revenue. */
  netPercent: number;
  route: readonly Trilingual[];
  /** Orders from this channel out with a courier right now. */
  live: number;
};

const INTAKE: Trilingual = { uz: 'Qabul', ru: 'Приём', en: 'Intake' };
const COURIER: Trilingual = { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' };
const AUTO: Trilingual = { uz: 'Avtomatik', ru: 'Автоматически', en: 'Auto' };
const KDS: Trilingual = { uz: 'KDS', ru: 'KDS', en: 'KDS' };
const plain = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

export const CHANNEL_ROWS: readonly ChannelRow[] = [
  {
    key: 'web',
    initial: 'W',
    name: { uz: 'Restoran sayti', ru: 'Сайт ресторана', en: 'Restaurant site' },
    owner: plain('oshxona.smartrestaurant.uz'),
    colour: 'var(--brand-600)',
    tint: 'var(--brand-50)',
    orders: 34,
    revenue: som(4_120_000),
    fee: 0,
    netPercent: 100,
    route: [{ uz: 'Sayt', ru: 'Сайт', en: 'Site' }, INTAKE, KDS, COURIER],
    live: 2,
  },
  {
    key: 'tg',
    initial: 'T',
    name: plain('Telegram'),
    owner: plain('@oshxona_bot'),
    colour: '#229ED9',
    tint: 'rgba(34,158,217,.10)',
    orders: 41,
    revenue: som(4_980_000),
    fee: 0,
    netPercent: 100,
    route: [plain('Telegram'), INTAKE, KDS, COURIER],
    live: 3,
  },
  {
    key: 'tel',
    initial: 'P',
    name: { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
    owner: plain('+998 71 200 40 40'),
    colour: 'var(--accent-600)',
    tint: 'var(--accent-50)',
    orders: 28,
    revenue: som(3_640_000),
    fee: 0,
    netPercent: 100,
    route: [
      { uz: "Qo'ng'iroq", ru: 'Звонок', en: 'Call' },
      { uz: 'Operator', ru: 'Оператор', en: 'Operator' },
      KDS,
      COURIER,
    ],
    live: 1,
  },
  {
    key: 'ye',
    initial: 'Y',
    name: plain('Yandex Eats'),
    owner: { uz: 'Shartnoma #YE-2214', ru: 'Договор #YE-2214', en: 'Contract #YE-2214' },
    colour: '#FC3F1D',
    tint: 'rgba(252,63,29,.10)',
    orders: 19,
    revenue: som(3_820_000),
    fee: 27,
    netPercent: 73,
    route: [
      plain('Yandex'),
      AUTO,
      KDS,
      { uz: 'Yandex kuryeri', ru: 'Курьер Yandex', en: 'Yandex courier' },
    ],
    live: 2,
  },
  {
    key: 'uz',
    initial: 'U',
    name: plain('Uzum Tezkor'),
    owner: { uz: 'Shartnoma #UZ-8871', ru: 'Договор #UZ-8871', en: 'Contract #UZ-8871' },
    colour: '#7B2FF7',
    tint: 'rgba(123,47,247,.10)',
    orders: 12,
    revenue: som(2_180_000),
    fee: 22,
    netPercent: 78,
    route: [
      plain('Uzum'),
      AUTO,
      KDS,
      { uz: 'Uzum kuryeri', ru: 'Курьер Uzum', en: 'Uzum courier' },
    ],
    live: 1,
  },
];

export type AutomationRule = {
  key: string;
  label: Trilingual;
  /** Why it exists, and what breaks when it is off. The design writes both. */
  note: Trilingual;
  on: boolean;
};

export const AUTOMATION_RULES: readonly AutomationRule[] = [
  {
    key: 'auto',
    label: {
      uz: "Oldindan to'langan buyurtmani avtomatik qabul qilish",
      ru: 'Автоматически принимать предоплаченные заказы',
      en: 'Auto-accept prepaid orders',
    },
    note: {
      uz: "Pul o'tgan bo'lsa operator tasdig'i kerak emas — chek darhol oshxonaga chiqadi.",
      ru: 'Если оплата прошла, подтверждение оператора не нужно — чек сразу уходит на кухню.',
      en: 'Once payment clears, no operator confirmation is needed — the ticket goes straight to the kitchen.',
    },
    on: true,
  },
  {
    key: 'stop',
    label: {
      uz: "Stop-listdagi taomni saytda darhol o'chirish",
      ru: 'Мгновенно скрывать стоп-лист на сайте',
      en: "Hide 86'd items on the site instantly",
    },
    note: {
      uz: "Oshpaz belgilaganda taom sayt va Telegramda ham xiralashadi. O'chirilsa, mijoz mavjud bo'lmagan taomni buyurtma qiladi.",
      ru: 'Когда повар отмечает, блюдо гаснет и на сайте, и в Telegram. Если выключить, гость закажет то, чего нет.',
      en: 'When the kitchen flags an item it dims on the site and in Telegram too. Turn this off and guests order what you do not have.',
    },
    on: true,
  },
  {
    key: 'cap',
    label: {
      uz: "Band soatlarda onlayn buyurtmani to'xtatish",
      ru: 'Останавливать онлайн-заказы в час пик',
      en: 'Pause online orders at peak',
    },
    note: {
      uz: "Oshxonada 12 dan ko'p chek turganda yangi onlayn buyurtma qabul qilinmaydi. Kechikkan buyurtma yomon bahodan yaxshiroq emas.",
      ru: 'Если на кухне больше 12 чеков, новые онлайн-заказы не принимаются. Опоздавший заказ не лучше плохой оценки.',
      en: 'Above 12 open kitchen tickets, new online orders stop. A late order is no better than a bad rating.',
    },
    on: true,
  },
  {
    key: 'call',
    label: {
      uz: "Naqd to'lovda operator qo'ng'iroq qilsin",
      ru: 'Звонок оператора при оплате наличными',
      en: 'Operator calls for cash orders',
    },
    note: {
      uz: 'Naqd buyurtmalarda manzil va summa tasdiqlanadi — bu bekor qilishlarni kamaytiradi.',
      ru: 'При наличных подтверждаются адрес и сумма — это снижает отказы.',
      en: 'For cash orders the address and total are confirmed — that cuts cancellations.',
    },
    on: false,
  },
];

/** `chPrepOpts`, `:10884`. Four choices, and 25 is the one that ships. */
export const PREP_OPTIONS: readonly number[] = [15, 25, 40, 60];

export const PREP_DEFAULT = 25;

/**
 * How many open kitchen dockets counts as "buried".
 *
 * The number inside the third automation rule's own sentence — *"Oshxonada 12
 * dan ko'p chek turganda"* — pulled out as a constant because the server now
 * holds it too (`orders.intake_policies.peak_ticket_limit`) and a ceiling
 * written in two places is a ceiling that disagrees with itself on the first
 * change. This is the value a console with no session draws; a live one reads
 * the venue's.
 */
export const PEAK_TICKETS_DEFAULT = 12;

/**
 * What the screen says about the prep time the operator just chose.
 *
 * Three sentences, not one: too short is a promise the kitchen cannot keep with
 * twelve tickets open, too long is a number Yandex and Uzum print beside your
 * name. Only the middle one is calm, and only it gets the quiet background.
 */
export const PREP_WARNING = {
  short: {
    uz: "15 daqiqa faqat bo'sh oshxonada real. Hozir 12 chek turibdi — kechikish ehtimoli yuqori.",
    ru: '15 минут реальны только на свободной кухне. Сейчас 12 чеков — вероятность опоздания высокая.',
    en: '15 minutes is only real on an empty kitchen. There are 12 open tickets now, so lateness is likely.',
  } satisfies Trilingual,
  long: {
    uz: "60 daqiqa mijozni yo'qotadi. Yandex va Uzum bu vaqtni ko'rsatadi va reytingingiz tushadi.",
    ru: '60 минут теряют гостя. Yandex и Uzum показывают это время, и рейтинг падает.',
    en: '60 minutes loses the guest. Yandex and Uzum display this time and your rating drops.',
  } satisfies Trilingual,
  fine: {
    uz: "Bu vaqt mijozga sayt, Telegram va agregatorlarda ko'rinadi. Oshxona yuklamasi oshsa, tizim o'zi 10 daqiqa qo'shadi.",
    ru: 'Это время видит гость на сайте, в Telegram и у агрегаторов. При росте загрузки кухни система сама добавит 10 минут.',
    en: 'The guest sees this time on the site, in Telegram and at the aggregators. As kitchen load rises the system adds 10 minutes itself.',
  } satisfies Trilingual,
} as const;

/* ============================================================
   The four figures above the strip
   ============================================================ */

export type IntakeKpi = {
  label: Trilingual;
  value: string;
  delta: Trilingual;
  tone: 'success' | 'muted';
};

/** `cKpis`, `:10920`. The average ticket is money, so it is built from tiyin. */
export const INTAKE_AVERAGE = som(168_000);

export const INTAKE_KPIS: readonly Omit<IntakeKpi, 'value'>[] = [
  {
    label: { uz: 'Bugun qabul qilingan', ru: 'Принято сегодня', en: 'Taken today' },
    delta: { uz: '+12 kechagiga nisbatan', ru: '+12 ко вчерашнему', en: '+12 vs yesterday' },
    tone: 'success',
  },
  {
    label: { uz: "O'rtacha javob vaqti", ru: 'Среднее время ответа', en: 'Average answer time' },
    delta: { uz: '−0:07', ru: '−0:07', en: '−0:07' },
    tone: 'success',
  },
  {
    label: { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Average order' },
    delta: { uz: '+4.2%', ru: '+4.2%', en: '+4.2%' },
    tone: 'success',
  },
  {
    label: { uz: 'Rad etilgan', ru: 'Отклонено', en: 'Declined' },
    delta: { uz: '3.4% buyurtmadan', ru: '3.4% заказов', en: '3.4% of orders' },
    tone: 'muted',
  },
];

/* ============================================================
   What the screen says back
   ============================================================ */

export const CALLS_COPY = {
  accepted: {
    uz: 'qabul qilindi va oshxonaga yuborildi',
    ru: 'принят и отправлен на кухню',
    en: 'accepted and sent to the kitchen',
  },
  declined: {
    uz: 'rad etildi · mijozga xabar yuborildi',
    ru: 'отклонён · клиент уведомлён',
    en: 'declined · the customer was notified',
  },
  needFullPhone: {
    uz: "Telefon raqamini to'liq kiriting",
    ru: 'Введите номер полностью',
    en: 'Enter the full phone number',
  },
  found: {
    uz: 'Mijoz topildi: Nilufar Karimova',
    ru: 'Клиент найден: Нилуфар Каримова',
    en: 'Customer found: Nilufar Karimova',
  },
  notFound: {
    uz: 'Bazada topilmadi · yangi mijoz',
    ru: 'Не найден · новый клиент',
    en: 'Not in the base · new customer',
  },
  pickDishesFirst: {
    uz: 'Avval taom tanlang',
    ru: 'Сначала выберите блюда',
    en: 'Pick some dishes first',
  },
  sentToKitchen: {
    uz: 'Buyurtma oshxonaga yuborildi · ',
    ru: 'Заказ отправлен на кухню · ',
    en: 'Order sent to the kitchen · ',
  },
  channelOff: {
    uz: "o'chirildi · yangi buyurtma kelmaydi",
    ru: 'отключён · новые заказы не поступают',
    en: 'disabled · no new orders arrive',
  },
  channelOn: {
    uz: 'ulandi · buyurtmalar qabulga tushadi',
    ru: 'подключён · заказы идут в приём',
    en: 'connected · orders land in intake',
  },
  etaDelivery: {
    uz: 'Taxminiy yetkazish: 35–45 daqiqa',
    ru: 'Ориентировочная доставка: 35–45 минут',
    en: 'Estimated delivery: 35–45 minutes',
  },
  etaPickup: {
    uz: 'Olib ketishga tayyor: 20 daqiqa',
    ru: 'Готов к самовывозу: 20 минут',
    en: 'Ready for pickup: 20 minutes',
  },
  assigned: { uz: 'Biriktirildi', ru: 'Назначен', en: 'Assigned' },
  assign: { uz: 'Biriktirish', ru: 'Назначить', en: 'Assign' },
  assignedTo: {
    uz: 'Bekzod Tursunovga biriktirildi',
    ru: 'Назначен Бекзоду Турсунову',
    en: 'Assigned to Bekzod Tursunov',
  },
  noLoad: { uz: "yuklama yo'q", ru: 'без нагрузки', en: 'no load' },
  orders: { uz: 'buyurtma', ru: 'заказа', en: 'orders' },

  /*
   * The caller card's second and fourth lines, for a guest the API answered
   * with. `{n}` is substituted at the call site rather than by the i18n
   * catalogue, which this file does not use — the same device `board-panels.tsx`
   * uses for its item counts.
   */
  lastSeenToday: { uz: 'oxirgisi bugun', ru: 'последний сегодня', en: 'last one today' },
  lastSeenDaysAgo: {
    uz: 'oxirgisi {n} kun oldin',
    ru: 'последний {n} дн назад',
    en: 'last one {n} days ago',
  },
  lastSeenNever: { uz: 'hali kelmagan', ru: 'ещё не приходил', en: 'never been in' },
  usuallyOrders: {
    uz: 'Odatda buyurtma qiladi:',
    ru: 'Обычно заказывает:',
    en: 'Usually orders:',
  },
  items: { uz: 'pozitsiya', ru: 'позиции', en: 'items' },
  connected: { uz: 'Ulangan', ru: 'Подключено', en: 'Connected' },
  notConnected: { uz: 'Ulanmagan', ru: 'Не подключено', en: 'Not connected' },
  channelConnected: { uz: 'Ulangan', ru: 'Подключён', en: 'Connected' },
  channelDisabled: { uz: "O'chirilgan", ru: 'Отключён', en: 'Disabled' },
  commissionNone: { uz: "yo'q", ru: 'нет', en: 'none' },
  cellToday: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' },
  cellRevenue: { uz: 'Tushum', ru: 'Выручка', en: 'Revenue' },
  cellCommission: { uz: 'Komissiya', ru: 'Комиссия', en: 'Commission' },
  cellLive: { uz: "Hozir yo'lda", ru: 'Сейчас в пути', en: 'Live now' },
  minutesShort: { uz: 'daq', ru: 'мин', en: 'min' },
  soum: { uz: "so'm", ru: 'сум', en: 'UZS' },

  /*
   * How a live card says the guest is settling.
   *
   * The design's eight fixtures write these out per card — "Oldindan to'langan",
   * "Naqd, kuryerga" — because a fixture is a drawing. A real board has two
   * columns to read them off (`payment_state` and `payment_method`), and the
   * sentence has to come from somewhere: here, once, rather than assembled in
   * the seam where nobody would find it to translate.
   */
  prepaid: { uz: "Oldindan to'langan", ru: 'Оплачен заранее', en: 'Prepaid' },
  cashToCourier: { uz: 'Naqd, kuryerga', ru: 'Наличные курьеру', en: 'Cash to the courier' },
  cardOnDelivery: { uz: 'Karta, yetkazishda', ru: 'Карта при доставке', en: 'Card on delivery' },
  online: { uz: 'Onlayn', ru: 'Онлайн', en: 'Online' },
  unpaid: { uz: "To'lanmagan", ru: 'Не оплачен', en: 'Unpaid' },
  /* A card with no name on it: an aggregator order, or somebody who gave none. */
  walkIn: { uz: 'Mehmon', ru: 'Гость', en: 'Guest' },
} as const satisfies Readonly<Record<string, Trilingual>>;

/** What a channel leaves after its commission, tiyin. */
export function afterCommission(row: ChannelRow): number {
  return Math.round((row.revenue * row.netPercent) / 100);
}

/* ============================================================
   The screen's own chrome

   Still here rather than in `src/i18n`, and it is the last of these left: the
   settings panels, the export dialog, the tenant card and the console's
   pending-action toasts all moved into `console.*` so the three languages are
   checked against each other. This one has not, because moving it means
   rewriting every `say(CALLS_UI.x, lang)` call in `calls-panels.tsx` into a
   `useMessages()` read, and that file is being worked on elsewhere. Each string
   is the design's own `P("uz","ru","en")` triple, copied rather than
   translated.
   ============================================================ */

export const CALLS_UI = {
  lineOpen: { uz: 'Liniya ochiq', ru: 'Линия открыта', en: 'Line open' },
  newOrder: { uz: 'Yangi buyurtma', ru: 'Новый заказ', en: 'New order' },

  tabQueue: { uz: 'Navbat', ru: 'Очередь', en: 'Queue' },
  tabCompose: { uz: 'Yangi buyurtma', ru: 'Новый заказ', en: 'New order' },
  tabDelivery: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
  tabAggregators: { uz: 'Agregatorlar', ru: 'Агрегаторы', en: 'Aggregators' },
  tabChannels: { uz: 'Kanallar', ru: 'Каналы', en: 'Channels' },

  chipAll: { uz: 'Hammasi', ru: 'Все', en: 'All' },
  waiting: { uz: 'kutmoqda', ru: 'ожидает', en: 'waiting' },
  decline: { uz: 'Rad etish', ru: 'Отклонить', en: 'Decline' },
  accept: { uz: 'Qabul qilish', ru: 'Принять', en: 'Accept' },
  declined: { uz: 'Rad etildi', ru: 'Отклонён', en: 'Declined' },
  demoQueue: {
    uz: 'Namunaviy navbat',
    ru: 'Демо-очередь',
    en: 'Sample queue',
  },
  emptyQueue: {
    uz: "Bu kanalda navbat bo'sh",
    ru: 'В этом канале очередь пуста',
    en: 'No orders in this channel',
  },
  emptyQueueSub: {
    uz: 'Boshqa kanalni tanlang yoki yangi buyurtma qabul qiling',
    ru: 'Выберите другой канал или примите новый заказ',
    en: 'Pick another channel or take a new order',
  },

  step1: { uz: 'Mijozni aniqlash', ru: 'Определить клиента', en: 'Identify the customer' },
  step1Sub: {
    uz: 'Raqamni kiriting — tizim mijozni bazadan topadi',
    ru: 'Введите номер — система найдёт клиента в базе',
    en: 'Enter the number and the system finds the customer',
  },
  lookUp: { uz: 'Topish', ru: 'Найти', en: 'Look up' },
  lifetimeSpend: { uz: 'jami xarid', ru: 'всего покупок', en: 'lifetime spend' },
  newCustomer: { uz: 'Yangi mijoz', ru: 'Новый клиент', en: 'New customer' },
  newCustomerSub: {
    uz: 'Buyurtma yuborilganda karta avtomatik ochiladi',
    ru: 'Карточка откроется автоматически при отправке заказа',
    en: 'A profile opens automatically when the order is sent',
  },
  step2: { uz: 'Taomlarni tanlash', ru: 'Выбрать блюда', en: 'Choose the dishes' },
  step2Sub: {
    uz: "Eng ko'p buyurtma qilinadigan pozitsiyalar",
    ru: 'Самые заказываемые позиции',
    en: 'The most-ordered items',
  },
  step3: { uz: "Yetkazish va to'lov", ru: 'Доставка и оплата', en: 'Delivery and payment' },
  orderType: { uz: 'Turi', ru: 'Тип', en: 'Type' },
  deliver: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
  pickup: { uz: 'Olib ketish', ru: 'Самовывоз', en: 'Pickup' },
  payHow: { uz: "To'lov", ru: 'Оплата', en: 'Payment' },
  payCash: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
  payCard: { uz: 'Karta', ru: 'Карта', en: 'Card' },
  cart: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order' },
  cartEmpty: {
    uz: "Hozircha bo'sh. Chapdagi ro'yxatdan taom tanlang.",
    ru: 'Пока пусто. Выберите блюда из списка слева.',
    en: 'Empty for now. Pick dishes from the list on the left.',
  },
  subtotal: { uz: 'Taomlar', ru: 'Блюда', en: 'Items' },
  deliveryFee: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
  total: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  send: { uz: 'Oshxonaga yuborish', ru: 'Отправить на кухню', en: 'Send to the kitchen' },
  clear: { uz: 'Tozalash', ru: 'Очистить', en: 'Clear' },

  couriers: { uz: 'Kuryerlar', ru: 'Курьеры', en: 'Couriers' },
  couriersSub: {
    uz: 'Smenadagi kuryerlar va ularning yuklamasi',
    ru: 'Курьеры на смене и их загрузка',
    en: 'Couriers on shift and their load',
  },
  assignTo: { uz: 'Biriktirish', ru: 'Назначить', en: 'Assign' },
  otherRider: { uz: 'Boshqa kuryer', ru: 'Другой курьер', en: 'Another courier' },
  noRider: {
    uz: "Bo'sh kuryer yo'q",
    ru: 'Свободных курьеров нет',
    en: 'No courier is free',
  },
  sending: { uz: 'Yuborilmoqda…', ru: 'Отправляется…', en: 'Sending…' },
  toAssign: { uz: 'Kuryer kutmoqda', ru: 'Ждут курьера', en: 'Waiting for a courier' },
  toAssignSub: {
    uz: 'Tayyor, lekin hali biriktirilmagan',
    ru: 'Готовы, но ещё не назначены',
    en: 'Ready but not yet assigned',
  },

  /* The two states the compose flow can be in when the catalogue answers. */
  composeEmpty: {
    uz: "Sotuvdagi taom yo'q. Avval menyuga taom qo'shing.",
    ru: 'В продаже нет ни одного блюда. Сначала добавьте блюда в меню.',
    en: 'Nothing is on sale yet. Add dishes to the menu first.',
  },
  composeOpenMenu: {
    uz: "Menyuga o'tish →",
    ru: 'Перейти в меню →',
    en: 'Open the menu →',
  },

  /* The aggregator tab, which is a contract rather than a screen. */
  aggNone: {
    uz: 'Agregator hali ulanmagan. Ulanish shartnoma bilan ochiladi — Yandex Eats, Uzum Tezkor va Wolt uchun alohida.',
    ru: 'Ни один агрегатор не подключён. Подключение открывается по договору — отдельно для Yandex Eats, Uzum Tezkor и Wolt.',
    en: 'No aggregator is connected. Each of Yandex Eats, Uzum Tezkor and Wolt is opened by its own contract.',
  },

  aggOrders: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' },
  aggRevenue: { uz: 'Tushum', ru: 'Выручка', en: 'Revenue' },
  aggFee: { uz: 'Komissiya', ru: 'Комиссия', en: 'Commission' },
  aggSync: { uz: 'Menyu sinxroni', ru: 'Синхронизация меню', en: 'Menu sync' },

  route: { uz: "Yo'l:", ru: 'Путь:', en: 'Path:' },
  rulesHead: { uz: 'Avtomatik qoidalar', ru: 'Автоматические правила', en: 'Automation rules' },
  rulesSub: {
    uz: "Operator har bir buyurtmani qo'lda ko'rmasligi kerak. Qoida qanchalik ko'p ishlasa, xato shunchalik kam.",
    ru: 'Оператор не должен вручную смотреть каждый заказ. Чем больше работает правил, тем меньше ошибок.',
    en: 'The operator should not review every order by hand. The more rules do the work, the fewer mistakes.',
  },
  prepHead: { uz: 'Tayyorlash vaqti', ru: 'Время приготовления', en: 'Prep time' },
  prepSub: {
    uz: "Mijozga ko'rsatiladigan vaqt. Bitta raqam — barcha kanallar uchun.",
    ru: 'Время, которое видит гость. Одно число для всех каналов.',
    en: 'The time the guest sees. One number across every channel.',
  },
  prepUnit: {
    uz: 'daqiqa · barcha onlayn kanallar',
    ru: 'минут · все онлайн-каналы',
    en: 'minutes · all online channels',
  },
  /*
   * The line under a switch the server stores but does not act on.
   *
   * The same distinction the door switches draw with `enforced`: a switch that
   * records an intention and a switch that changes what happens look identical
   * and are not. Three of the four rules are the first kind today — each needs
   * a producer this platform does not have — and an operator who believes
   * auto-accept is accepting anything stops watching the queue.
   */
  ruleNoted: {
    uz: "Saqlandi — lekin server bu qoidani hali bajarmaydi, buyurtmalarni o'zingiz qabul qiling.",
    ru: 'Сохранено — но сервер это правило пока не выполняет, принимайте заказы сами.',
    en: 'Saved — but the server does not act on this rule yet; keep answering by hand.',
  },
  /* When the prep time will not save: the picker goes back to what is quoted. */
  prepFailed: {
    uz: "Vaqt saqlanmadi — mijozga hamon avvalgi vaqt ko'rsatiladi.",
    ru: 'Время не сохранено — гость по-прежнему видит прежнее.',
    en: 'The time was not saved — the guest still sees the previous one.',
  },
  commissionHead: {
    uz: 'Kanaldan qolgan pul',
    ru: 'Что остаётся с канала',
    en: 'What each channel leaves you',
  },
  commissionSub: {
    uz: "Bir xil taom, boshqa foyda. Komissiya to'langandan keyin qolgan summa.",
    ru: 'Одно блюдо, разная прибыль. Сумма после вычета комиссии.',
    en: 'The same dish, different profit. The amount left after commission.',
  },
  commissionNote: {
    uz: "O'z kanallaringizda komissiya yo'q — shuning uchun mijozni saytga va Telegramga o'tkazish agregatorda sotishdan foydali. Har 100 mijozdan 10 tasi o'z kanalga o'tsa, oyiga 2.4 mln so'm qoladi.",
    ru: 'В своих каналах комиссии нет — поэтому переводить гостя на сайт и в Telegram выгоднее, чем продавать через агрегатор. Если 10 из 100 гостей перейдут, в месяц останется 2.4 млн сум.',
    en: "Your own channels carry no commission — moving a guest to the site or Telegram beats selling through an aggregator. Shift 10 guests in 100 and you keep 2.4M so'm a month.",
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

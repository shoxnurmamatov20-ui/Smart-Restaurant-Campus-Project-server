import { MARKETPLACE_COMMISSION_PERCENT } from '@restaurant/surfaces/mp/data';
/**
 * The merchant panel's fixtures, transcribed from the design file.
 *
 * `files/MyPOS Marketplace - Do'kon paneli.dc.html` — `ORD` (:927-946),
 * `OST` (:948), `PAYN` (:955), `DISH` (:1006-1016), `setRows` (:1051-1064),
 * `DSP` (:1098-1115), `promos` (:1362-1395) and the arrays around them.
 *
 * **Why a second file rather than more of `merchant-copy.ts`.** That one holds
 * the design's `t` object — the labels and the paragraphs — and it is written
 * out three times, once per language. Everything here is a *record* rather than
 * a label: an order, a dispute, a payout. Records carry money and money is a
 * number in tiyin, formatted once at the edge by `som()`, so writing them three
 * times would mean three copies of every amount and three chances for one of
 * them to drift. Their handful of translated fields sit inline as `Trilingual`,
 * which is the same shape the design's own `P(uz, ru, en)` has.
 *
 * These are the shape the module answers in, and they are still the fixtures
 * every screen falls back to when it cannot reach it — `merchant-server.ts`
 * maps the live rows into exactly these types. The one thing to know when
 * reading them is that a fixture id is never a real one (`o1`, `d1`, `p1`), so
 * `apiId()` is what every write on this surface asks before it sends.
 */

import type { Lang, Trilingual } from '@restaurant/surfaces/mp/data';

/* One `say()` for the whole product: the merchant panel and the consumer side
   read the same `{uz, ru, en}` shape, and a second implementation of "pick the
   reader's language" is a second place for a missing key to fall back wrong. */
export { say } from '@restaurant/surfaces/mp/data';
export type { Lang, Trilingual };

/** 1 UZS = 100 tiyin. The design writes so‘m; the platform stores tiyin. */
const som = (value: number): number => value * 100;

/* ============================================================ the sidebar */

/**
 * Three groups, and they are the design's — `Do'kon paneli.dc.html:85-115`.
 *
 * **Kunlik ish · Pul · O‘sish**, with settings pinned to the foot below a
 * divider. The build had invented its own three (Hozir · Do‘kon · Pul) with
 * nine rows, four of which went nowhere. That is worse than a shorter rail on
 * the panel a business is *paid* through: a merchant who cannot find "Nizolar"
 * concludes complaints are handled somewhere they cannot see.
 *
 * The two badges are counts a merchant has to act on — orders awaiting an
 * answer in red, open disputes in amber — and nothing else carries one.
 */
export type MerchantNav = {
  key: string;
  href: string;
  label: Trilingual;
  /** `pending` counts unanswered orders, `disputes` counts open disputes. */
  badge?: 'pending' | 'disputes';
  badgeTone?: 'danger' | 'warning';
};

export type MerchantNavGroup = { key: 'daily' | 'money' | 'grow'; items: readonly MerchantNav[] };

export const MERCHANT_NAV: readonly MerchantNavGroup[] = [
  {
    key: 'daily',
    items: [
      {
        key: 'orders',
        href: '/merchant/orders',
        label: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
        badge: 'pending',
        badgeTone: 'danger',
      },
      {
        key: 'catalogue',
        href: '/merchant/catalogue',
        label: { uz: 'Katalog', ru: 'Каталог', en: 'Catalogue' },
      },
    ],
  },
  {
    key: 'money',
    items: [
      {
        key: 'settlement',
        href: '/merchant/settlement',
        label: { uz: "To'lovlar", ru: 'Выплаты', en: 'Payouts' },
      },
      {
        key: 'disputes',
        href: '/merchant/disputes',
        label: { uz: 'Nizolar', ru: 'Споры', en: 'Disputes' },
        badge: 'disputes',
        badgeTone: 'warning',
      },
    ],
  },
  {
    key: 'grow',
    items: [
      {
        key: 'performance',
        href: '/merchant/performance',
        label: { uz: 'Natijalar', ru: 'Показатели', en: 'Performance' },
      },
      {
        key: 'promotions',
        href: '/merchant/promotions',
        label: { uz: 'Aksiyalar', ru: 'Акции', en: 'Promotions' },
      },
    ],
  },
];

/** Title and subtitle per view — `titles` at `Do'kon paneli.dc.html:920-928`. */
export const MERCHANT_TITLES: Readonly<Record<string, { title: Trilingual; sub: Trilingual }>> = {
  orders: {
    title: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
    sub: {
      uz: 'Bugun 47 buyurtma · 3 tasi javob kutmoqda',
      ru: 'Сегодня 47 заказов · 3 ждут ответа',
      en: '47 orders today · 3 awaiting your answer',
    },
  },
  catalogue: {
    title: { uz: 'Katalog', ru: 'Каталог', en: 'Catalogue' },
    sub: {
      uz: "Marketplace narxi va ko'rinishi · menyu POS'dan keladi",
      ru: 'Цена и видимость на маркетплейсе · меню из POS',
      en: 'Marketplace price and visibility · the menu comes from the POS',
    },
  },
  settlement: {
    title: { uz: "To'lovlar", ru: 'Выплаты', en: 'Payouts' },
    sub: {
      uz: 'Har payshanba · komissiya 9%',
      ru: 'Каждый четверг · комиссия 9%',
      en: 'Every Thursday · 9% commission',
    },
  },
  disputes: {
    title: { uz: 'Nizolar', ru: 'Споры', en: 'Disputes' },
    sub: {
      uz: 'Javob berish muddati 24 soat',
      ru: 'Срок ответа 24 часа',
      en: 'You have 24 hours to respond',
    },
  },
  performance: {
    title: { uz: 'Natijalar', ru: 'Показатели', en: 'Performance' },
    /* The window, and only the window. It named the demo's venue — "Oxirgi 30
       kun · Chilonzor" — on every merchant's results page, and this panel
       reports the shop as a whole rather than one address of it. */
    sub: {
      uz: 'Oxirgi 30 kun',
      ru: 'Последние 30 дней',
      en: 'Last 30 days',
    },
  },
  promotions: {
    title: { uz: 'Aksiyalar', ru: 'Акции', en: 'Promotions' },
    sub: {
      uz: 'Aksiya va reklama joyi',
      ru: 'Акции и рекламные места',
      en: 'Offers and paid placement',
    },
  },
  settings: {
    title: { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
    sub: {
      uz: "Do'kon profili, ish vaqti, yetkazish",
      ru: 'Профиль, часы работы, доставка',
      en: 'Store profile, hours, delivery',
    },
  },
};

/** The trading toggle in the header — `:127-129`, `:1195-1204`. */
export const TRADING = {
  open: {
    label: {
      uz: 'Ochiq · buyurtma qabul qilinmoqda',
      ru: 'Открыто · принимаем заказы',
      en: 'Open · accepting orders',
    } as Trilingual,
    flash: {
      uz: "Do'kon ochildi · marketplace'da ko'rinadi",
      ru: 'Магазин открыт · виден на маркетплейсе',
      en: 'Store open · visible on the marketplace',
    } as Trilingual,
  },
  closed: {
    label: {
      uz: 'Yopiq · buyurtma kelmaydi',
      ru: 'Закрыто · заказы не поступают',
      en: 'Closed · no orders arrive',
    } as Trilingual,
    flash: {
      uz: "Do'kon yopildi · mijozlar buyurtma bera olmaydi",
      ru: 'Магазин закрыт · гости не могут заказать',
      en: 'Store closed · guests cannot order',
    } as Trilingual,
  },
} as const;

/* ============================================================== the queue */

/**
 * The five states an order moves through, and the ladder is the design's —
 * `OST` at `:948`.
 *
 * `new → cooking → ready → done`, with `rejected` as the branch off the first
 * step. The build had three outcomes (accepted, declined, expired) and no
 * ladder at all, which meant a merchant who accepted an order had nothing left
 * to press: the card that should say "Ready" and then "Handed to the courier"
 * simply went grey. A queue that stops after "accept" is a queue where the
 * kitchen and the courier never meet.
 */
export type OrderState = 'new' | 'cooking' | 'ready' | 'done' | 'rejected';

export const ORDER_STATE_LABEL: Readonly<Record<OrderState, Trilingual>> = {
  new: { uz: 'Javob kutmoqda', ru: 'Ждёт ответа', en: 'Awaiting answer' },
  cooking: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Cooking' },
  ready: { uz: 'Kuryer kutmoqda', ru: 'Ждёт курьера', en: 'Awaiting courier' },
  done: { uz: 'Yetkazildi', ru: 'Доставлен', en: 'Delivered' },
  rejected: { uz: 'Rad etilgan', ru: 'Отклонён', en: 'Rejected' },
};

export const ORDER_STATE_TONE: Readonly<
  Record<OrderState, 'danger' | 'warning' | 'brand' | 'success' | 'neutral'>
> = {
  new: 'danger',
  cooking: 'warning',
  ready: 'brand',
  done: 'success',
  rejected: 'neutral',
};

export type MerchantPayRail = 'click' | 'payme' | 'cash';

/**
 * What the payment method means for the merchant's money — `PAYN` at `:955`.
 *
 * Cash is the different one and it is the reason this line exists: the courier
 * collects it, so the commission cannot be taken from the transaction and is
 * withheld from the payout instead. A merchant who does not know that reads the
 * Thursday statement as a mistake.
 */
export const PAY_NOTE: Readonly<Record<MerchantPayRail, Trilingual>> = {
  click: {
    uz: "Click bilan to'langan · pul to'lov davrida keladi",
    ru: 'Оплачено Click · деньги придут в выплату',
    en: 'Paid by Click · money arrives with the payout',
  },
  payme: {
    uz: "Payme bilan to'langan · pul to'lov davrida keladi",
    ru: 'Оплачено Payme · деньги придут в выплату',
    en: 'Paid by Payme · money arrives with the payout',
  },
  cash: {
    uz: "Naqd · kuryer yig'adi, komissiya to'lovdan ushlanadi",
    ru: 'Наличные · собирает курьер, комиссия удержится из выплаты',
    en: 'Cash · the courier collects; commission is withheld from the payout',
  },
};

export type MerchantOrderLine = { quantity: number; name: Trilingual; amount: number };

export type MerchantQueueOrder = {
  id: string;
  number: string;
  state: OrderState;
  customer: string;
  address: Trilingual;
  lines: readonly MerchantOrderLine[];
  /** Tiyin, before commission. */
  gross: number;
  /**
   * What the platform keeps from this order, and at what rate — as the API
   * computed them, per order.
   *
   * Not `gross × 9%` in the browser: the rate is a term of the store's own
   * contract, it changes when that contract does, and a promotion can move
   * it for a single order. Multiplying a design constant here printed a
   * merchant a fee nobody had agreed to on the screen they check they were
   * paid on. Null only on the fixture rows.
   */
  fee: number | null;
  feePercent: number | null;
  note?: Trilingual;
  pay: MerchantPayRail;
  /** Seconds left on the ninety-second clock. Only a `new` order has one. */
  secondsLeft?: number;
  /**
   * Minutes the restaurant has promised, from acceptance.
   *
   * Absent until somebody accepts. The delay button adds to it and sends the
   * total, so a merchant who reloads mid-service sees the same figure the guest
   * is watching rather than a local counter that started again at zero.
   */
  etaMinutes?: number;
};

export const MERCHANT_ORDERS: readonly MerchantQueueOrder[] = [
  {
    id: 'o1',
    number: '#MP-4471',
    state: 'new',
    customer: 'Nilufar Yusupova',
    address: {
      uz: 'Chilonzor 24, 3-podyezd, 47-xonadon · 2.4 km',
      ru: 'Чиланзар 24, подъезд 3, кв 47 · 2.4 км',
      en: 'Chilonzor 24, entrance 3, flat 47 · 2.4 km',
    },
    lines: [
      {
        quantity: 2,
        name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
        amount: som(96_000),
      },
      {
        quantity: 1,
        name: { uz: "Achchiq lag'mon", ru: 'Острый лагман', en: 'Spicy lagman' },
        amount: som(42_000),
      },
      {
        quantity: 3,
        name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' },
        amount: som(24_000),
      },
    ],
    gross: som(162_000),
    fee: null,
    feePercent: null,
    note: {
      uz: 'Mijoz izohi: achchiq qilmang, bola bor',
      ru: 'Комментарий: не остро, с ребёнком',
      en: 'Guest note: not spicy, there is a child',
    },
    pay: 'click',
    secondsLeft: 74,
  },
  {
    id: 'o2',
    number: '#MP-4470',
    state: 'cooking',
    customer: 'Sardor Aliyev',
    address: {
      uz: 'Yunusobod 12, 8-xonadon · 3.1 km',
      ru: 'Юнусабад 12, кв 8 · 3.1 км',
      en: 'Yunusobod 12, flat 8 · 3.1 km',
    },
    lines: [
      {
        quantity: 1,
        name: { uz: 'Pepperoni, 30 sm', ru: 'Пепперони 30 см', en: 'Pepperoni 30 cm' },
        amount: som(64_000),
      },
      {
        quantity: 2,
        name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
        amount: som(24_000),
      },
    ],
    gross: som(88_000),
    fee: null,
    feePercent: null,
    pay: 'cash',
  },
  {
    id: 'o3',
    number: '#MP-4469',
    state: 'new',
    customer: 'Kamola Rasulova',
    address: {
      uz: 'Sergeli 4, 2-podyezd · 1.8 km',
      ru: 'Сергели 4, подъезд 2 · 1.8 км',
      en: 'Sergeli 4, entrance 2 · 1.8 km',
    },
    lines: [
      {
        quantity: 1,
        name: { uz: 'Tovuqli lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
        amount: som(32_000),
      },
      {
        quantity: 1,
        name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' },
        amount: som(10_000),
      },
    ],
    gross: som(42_000),
    fee: null,
    feePercent: null,
    pay: 'payme',
    secondsLeft: 38,
  },
  {
    id: 'o4',
    number: '#MP-4468',
    state: 'ready',
    customer: 'Jahongir Toshev',
    address: {
      uz: 'Chilonzor 8, 15-xonadon · 1.2 km',
      ru: 'Чиланзар 8, кв 15 · 1.2 км',
      en: 'Chilonzor 8, flat 15 · 1.2 km',
    },
    lines: [
      {
        quantity: 3,
        name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pcs' },
        amount: som(114_000),
      },
    ],
    gross: som(114_000),
    fee: null,
    feePercent: null,
    pay: 'click',
  },
  {
    id: 'o5',
    number: '#MP-4467',
    state: 'new',
    customer: 'Dilnoza Karimova',
    address: {
      uz: "Mirzo Ulug'bek 31 · 4.6 km",
      ru: 'Мирзо Улугбек 31 · 4.6 км',
      en: "Mirzo Ulug'bek 31 · 4.6 km",
    },
    lines: [
      {
        quantity: 1,
        name: { uz: 'Margherita, 30 sm', ru: 'Маргарита 30 см', en: 'Margherita 30 cm' },
        amount: som(56_000),
      },
      {
        quantity: 1,
        name: { uz: 'Sezar salat', ru: 'Салат Цезарь', en: 'Caesar salad' },
        amount: som(34_000),
      },
    ],
    gross: som(90_000),
    fee: null,
    feePercent: null,
    pay: 'cash',
    secondsLeft: 12,
  },
  {
    id: 'o6',
    number: '#MP-4462',
    state: 'done',
    customer: 'Aziz Normatov',
    address: {
      uz: 'Chilonzor 19 · 2.0 km',
      ru: 'Чиланзар 19 · 2.0 км',
      en: 'Chilonzor 19 · 2.0 km',
    },
    lines: [
      {
        quantity: 2,
        name: { uz: 'Double beef', ru: 'Double beef', en: 'Double beef' },
        amount: som(116_000),
      },
    ],
    gross: som(116_000),
    fee: null,
    feePercent: null,
    pay: 'click',
  },
];

/** How long ago the order arrived. Delivered ones are older by definition. */
export const ORDER_AGO: Readonly<Record<'fresh' | 'old', Trilingual>> = {
  fresh: { uz: '2 daqiqa oldin', ru: '2 минуты назад', en: '2 min ago' },
  old: { uz: '42 daqiqa oldin', ru: '42 минуты назад', en: '42 min ago' },
};

export type OrderFilterKey = 'all' | 'new' | 'active' | 'done';

export const ORDER_FILTERS: readonly { key: OrderFilterKey; label: Trilingual }[] = [
  { key: 'all', label: { uz: 'Barchasi', ru: 'Все', en: 'All' } },
  { key: 'new', label: { uz: 'Javob kutmoqda', ru: 'Ждут ответа', en: 'Awaiting' } },
  { key: 'active', label: { uz: 'Ishda', ru: 'В работе', en: 'In progress' } },
  { key: 'done', label: { uz: 'Yetkazilgan', ru: 'Доставленные', en: 'Delivered' } },
];

/** The four figures above the queue — `ordKpis` at `:1002-1007`. */
export type MerchantKpi = {
  key: string;
  label: Trilingual;
  value: Trilingual;
  note: Trilingual;
  tone: 'success' | 'neutral' | 'danger';
};

export const ORDER_KPIS: readonly MerchantKpi[] = [
  {
    key: 'today',
    label: { uz: 'Bugungi buyurtma', ru: 'Заказов сегодня', en: 'Orders today' },
    value: { uz: '47', ru: '47', en: '47' },
    note: { uz: '+12 kechaga nisbatan', ru: '+12 к вчера', en: '+12 vs yesterday' },
    tone: 'success',
  },
  {
    key: 'gross',
    label: { uz: 'Bugungi aylanma', ru: 'Оборот сегодня', en: 'Gross today' },
    value: { uz: '4.18 mln', ru: '4.18 млн', en: '4.18 M' },
    note: {
      uz: "so'm · komissiyadan oldin",
      ru: 'сум · до комиссии',
      en: 'so’m · before commission',
    },
    tone: 'neutral',
  },
  {
    key: 'answer',
    label: { uz: "O'rtacha javob", ru: 'Среднее время ответа', en: 'Average answer' },
    value: { uz: '38 son', ru: '38 сек', en: '38 s' },
    note: { uz: "me'yor 90 son", ru: 'норма 90 сек', en: 'target 90 s' },
    tone: 'success',
  },
  {
    key: 'cancelled',
    label: { uz: 'Bekor qilingan', ru: 'Отменено', en: 'Cancelled' },
    value: { uz: '2', ru: '2', en: '2' },
    note: { uz: "me'yor 3% dan kam", ru: 'норма ниже 3%', en: 'target under 3%' },
    tone: 'neutral',
  },
];

/** The four buttons the design offers per state — `acts` at `:966-981`. */
export const ORDER_ACTION: Readonly<Record<string, Trilingual>> = {
  accept: { uz: 'Qabul qilish · 25 daq', ru: 'Принять · 25 мин', en: 'Accept · 25 min' },
  reject: { uz: 'Rad etish', ru: 'Отклонить', en: 'Reject' },
  ready: { uz: 'Tayyor', ru: 'Готово', en: 'Ready' },
  delay: { uz: 'Vaqt kerak', ru: 'Нужно время', en: 'Need more time' },
  handed: { uz: 'Kuryerga berildi', ru: 'Передано курьеру', en: 'Handed to courier' },
  receipt: { uz: "Chekni ko'rish", ru: 'Посмотреть чек', en: 'View receipt' },
};

export const ORDER_FLASH: Readonly<Record<string, Trilingual>> = {
  accepted: {
    uz: 'Qabul qilindi · oshxonaga yuborildi',
    ru: 'Принято · отправлено на кухню',
    en: 'Accepted · sent to the kitchen',
  },
  ready: { uz: 'Kuryer chaqirildi', ru: 'Курьер вызван', en: 'Courier called' },
  handed: {
    uz: 'Kuryerga berildi',
    ru: 'Передано курьеру',
    en: 'Handed to the courier',
  },
  rejected: {
    uz: 'Rad etildi · mijozga xabar ketdi, pul qaytariladi',
    ru: 'Отклонено · гость уведомлён, деньги вернутся',
    en: 'Rejected · the guest was told and will be refunded',
  },
  rejectPick: {
    uz: 'Avval sababni tanlang',
    ru: 'Сначала выберите причину',
    en: 'Pick a reason first',
  },
  seconds: { uz: 'soniya qoldi', ru: 'секунд осталось', en: 'seconds left' },
  countOrders: { uz: '{n} buyurtma', ru: 'заказов: {n}', en: '{n} orders' },
  /*
   * The API refused the move, or never heard it. Sharper than the shared line
   * below because this card goes BACK to waiting: the guest's clock is still
   * running, so the words have to say the order did not move and the merchant
   * has to press again. "Saqlanmadi" would read as a tidying-up problem.
   */
  notSent: {
    uz: "Yuborilmadi · buyurtma o'z holicha qoldi, qayta urining",
    ru: 'Не отправлено · заказ остался как был, повторите',
    en: 'Not sent · the order is unchanged, try again',
  },
};

/**
 * "+10 daqiqa" and what the guest is told — `:975-976`.
 *
 * It accumulates rather than replaces: a kitchen that has asked twice has asked
 * for twenty minutes, and a card that keeps saying "+10" hides the second ask
 * from the person who has to answer for the delay.
 */
export const ORDER_DELAY = {
  step: 10,
  flash: {
    uz: 'Mijozga +10 daqiqa xabar yuborildi · jami +{n}',
    ru: 'Гостю отправлено +10 минут · всего +{n}',
    en: 'The guest has been told +10 minutes · total +{n}',
  } as Trilingual,
  badge: {
    uz: '+{n} daqiqa · mijozga aytilgan',
    ru: '+{n} минут · гость предупреждён',
    en: '+{n} min · the guest was told',
  } as Trilingual,
};

/** Four reasons to refuse an order — `rejReasons` at `:1226-1231`. */
export type RejectReason = { key: string; label: Trilingual; note: Trilingual };

export const REJECT_REASONS: readonly RejectReason[] = [
  {
    key: 'stock',
    label: { uz: 'Mahsulot tugagan', ru: 'Продукт закончился', en: 'Out of stock' },
    note: {
      uz: "Taom stop-listga tushadi va marketplace'da yashiriladi",
      ru: 'Позиция уйдёт в стоп-лист и скроется на маркетплейсе',
      en: 'The item goes to the stop-list and hides on the marketplace',
    },
  },
  {
    key: 'busy',
    label: { uz: "Oshxona to'lib ketgan", ru: 'Кухня перегружена', en: 'Kitchen overloaded' },
    note: {
      uz: 'Tayyorlash vaqti 25 daqiqadan oshadi',
      ru: 'Время готовки превысит 25 минут',
      en: 'Prep time would exceed 25 minutes',
    },
  },
  {
    key: 'closing',
    label: { uz: 'Yopilish vaqti', ru: 'Время закрытия', en: 'Closing time' },
    note: {
      uz: "Do'kon avtomatik yopiladi · keyingi buyurtma kelmaydi",
      ru: 'Магазин закроется автоматически · новых заказов не будет',
      en: 'The store closes automatically · no new orders arrive',
    },
  },
  {
    key: 'addr',
    label: {
      uz: 'Manzil yetkazish zonasidan tashqarida',
      ru: 'Адрес вне зоны доставки',
      en: 'Address outside the delivery zone',
    },
    note: {
      uz: "Operator mijozga qo'ng'iroq qiladi",
      ru: 'Оператор позвонит гостю',
      en: 'The operator will call the guest',
    },
  },
];

export const REJECT_TITLE: Trilingual = {
  uz: 'Buyurtmani rad etish',
  ru: 'Отклонить заказ',
  en: 'Reject the order',
};

export const RECEIPT_TITLE: Trilingual = { uz: 'Chek', ru: 'Чек', en: 'Receipt' };

export const RECEIPT_STAMP: Trilingual = {
  uz: 'MyPOS · bugun 12:04',
  ru: 'MyPOS · сегодня 12:04',
  en: 'MyPOS · today 12:04',
};

/* =========================================================== the catalogue */

export type CatalogueCategory = { key: number; label: Trilingual };

/** Five chips, "Barchasi" first — `CAT` at `:1005`. */
export const CATALOGUE_CATEGORIES: readonly CatalogueCategory[] = [
  { key: 0, label: { uz: 'Barchasi', ru: 'Все', en: 'All' } },
  { key: 1, label: { uz: 'Milliy', ru: 'Национальная', en: 'Uzbek' } },
  { key: 2, label: { uz: 'Burger', ru: 'Бургеры', en: 'Burgers' } },
  { key: 3, label: { uz: 'Pitsa', ru: 'Пицца', en: 'Pizza' } },
  { key: 4, label: { uz: 'Ichimlik', ru: 'Напитки', en: 'Drinks' } },
];

export type CatalogueDish = {
  id: string;
  category: number;
  name: Trilingual;
  /** What it costs in the dining room, in tiyin. */
  housePrice: number;
  /** What it costs on the marketplace, in tiyin. */
  marketPrice: number;
  /** Food cost, in tiyin — the third number the margin needs. */
  foodCost: number;
  /** How many sold in thirty days. */
  sold: number;
  /** True when the POS stop-list has already hidden it. */
  stopped?: boolean;
};

/**
 * Nine dishes and six columns — `DISH` at `:1006-1016`.
 *
 * The build carried five dishes and five columns, and the two missing columns
 * were the ones a merchant reads this screen for: **margin** and **thirty-day
 * sales**. Price on its own cannot answer "should this be on the marketplace at
 * all"; margin against volume can, and a dish selling 502 units at 47% is a
 * different decision from one selling 141 at 22%.
 */
export const MERCHANT_DISHES: readonly CatalogueDish[] = [
  {
    id: 'd1',
    category: 1,
    name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
    housePrice: som(42_000),
    marketPrice: som(48_000),
    foodCost: som(15_400),
    sold: 412,
  },
  {
    id: 'd2',
    category: 1,
    name: { uz: "Achchiq lag'mon", ru: 'Острый лагман', en: 'Spicy lagman' },
    housePrice: som(38_000),
    marketPrice: som(42_000),
    foodCost: som(14_100),
    sold: 268,
  },
  {
    id: 'd3',
    category: 1,
    name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pcs' },
    housePrice: som(34_000),
    marketPrice: som(38_000),
    foodCost: som(12_800),
    sold: 194,
  },
  {
    id: 'd4',
    category: 2,
    name: { uz: 'Chizburger', ru: 'Чизбургер', en: 'Cheeseburger' },
    housePrice: som(36_000),
    marketPrice: som(39_000),
    foodCost: som(15_900),
    sold: 0,
    stopped: true,
  },
  {
    id: 'd5',
    category: 2,
    name: { uz: 'Double beef', ru: 'Double beef', en: 'Double beef' },
    housePrice: som(54_000),
    marketPrice: som(58_000),
    foodCost: som(26_800),
    sold: 141,
  },
  {
    id: 'd6',
    category: 3,
    name: { uz: 'Margherita, 30 sm', ru: 'Маргарита 30 см', en: 'Margherita 30 cm' },
    housePrice: som(52_000),
    marketPrice: som(56_000),
    foodCost: som(18_200),
    sold: 226,
  },
  {
    id: 'd7',
    category: 3,
    name: { uz: 'Pepperoni, 30 sm', ru: 'Пепперони 30 см', en: 'Pepperoni 30 cm' },
    housePrice: som(60_000),
    marketPrice: som(64_000),
    foodCost: som(24_600),
    sold: 188,
  },
  {
    id: 'd8',
    category: 4,
    name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
    housePrice: som(11_000),
    marketPrice: som(12_000),
    foodCost: som(6_400),
    sold: 502,
  },
  {
    id: 'd9',
    category: 4,
    name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' },
    housePrice: som(7_000),
    marketPrice: som(8_000),
    foodCost: som(900),
    sold: 388,
  },
];

/** The catalogue's four moving strings — `catSyncAge` / `catSyncLabel` at `:1287-1298`. */
export const CATALOGUE_SYNC = {
  stale: {
    uz: "Oxirgi sinxron: 4 daqiqa oldin · 2 pozitsiya POS'dan orqada",
    ru: 'Последняя синхронизация: 4 минуты назад · 2 позиции отстают от POS',
    en: 'Last sync: 4 minutes ago · 2 items behind the POS',
  } as Trilingual,
  fresh: {
    uz: 'Oxirgi sinxron: hozir · hammasi POS bilan bir xil',
    ru: 'Последняя синхронизация: сейчас · всё совпадает с POS',
    en: 'Last sync: just now · everything matches the POS',
  } as Trilingual,
  button: {
    uz: 'POS bilan sinxronlash',
    ru: 'Синхронизировать с POS',
    en: 'Sync with the POS',
  } as Trilingual,
  buttonDone: {
    uz: 'Sinxronlangan',
    ru: 'Синхронизировано',
    en: 'In sync',
  } as Trilingual,
  flash: {
    uz: 'Sinxronlandi · 2 pozitsiya yangilandi',
    ru: 'Синхронизировано · обновлено 2 позиции',
    en: 'Synced · 2 items updated',
  } as Trilingual,
  already: {
    uz: 'Allaqachon sinxronlangan',
    ru: 'Уже синхронизировано',
    en: 'Already in sync',
  } as Trilingual,
};

/** The three things a catalogue row's second line can say — `meta` at `:1035-1040`. */
/**
 * What each of the merchant panel's tables says when it has nothing in it.
 *
 * These are new states, and they are new because the reads used to hide them:
 * an empty catalogue drew the design's dishes, an empty settlement history drew
 * six specimen statements, an empty promotion list drew three campaigns with a
 * budget. A merchant who joined last week now sees the truth, so the truth has
 * to be worded — an unexplained blank table reads as a broken screen.
 */
export const MERCHANT_EMPTY = {
  catalogue: {
    uz: "Marketplace'da hali taom yo'q — POS menyusidan tanlab qo'shing.",
    ru: 'На маркетплейсе пока нет блюд — добавьте их из меню POS.',
    en: 'Nothing listed on the marketplace yet — add dishes from the POS menu.',
  } as Trilingual,
  settlements: {
    uz: "Hali hisob-kitob qilinmagan. Birinchi hisobot to'lov davri yopilgach chiqadi.",
    ru: 'Выплат ещё не было. Первый отчёт появится после закрытия расчётного периода.',
    en: 'No statements yet. The first one is issued when the payout period closes.',
  } as Trilingual,
  promotions: {
    uz: "Hozircha aksiya yo'q. Yangi aksiya uchta holatdan o'tadi: rejalashtirilgan, faol, tugagan.",
    ru: 'Акций пока нет. Новая акция проходит три состояния: запланирована, активна, завершена.',
    en: 'No campaigns yet. A new one moves through three states: scheduled, running, finished.',
  } as Trilingual,
} as const;

export const CATALOGUE_META = {
  uplift: {
    uz: '+{amount} marketplace ustamasi',
    ru: '+{amount} надбавка маркетплейса',
    en: '+{amount} marketplace uplift',
  } as Trilingual,
  stopped: {
    uz: "POS'da tugagan · avtomatik yashirildi",
    ru: 'Стоп-лист в POS · скрыто автоматически',
    en: 'On the POS stop-list · hidden automatically',
  } as Trilingual,
  hidden: {
    uz: "Siz yashirdingiz · POS'da mavjud",
    ru: 'Скрыто вами · в POS есть',
    en: 'You hid this · available in the POS',
  } as Trilingual,
  shown: { uz: "Ko'rsatish", ru: 'Показать', en: 'Show' } as Trilingual,
  hide: { uz: 'Yashirish', ru: 'Скрыть', en: 'Hide' } as Trilingual,
  flashHidden: {
    uz: "{name} — marketplace'da yashirildi",
    ru: '{name} — скрыто на маркетплейсе',
    en: '{name} — hidden on the marketplace',
  } as Trilingual,
  flashShown: {
    uz: "{name} — marketplace'da ko'rinadi",
    ru: '{name} — видно на маркетплейсе',
    en: '{name} — visible on the marketplace',
  } as Trilingual,
  count: { uz: '{n} pozitsiya', ru: 'позиций: {n}', en: '{n} items' } as Trilingual,
};

/** Two cards under the table — `catNotes` at `:1300-1304`. */
export const CATALOGUE_NOTES: readonly { head: Trilingual; body: Trilingual }[] = [
  {
    head: {
      uz: 'Nima uchun marketplace narxi boshqa',
      ru: 'Почему цена на маркетплейсе другая',
      en: 'Why the marketplace price differs',
    },
    body: {
      uz: 'Marketplace narxiga komissiya 9% va qadoqlash kiradi. Zal narxini qo‘yib qo‘ysangiz, marjangiz 9% ga tushadi — shuning uchun ustama qo‘shiladi.',
      ru: 'В цену маркетплейса входит комиссия 9% и упаковка. Если поставить цену зала, маржа упадёт на 9% — поэтому есть надбавка.',
      en: 'The marketplace price absorbs the 9% commission and packaging. Using the in-house price cuts your margin by 9% — hence the uplift.',
    },
  },
  {
    head: {
      uz: "Tugagan taom o'zi yashiriladi",
      ru: 'Стоп-лист скрывает автоматически',
      en: 'The stop-list hides items for you',
    },
    body: {
      uz: "Oshpaz POS'da taomni tugadi deb belgilasa, u marketplace'da shu zahoti yo‘qoladi. Mijoz buyurtma bera olmaydi va sizga qo‘ng‘iroq qilish kerak bo‘lmaydi.",
      ru: 'Когда повар отмечает стоп-лист в POS, позиция исчезает с маркетплейса сразу. Гость не сможет заказать, и звонить не придётся.',
      en: 'When the kitchen 86s an item in the POS it disappears from the marketplace at once. The guest cannot order it and nobody has to phone.',
    },
  },
];

/* =========================================================== the settlement */

/**
 * Six weeks of payouts — `setRows` at `:1051-1064`.
 *
 * The period labels are not translated and that is the design's own decision:
 * `"10–16 avg"` is written once and printed in every language, because a payout
 * period is an identifier a merchant matches against a bank statement rather
 * than a sentence they read.
 */
export type SettlementRow = {
  /**
   * The row's numeric key upstream, absent on the six the design drew.
   *
   * Separate from `invoice` for the reason the platform console keeps
   * `TenantInvoice.key` separate from `TenantInvoice.id`: the printed number is
   * what both sides quote on the phone, and on a panel with no session it is a
   * string this file invented. Only this field may aim a link at a statement.
   */
  id?: number;
  period: string;
  invoice: string;
  /** Tiyin. */
  gross: number;
  fee: number;
  state: 'due' | 'paid';
};

export const SETTLEMENT_HISTORY: readonly SettlementRow[] = [
  {
    period: '10–16 avg',
    invoice: 'MP-INV-2026-0833',
    gross: som(24_180_000),
    fee: som(2_176_200),
    state: 'due',
  },
  {
    period: '3–9 avg',
    invoice: 'MP-INV-2026-0791',
    gross: som(21_940_000),
    fee: som(1_974_600),
    state: 'paid',
  },
  {
    period: '27 iyul–2 avg',
    invoice: 'MP-INV-2026-0744',
    gross: som(19_620_000),
    fee: som(1_765_800),
    state: 'paid',
  },
  {
    period: '20–26 iyul',
    invoice: 'MP-INV-2026-0698',
    gross: som(22_410_000),
    fee: som(2_016_900),
    state: 'paid',
  },
  {
    period: '13–19 iyul',
    invoice: 'MP-INV-2026-0651',
    gross: som(18_870_000),
    fee: som(1_698_300),
    state: 'paid',
  },
  {
    period: '6–12 iyul',
    invoice: 'MP-INV-2026-0604',
    gross: som(20_130_000),
    fee: som(1_811_700),
    state: 'paid',
  },
];

export const SETTLEMENT_STATE: Readonly<Record<'due' | 'paid', Trilingual>> = {
  due: { uz: "To'lanadi", ru: 'К выплате', en: 'Due' },
  paid: { uz: "To'langan", ru: 'Выплачено', en: 'Paid' },
};

/** The five-line breakdown of the next payout — `setBreak` at `:1310-1316`. */
export const SETTLEMENT_BREAKDOWN: readonly {
  key: string;
  label: Trilingual;
  amount: number;
  negative: boolean;
  strong: boolean;
}[] = [
  {
    key: 'gross',
    label: { uz: 'Aylanma', ru: 'Оборот', en: 'Gross' },
    amount: som(24_180_000),
    negative: false,
    strong: false,
  },
  {
    key: 'commission',
    label: { uz: 'Komissiya 9%', ru: 'Комиссия 9%', en: 'Commission 9%' },
    amount: som(2_176_200),
    negative: true,
    strong: false,
  },
  {
    key: 'disputes',
    label: {
      uz: "Nizo bo'yicha ushlangan",
      ru: 'Удержано по спорам',
      en: 'Withheld for disputes',
    },
    amount: som(24_000),
    negative: true,
    strong: false,
  },
  {
    key: 'ads',
    label: { uz: 'Reklama', ru: 'Реклама', en: 'Advertising' },
    amount: som(480_000),
    negative: true,
    strong: false,
  },
  {
    key: 'net',
    label: { uz: "Qo'lga", ru: 'К выплате', en: 'You receive' },
    amount: som(24_180_000 - 2_176_200 - 24_000 - 480_000),
    negative: false,
    strong: true,
  },
];

export const SETTLEMENT_WHEN: Trilingual = {
  uz: 'Payshanba, 20-avgust · UZS',
  ru: 'Четверг, 20 августа · UZS',
  en: 'Thursday, 20 August · UZS',
};

export const SETTLEMENT_COLUMNS: readonly { key: string; label: Trilingual }[] = [
  { key: 'period', label: { uz: 'Davr', ru: 'Период', en: 'Period' } },
  { key: 'invoice', label: { uz: 'Hisob-faktura', ru: 'Счёт', en: 'Invoice' } },
  { key: 'gross', label: { uz: 'Aylanma', ru: 'Оборот', en: 'Gross' } },
  { key: 'fee', label: { uz: 'Komissiya', ru: 'Комиссия', en: 'Fee' } },
  { key: 'net', label: { uz: "Qo'lga", ru: 'К выплате', en: 'Net' } },
  { key: 'state', label: { uz: 'Holat', ru: 'Статус', en: 'State' } },
];

export const SETTLEMENT_ACTION_FLASH: Readonly<Record<string, Trilingual>> = {
  invoice: {
    uz: 'PDF yuklab olindi · MP-2026-08-1142.pdf',
    ru: 'PDF скачан · MP-2026-08-1142.pdf',
    en: 'PDF downloaded · MP-2026-08-1142.pdf',
  },
  statement: {
    uz: 'Akt yuklab olindi · 20-avgust hisob-kitobi',
    ru: 'Акт скачан · расчёт 20 августа',
    en: 'Statement downloaded · 20 August settlement',
  },
  bank: {
    uz: "Yuborildi · platforma 1–2 ish kunida tasdiqlaydi, shu vaqtda to'lov to'xtaydi",
    ru: 'Отправлено · платформа подтвердит за 1–2 рабочих дня, выплаты приостановятся',
    en: 'Submitted · the platform verifies in 1–2 working days and payouts pause until then',
  },
};

/* ============================================================== disputes */

export type Dispute = {
  id: string;
  kind: Trilingual;
  number: string;
  /** Tiyin. */
  amount: number;
  /** Hours left to answer. Zero when it is closed. */
  hoursLeft: number;
  title: Trilingual;
  body: Trilingual;
  who: string;
  initials: string;
  quote: Trilingual;
  photos?: Trilingual;
  split: Trilingual;
  /** Set on the one the design draws already settled. */
  resolved?: 'accepted' | 'contested';
};

/**
 * Three disputes, and the third one is already closed — `DSP` at `:1098-1115`.
 *
 * A dispute screen that only ever draws open cases never shows the merchant
 * what "settled" looks like, which is the state they will spend most of their
 * time reading. The closed one also carries the sentence that matters: the
 * amount is withheld from the next payout, which is where the settlement panel
 * gets its −24 000 line.
 */
export const DISPUTES: readonly Dispute[] = [
  {
    id: 'x1',
    kind: { uz: 'Taom kelmadi', ru: 'Блюдо не привезли', en: 'Item missing' },
    number: '#MP-4455',
    amount: som(42_000),
    hoursLeft: 19,
    title: {
      uz: 'Bir pozitsiya yetkazilmagan',
      ru: 'Одна позиция не доставлена',
      en: 'One line was not delivered',
    },
    body: {
      uz: "Mijoz 1 × Achchiq lag'mon buyurtma qilgan, lekin paketda bo'lmagan. Kuryer paketni yopiq holda olgan.",
      ru: 'Гость заказал 1 × Острый лагман, в пакете его не было. Курьер получил пакет закрытым.',
      en: 'The guest ordered 1 × Spicy lagman; it was not in the bag. The courier received the bag sealed.',
    },
    who: 'Nilufar Y.',
    initials: 'NY',
    quote: {
      uz: "“Lag'mon yo'q edi, faqat osh va choy keldi.”",
      ru: '«Лагмана не было, пришёл только плов и чай.»',
      en: '“The lagman was missing, only plov and tea arrived.”',
    },
    photos: { uz: '2 fotosurat ilova qilingan', ru: 'Приложено 2 фото', en: '2 photos attached' },
    split: {
      uz: 'Qabul qilsangiz: 42 000 mijozga qaytadi, komissiya qaytariladi.',
      ru: 'При признании: 42 000 вернутся гостю, комиссия возвращается.',
      en: 'If you accept: 42 000 goes back to the guest and the commission is reversed.',
    },
  },
  {
    id: 'x2',
    kind: { uz: 'Sifat', ru: 'Качество', en: 'Quality' },
    number: '#MP-4441',
    amount: som(56_000),
    hoursLeft: 7,
    title: {
      uz: 'Taom sovuq yetib borgan',
      ru: 'Блюдо приехало холодным',
      en: 'The dish arrived cold',
    },
    body: {
      uz: "Yetkazish 52 daqiqa davom etgan — va'da qilingan 35 daqiqa o'rniga. Termosumka ishlatilmagan.",
      ru: 'Доставка заняла 52 минуты вместо обещанных 35. Термосумка не использовалась.',
      en: 'Delivery took 52 minutes against the 35 promised. No thermal bag was used.',
    },
    who: 'Sardor A.',
    initials: 'SA',
    quote: {
      uz: '“Pitsa sovuq edi, isitib yedik.”',
      ru: '«Пицца была холодной, пришлось греть.»',
      en: '“The pizza was cold, we had to reheat it.”',
    },
    split: {
      uz: "Kechikish kuryer tomonida — e'tiroz bildirsangiz, zarar platforma va kuryer o'rtasida bo'linadi.",
      ru: 'Задержка на стороне курьера — при возражении убыток делится между платформой и курьером.',
      en: 'The delay was on the courier’s side — if you contest, the cost splits between the platform and the courier.',
    },
  },
  {
    id: 'x3',
    kind: { uz: 'Hal qilindi', ru: 'Решено', en: 'Resolved' },
    number: '#MP-4402',
    amount: som(24_000),
    hoursLeft: 0,
    title: {
      uz: 'Ichimlik almashtirilgan',
      ru: 'Перепутан напиток',
      en: 'Wrong drink sent',
    },
    body: {
      uz: 'Ayron o‘rniga kola yuborilgan. Qabul qilindi, summa qaytarildi.',
      ru: 'Вместо айрана отправили колу. Признано, сумма возвращена.',
      en: 'Cola was sent instead of ayran. Accepted, and the amount was refunded.',
    },
    who: 'Kamola R.',
    initials: 'KR',
    quote: {
      uz: '“Ayron so‘ragan edim.”',
      ru: '«Я просила айран.»',
      en: '“I asked for ayran.”',
    },
    split: {
      uz: '24 000 mijozga qaytarilgan, komissiya bekor qilingan.',
      ru: '24 000 возвращены гостю, комиссия отменена.',
      en: '24 000 refunded to the guest, commission reversed.',
    },
    resolved: 'accepted',
  },
];

export const DISPUTE_TEXT = {
  hoursLeft: {
    uz: '{n} soat qoldi',
    ru: 'часов осталось: {n}',
    en: '{n} hours left',
  } as Trilingual,
  closed: { uz: 'Yopilgan', ru: 'Закрыто', en: 'Closed' } as Trilingual,
  accepted: { uz: 'Qabul qilindi', ru: 'Признано', en: 'Accepted' } as Trilingual,
  contested: { uz: "E'tiroz bildirilgan", ru: 'Оспорено', en: 'Contested' } as Trilingual,
  acceptedNote: {
    uz: "Qabul qilindi · summa keyingi to'lovdan ushlanadi",
    ru: 'Признано · сумма удержится из следующей выплаты',
    en: 'Accepted · the amount is withheld from the next payout',
  } as Trilingual,
  contestedNote: {
    uz: "E'tiroz yuborildi · platforma 48 soatda hal qiladi",
    ru: 'Возражение отправлено · платформа решит за 48 часов',
    en: 'Contested · the platform decides within 48 hours',
  } as Trilingual,
  acceptFlash: {
    uz: 'Qabul qilindi · mijozga pul qaytariladi',
    ru: 'Признано · гостю вернут деньги',
    en: 'Accepted · the guest will be refunded',
  } as Trilingual,
  contestFlash: {
    uz: "E'tiroz yuborildi · dalil qo'shishingiz mumkin",
    ru: 'Возражение отправлено · можно добавить доказательства',
    en: 'Contested · you may add evidence',
  } as Trilingual,
};

/* ============================================================ promotions */

export type PromotionState = 'running' | 'scheduled' | 'ended' | 'paused' | 'cancelled';

export type Promotion = {
  id: string;
  state: PromotionState;
  window: Trilingual;
  title: Trilingual;
  body: Trilingual;
  stats: readonly { label: Trilingual; value: Trilingual }[];
};

/**
 * Three promotions in three different lifecycles — `promos` at `:1362-1395`.
 *
 * Running, scheduled and ended, and each one offers different buttons because
 * each one can be changed in a different way: a running offer can be paused, a
 * scheduled one can have its budget changed or be cancelled outright, an ended
 * one can only be run again. A single "edit" button on all three would be a
 * button that refuses two-thirds of the time.
 */
export const PROMOTIONS: readonly Promotion[] = [
  {
    id: 'p1',
    state: 'running',
    window: { uz: '11–18 avgust', ru: '11–18 августа', en: '11–18 August' },
    title: {
      uz: 'Ikkinchi osh yarim narxda',
      ru: 'Второй плов за полцены',
      en: 'Second plov half price',
    },
    body: {
      uz: 'Ikki va undan ko‘p osh buyurtma qilganda ikkinchisiga 50% chegirma. Chegirma sizning hisobingizdan.',
      ru: 'При заказе двух и более плова второй со скидкой 50%. Скидка за ваш счёт.',
      en: 'Order two or more plov and the second is 50% off. The discount is at your cost.',
    },
    stats: [
      {
        label: { uz: "Ko'rildi", ru: 'Показов', en: 'Views' },
        value: { uz: '4 210', ru: '4 210', en: '4 210' },
      },
      {
        label: { uz: 'Ishlatildi', ru: 'Использовано', en: 'Used' },
        value: { uz: '186', ru: '186', en: '186' },
      },
      {
        label: { uz: "Qo'shimcha aylanma", ru: 'Доп. оборот', en: 'Extra gross' },
        value: { uz: '3.9 mln', ru: '3.9 млн', en: '3.9 M' },
      },
    ],
  },
  {
    id: 'p2',
    state: 'scheduled',
    window: { uz: '22–24 avgust', ru: '22–24 августа', en: '22–24 August' },
    title: {
      uz: 'Bepul yetkazish, 120 000 dan',
      ru: 'Бесплатная доставка от 120 000',
      en: 'Free delivery over 120 000',
    },
    body: {
      uz: "Yetkazish narxi platforma va do'kon o'rtasida yarmi-yarmi bo'linadi.",
      ru: 'Стоимость доставки делится пополам между платформой и магазином.',
      en: 'The delivery fee splits evenly between the platform and the store.',
    },
    stats: [
      {
        label: { uz: 'Kutilgan buyurtma', ru: 'Ожидаемые заказы', en: 'Expected orders' },
        value: { uz: '—', ru: '—', en: '—' },
      },
      {
        label: { uz: 'Sizning ulushingiz', ru: 'Ваша доля', en: 'Your share' },
        value: { uz: '—', ru: '—', en: '—' },
      },
      {
        label: { uz: 'Byudjet', ru: 'Бюджет', en: 'Budget' },
        value: { uz: '—', ru: '—', en: '—' },
      },
    ],
  },
  {
    id: 'p3',
    state: 'ended',
    window: { uz: '1–7 avgust', ru: '1–7 августа', en: '1–7 August' },
    title: {
      uz: 'Yangi mijozga 15% chegirma',
      ru: 'Новому гостю 15%',
      en: '15% for new guests',
    },
    body: {
      uz: "Faqat birinchi buyurtma uchun. Platforma yarmini o'z hisobidan qo'shdi.",
      ru: 'Только для первого заказа. Половину покрыла платформа.',
      en: 'First order only. The platform covered half.',
    },
    stats: [
      {
        label: { uz: 'Yangi mijoz', ru: 'Новых гостей', en: 'New guests' },
        value: { uz: '94', ru: '94', en: '94' },
      },
      {
        label: { uz: 'Qaytgan', ru: 'Вернулись', en: 'Returned' },
        value: { uz: '41', ru: '41', en: '41' },
      },
      {
        label: { uz: 'Xarajat', ru: 'Расход', en: 'Cost' },
        value: { uz: '620 000', ru: '620 000', en: '620 000' },
      },
    ],
  },
];

/** The scheduled promotion's default budget and the design's per-order share. */
export const PROMO_BUDGET = {
  initial: som(840_000),
  sharePerOrder: som(6_000),
  minimum: som(120_000),
};

/** What advertising has cost this month — `proSpend` at `:1396`. */
export const PROMO_SPEND = som(1_940_000);

export const PROMO_RETURN: readonly { label: Trilingual; value: Trilingual; tone: string }[] = [
  {
    label: { uz: "Qo'shimcha aylanma", ru: 'Доп. оборот', en: 'Extra gross' },
    value: { uz: '11 400 000', ru: '11 400 000', en: '11 400 000' },
    tone: 'neutral',
  },
  {
    label: { uz: 'Har 1 so‘mga', ru: 'На 1 сум', en: 'Per 1 so’m' },
    value: { uz: '5.9 so‘m', ru: '5.9 сум', en: '5.9 so’m' },
    tone: 'success',
  },
  {
    label: { uz: 'Yangi mijoz', ru: 'Новых гостей', en: 'New guests' },
    value: { uz: '94', ru: '94', en: '94' },
    tone: 'neutral',
  },
];

export const PROMO_TEXT = {
  state_running: { uz: 'Ishlab turgan', ru: 'Активна', en: 'Running' } as Trilingual,
  state_scheduled: { uz: 'Rejalashtirilgan', ru: 'Запланирована', en: 'Scheduled' } as Trilingual,
  state_ended: { uz: 'Tugagan', ru: 'Завершена', en: 'Ended' } as Trilingual,
  state_paused: { uz: "To'xtatilgan", ru: 'Остановлена', en: 'Paused' } as Trilingual,
  state_cancelled: { uz: 'Bekor qilingan', ru: 'Отменена', en: 'Cancelled' } as Trilingual,

  pause: { uz: "To'xtatish", ru: 'Остановить', en: 'Pause' } as Trilingual,
  resume: { uz: 'Qayta yoqish', ru: 'Возобновить', en: 'Resume' } as Trilingual,
  report: { uz: "Natijani ko'rish", ru: 'Смотреть отчёт', en: 'See report' } as Trilingual,
  budget: {
    uz: "Byudjetni o'zgartirish",
    ru: 'Изменить бюджет',
    en: 'Change budget',
  } as Trilingual,
  cancel: { uz: 'Bekor qilish', ru: 'Отменить', en: 'Cancel' } as Trilingual,
  again: { uz: 'Qaytarish', ru: 'Повторить', en: 'Run again' } as Trilingual,

  pausedFlash: {
    uz: "Aksiya to'xtatildi · mijozlar ko'rmaydi",
    ru: 'Акция остановлена · гости её не видят',
    en: 'Promotion paused · guests no longer see it',
  } as Trilingual,
  resumedFlash: {
    uz: 'Aksiya qayta yoqildi',
    ru: 'Акция возобновлена',
    en: 'Promotion resumed',
  } as Trilingual,
  cancelledFlash: {
    uz: 'Aksiya bekor qilindi · byudjet qaytarildi',
    ru: 'Акция отменена · бюджет возвращён',
    en: 'Promotion cancelled · the budget was returned',
  } as Trilingual,
  againFlash: {
    uz: 'Nusxa qoralama sifatida qo‘shildi · sanani tanlang',
    ru: 'Копия добавлена как черновик · выберите даты',
    en: 'A draft copy was added · pick the dates',
  } as Trilingual,
  budgetSaved: {
    uz: "Byudjet o'zgartirildi · {amount}",
    ru: 'Бюджет изменён · {amount}',
    en: 'Budget changed · {amount}',
  } as Trilingual,
  budgetTooSmall: {
    uz: "Eng kam byudjet 120 000 so'm",
    ru: 'Минимальный бюджет 120 000 сум',
    en: 'The minimum budget is 120 000 so’m',
  } as Trilingual,

  budgetTitle: {
    uz: "Byudjetni o'zgartirish",
    ru: 'Изменить бюджет',
    en: 'Change the budget',
  } as Trilingual,
  budgetSub: {
    uz: 'Bepul yetkazish, 120 000 dan · 22–24 avgust',
    ru: 'Бесплатная доставка от 120 000 · 22–24 августа',
    en: 'Free delivery over 120 000 · 22–24 August',
  } as Trilingual,
  budgetLabel: { uz: "Byudjet, so'm", ru: 'Бюджет, сум', en: 'Budget, so’m' } as Trilingual,
  budgetShare: {
    uz: 'Bir buyurtmaga sizning ulushingiz',
    ru: 'Ваша доля на заказ',
    en: 'Your share per order',
  } as Trilingual,
  budgetCovers: {
    uz: 'Yetadigan buyurtma',
    ru: 'Хватит на заказов',
    en: 'Covers orders',
  } as Trilingual,
  budgetExtra: {
    uz: 'Kutilgan qo‘shimcha aylanma',
    ru: 'Ожидаемый доп. оборот',
    en: 'Expected extra gross',
  } as Trilingual,
  budgetSave: {
    uz: 'Byudjetni saqlash',
    ru: 'Сохранить бюджет',
    en: 'Save the budget',
  } as Trilingual,

  cancelTitle: {
    uz: 'Aksiyani bekor qilish',
    ru: 'Отменить акцию',
    en: 'Cancel the promotion',
  } as Trilingual,
  cancelSub: {
    uz: 'Bepul yetkazish, 120 000 dan · hali boshlanmagan',
    ru: 'Бесплатная доставка от 120 000 · ещё не началась',
    en: 'Free delivery over 120 000 · not started yet',
  } as Trilingual,
  cancelGo: { uz: 'Ha, bekor qilish', ru: 'Да, отменить', en: 'Yes, cancel it' } as Trilingual,
  cancelKeep: { uz: 'Qoldirish', ru: 'Оставить', en: 'Keep it' } as Trilingual,
  spent: { uz: 'Sarflangan', ru: 'Израсходовано', en: 'Spent so far' } as Trilingual,

  /*
   * The two cells a LIVE offer fills, beside `spent`.
   *
   * The design's own three stats are per-card inventions — views and uses on
   * one card, new guests and returns on another — and a real promotion answers
   * the same three questions whatever it is: what has this cost, can I still
   * afford it, what did I agree to.
   */
  statLeft: { uz: 'Qolgan', ru: 'Осталось', en: 'Left' } as Trilingual,
  statBudget: { uz: 'Byudjet', ru: 'Бюджет', en: 'Budget' } as Trilingual,
  returned: {
    uz: 'Qaytariladigan byudjet',
    ru: 'Вернётся из бюджета',
    en: 'Budget returned',
  } as Trilingual,
  ratingEffect: {
    uz: 'Reytingga ta’siri',
    ru: 'Влияние на рейтинг',
    en: 'Effect on rating',
  } as Trilingual,
  ratingNone: { uz: "Yo'q", ru: 'Нет', en: 'None' } as Trilingual,
};

/** Three placements a merchant can buy — `proBuy` at `:1402-1406`. */
export type AdSlot = {
  key: string;
  label: Trilingual;
  /** Tiyin, per day. */
  price: number;
  note: Trilingual;
  /** Days already queued for this placement. */
  wait: number;
};

export const AD_SLOTS: readonly AdSlot[] = [
  {
    key: 'top',
    label: { uz: 'Qidiruvda yuqorida', ru: 'Верх поиска', en: 'Top of search' },
    price: som(180_000),
    note: {
      uz: "O'z oshxonangiz turkumida birinchi uchlikda",
      ru: 'В тройке первых в своей кухне',
      en: 'In the first three of your cuisine',
    },
    wait: 0,
  },
  {
    key: 'rail',
    label: { uz: 'Bosh sahifa lentasi', ru: 'Лента на главной', en: 'Home rail' },
    price: som(320_000),
    note: {
      uz: '“Bugungi aksiyalar” lentasida',
      ru: 'В ленте «Акции сегодня»',
      en: 'In the “Today’s offers” rail',
    },
    wait: 0,
  },
  {
    key: 'banner',
    label: { uz: 'Banner', ru: 'Баннер', en: 'Banner' },
    price: som(640_000),
    note: {
      uz: "Bosh sahifadagi katta banner · kuniga 1 do'kon",
      ru: 'Большой баннер на главной · 1 магазин в день',
      en: 'The large home banner · one store a day',
    },
    wait: 4,
  },
];

export const AD_TEXT = {
  book: { uz: 'Band qilish', ru: 'Забронировать', en: 'Book it' } as Trilingual,
  booked: { uz: 'Band qilingan', ru: 'Забронировано', en: 'Booked' } as Trilingual,
  bookedNow: {
    uz: 'Joy band qilindi · ertadan boshlanadi',
    ru: 'Место забронировано · старт завтра',
    en: 'Slot booked · starts tomorrow',
  } as Trilingual,
  bookedQueue: {
    uz: 'Band qilindi · navbat 4 kun',
    ru: 'Забронировано · очередь 4 дня',
    en: 'Booked · a 4-day queue',
  } as Trilingual,
  released: {
    uz: 'Bandlov bekor qilindi',
    ru: 'Бронь отменена',
    en: 'Booking released',
  } as Trilingual,
  startsTomorrow: {
    uz: "Ertadan boshlanadi · har kuni to'lanadi",
    ru: 'Старт завтра · списание ежедневно',
    en: 'Starts tomorrow · billed daily',
  } as Trilingual,
  queued: {
    uz: 'Navbatda · {n} kundan keyin boshlanadi',
    ru: 'В очереди · {n} дней до старта',
    en: 'Queued · {n} days until it starts',
  } as Trilingual,
};

/* ============================================================== disputes KPIs */

/** Four figures above the disputes — `dspKpis` at `:1327-1332`. */
export const DISPUTE_KPIS: readonly MerchantKpi[] = [
  {
    key: 'open',
    label: { uz: 'Ochiq nizo', ru: 'Открытых споров', en: 'Open disputes' },
    value: { uz: '', ru: '', en: '' },
    note: { uz: 'javob kutmoqda', ru: 'ждут ответа', en: 'awaiting you' },
    tone: 'danger',
  },
  {
    key: 'month',
    label: { uz: '30 kunda', ru: 'За 30 дней', en: 'Last 30 days' },
    value: { uz: '7', ru: '7', en: '7' },
    note: { uz: '1 042 buyurtmadan', ru: 'из 1 042 заказов', en: 'of 1 042 orders' },
    tone: 'neutral',
  },
  {
    key: 'rate',
    label: { uz: 'Nizo darajasi', ru: 'Доля споров', en: 'Dispute rate' },
    value: { uz: '0.67%', ru: '0.67%', en: '0.67%' },
    note: { uz: "me'yor 1% dan kam", ru: 'норма ниже 1%', en: 'target under 1%' },
    tone: 'success',
  },
  {
    key: 'withheld',
    label: { uz: 'Ushlangan summa', ru: 'Удержано', en: 'Withheld' },
    value: { uz: '184 000', ru: '184 000', en: '184 000' },
    note: { uz: "so'm · shu oy", ru: 'сум · этот месяц', en: 'so’m · this month' },
    tone: 'neutral',
  },
];

/** The bank-details sheet — `bankTitle` / `bankSub` at `:1265-1266`. */
export const BANK_TEXT = {
  title: {
    uz: "Rekvizitni o'zgartirish",
    ru: 'Изменить реквизиты',
    en: 'Change bank details',
  } as Trilingual,
  sub: {
    uz: 'Hozirgi: Kapitalbank · 2020 8000 4471 9012',
    ru: 'Сейчас: Kapitalbank · 2020 8000 4471 9012',
    en: 'Currently: Kapitalbank · 2020 8000 4471 9012',
  } as Trilingual,
  incomplete: {
    uz: 'Bank va hisob raqamini kiriting',
    ru: 'Введите банк и номер счёта',
    en: 'Enter the bank and the account number',
  } as Trilingual,
};

/** Bank details as the settlement panel prints them — `setBank` at `:1318-1323`. */
export const BANK_ROWS: readonly { label: Trilingual; value: string; mono: boolean }[] = [
  { label: { uz: 'Bank', ru: 'Банк', en: 'Bank' }, value: 'Kapitalbank', mono: false },
  { label: { uz: 'Hisob', ru: 'Счёт', en: 'Account' }, value: '2020 8000 4471 9012', mono: true },
  { label: { uz: 'INN', ru: 'ИНН', en: 'INN' }, value: '302 481 776', mono: true },
  {
    label: { uz: 'Holat', ru: 'Статус', en: 'State' },
    value: '',
    mono: false,
  },
];

/** The verified state, which is a word rather than an identifier. */
export const BANK_VERIFIED: Trilingual = {
  uz: 'Tasdiqlangan',
  ru: 'Подтверждён',
  en: 'Verified',
};

/** The three settlement actions — `setActions` at `:1325-1335`. */
export const SETTLEMENT_ACTIONS: readonly { key: string; label: Trilingual; done: Trilingual }[] = [
  {
    key: 'invoice',
    label: {
      uz: 'Hisob-fakturani yuklash',
      ru: 'Скачать счёт',
      en: 'Download invoice',
    },
    done: { uz: 'Hisob-faktura yuklandi', ru: 'Счёт скачан', en: 'Invoice downloaded' },
  },
  {
    key: 'statement',
    label: { uz: 'Aktni yuklash', ru: 'Скачать акт', en: 'Download statement' },
    done: { uz: 'Akt yuklandi', ru: 'Акт скачан', en: 'Statement downloaded' },
  },
  {
    key: 'bank',
    label: {
      uz: "Rekvizitni o'zgartirish",
      ru: 'Изменить реквизиты',
      en: 'Change bank details',
    },
    done: {
      uz: "Rekvizitni o'zgartirish",
      ru: 'Изменить реквизиты',
      en: 'Change bank details',
    },
  },
];

/** "Yopish" — the one word every sheet needs. */
export const CLOSE: Trilingual = { uz: 'Yopish', ru: 'Закрыть', en: 'Close' };

/**
 * The write did not happen — shown when the API has no sentence of its own.
 *
 * One line rather than one per screen, because the API answers in the reader's
 * language whenever it answers at all; this is the case where it did not, and
 * the only fact worth saying then is that the change is not stored. The queue
 * keeps its own sharper wording (`ORDER_FLASH.notSent`) because a card that
 * moved back needs different words from a switch that did not flip.
 */
export const NOT_SAVED: Trilingual = {
  uz: 'Saqlanmadi · qayta urining',
  ru: 'Не сохранено · повторите',
  en: 'Not saved · try again',
};

/**
 * The three settings rows that carry a second line, and the tones — `setGroups`
 * at `Do'kon paneli.dc.html:1416-1449`.
 *
 * Keyed `"group:row"` against `merchantCopy().settingsGroups`, because that
 * array holds the words in three languages and this holds what the design does
 * with them. Two files, one order — the alternative was a fourth copy of every
 * label just to hang a colour on it.
 *
 * All three notes are the same kind of sentence: a number the merchant can
 * change by doing something. Photographs treble orders; your own courier cuts
 * the commission to 6%; aggregators charge 15–20%. A settings screen that lists
 * only the current value never tells anyone what the other value would be.
 */
export const SETTINGS_EXTRA: Readonly<
  Record<string, { note?: Trilingual; tone?: 'warning' | 'success' | 'subtle' | 'muted' }>
> = {
  '0:2': {
    note: {
      uz: "Rasmi bor do'kon uch barobar ko'p buyurtma oladi",
      ru: 'Магазин с фото получает в три раза больше заказов',
      en: 'A store with photos takes three times more orders',
    },
    tone: 'warning',
  },
  '0:3': { tone: 'muted' },
  '1:2': { tone: 'muted' },
  '1:3': { tone: 'muted' },
  '2:0': {
    note: {
      uz: "O'z kuryeringizga o'tsangiz komissiya 6% ga tushadi",
      ru: 'Со своим курьером комиссия снижается до 6%',
      en: 'With your own courier the commission falls to 6%',
    },
  },
  '2:3': { tone: 'subtle' },
  '3:0': {
    note: {
      uz: 'Agregatorlarda 15–20%',
      ru: 'У агрегаторов 15–20%',
      en: 'Aggregators charge 15–20%',
    },
  },
  '3:2': { tone: 'muted' },
  '3:3': { tone: 'success' },
};

/** The rating figure the performance panel opens with — `:483-485`. */
export const PERFORMANCE_RATING = { value: '4.7' };

/**
 * The performance screen, once it is this restaurant's own.
 *
 * `GET /v1/marketplace/performance` answers five figures over a thirty-day
 * window: orders, average seconds to accept, the rejection and cancellation
 * rates, and the storefront's rating with its review count. Those are the ones
 * drawn live.
 *
 * What the design also draws and the platform does not measure: the impression
 * funnel, the star histogram, the top-dish list and the sentence naming where
 * the biggest loss is. Those were rendered as constants — 11.4M impressions,
 * 812 reviews and a cart-abandonment diagnosis about a storefront nobody had
 * visited — and are now replaced by the note below until something counts them.
 */
export const PERFORMANCE_LIVE = {
  orders: { uz: 'Buyurtma', ru: 'Заказов', en: 'Orders' } as Trilingual,
  ordersNote: {
    uz: 'oxirgi {n} kun',
    ru: 'последние {n} дней',
    en: 'last {n} days',
  } as Trilingual,
  answer: { uz: 'Javob vaqti', ru: 'Время ответа', en: 'Answer time' } as Trilingual,
  answerNote: {
    uz: '{n} soniya ichida javob berish kerak',
    ru: 'ответить нужно за {n} секунд',
    en: '{n} seconds to answer',
  } as Trilingual,
  rejected: { uz: 'Rad etilgan', ru: 'Отклонено', en: 'Rejected' } as Trilingual,
  cancelled: { uz: 'Bekor qilingan', ru: 'Отменено', en: 'Cancelled' } as Trilingual,
  shareNote: {
    uz: 'oxirgi {n} kundagi ulush',
    ru: 'доля за последние {n} дней',
    en: 'share of the last {n} days',
  } as Trilingual,
  reviews: { uz: '· {n} baho', ru: '· {n} оценок', en: '· {n} reviews' } as Trilingual,
  /** Drawn where the funnel, the star histogram and the top-dish list were. */
  notMeasuredH: {
    uz: 'Bu ko‘rsatkichlar hali o‘lchanmaydi',
    ru: 'Эти показатели пока не измеряются',
    en: 'These are not measured yet',
  } as Trilingual,
  notMeasuredP: {
    uz: "Ko‘rishlar voronkasi, baholar taqsimoti va eng ko'p sotilgan taomlar — platforma ularni hali sanamaydi. Yuqoridagi to'rt raqam va reyting haqiqiy.",
    ru: 'Воронка показов, распределение оценок и топ блюд — платформа их пока не считает. Четыре числа выше и рейтинг — настоящие.',
    en: 'The impression funnel, the rating histogram and the top dishes are not counted by the platform yet. The four figures above and the rating are real.',
  } as Trilingual,
  noOrders: {
    uz: "Oxirgi 30 kunda buyurtma bo'lmagan.",
    ru: 'За последние 30 дней заказов не было.',
    en: 'No orders in the last 30 days.',
  } as Trilingual,
} as const;

/**
 * What the platform keeps from an order, and at what rate.
 *
 * The API's own figures when the row came from it; the design's constant only
 * for a fixture row, which is the demo board and nothing else. Three screens
 * used to multiply that constant themselves — the queue, the receipt sheet and
 * the settlement — so a store on any other rate read a fee it had never
 * agreed to on the screen it checks it was paid on.
 */
export function feeOf(order: { gross: number; fee: number | null; feePercent: number | null }): {
  fee: number;
  percent: number;
  net: number;
} {
  const percent = order.feePercent ?? MARKETPLACE_COMMISSION_PERCENT;
  const fee = order.fee ?? Math.round((order.gross * percent) / 100);

  return { fee, percent, net: order.gross - fee };
}

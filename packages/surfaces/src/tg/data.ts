/**
 * The Telegram bot and its mini app — every figure transcribed from
 * `Smart Restaurant Telegram.dc.html`.
 *
 * `specs/08-telegram.md §4.2`. Three stages, not four screens: the **bot chat**
 * a guest actually arrives in, the **mini app** the menu opens inside, and the
 * **notifications** the bot sends afterwards. The build had only the middle one,
 * which meant the mini app had no door.
 *
 * **It is the guest surface under a different roof, and deliberately not a
 * fifth copy of it.** The basket is the same `lib/guest-cart` store and the
 * totals are the same `lib/pricing` mirror of the server's `BillTotals`. What
 * differs is the chrome: Telegram supplies the header and the back button, the
 * theme comes from the client rather than from us, and emoji are allowed here
 * and nowhere else in the product (`FOUNDATIONS §8`) because Telegram's own
 * conventions require them.
 *
 * **The menu below is the design's menu.** It had drifted into a different
 * restaurant entirely — four categories against five, eight dishes against ten,
 * and not one price in common. A prototype whose numbers nobody can find in the
 * design file is a prototype nobody can review, so every name, description and
 * price here is `Telegram.dc.html:500-517` verbatim.
 *
 * The identity problem is real and is not this file's to solve: a Telegram id
 * is not the phone number the loyalty programme is keyed on, so points
 * fragment. `GAPS.md §4` owns it; the loyalty screen states the balance it was
 * given and never merges two accounts.
 */

import type { OrderState } from '@restaurant/i18n/order-state';

import type { DishImage } from '../media/image';

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** 1 UZS = 100 tiyin. The design writes so'm; nothing downstream sees a float. */
const som = (value: number): number => value * 100;

/* ============================================================
   Who the bot belongs to

   One template, forty-two restaurants — `t.lede`. The design's tenant switcher
   picks between three of them and each carries its own accent; this surface is
   Osh Xona, which is why the shell is `data-acc="a1"` and not the platform
   blue. A second tenant is a row here, not a fork of the app.
   ============================================================ */

export const TG_BOT = {
  name: 'Osh Xona',
  initials: 'OX',
  handle: '@oshxona_bot',
  /** `Telegram.dc.html:495` — terracotta, the accent axis' `a1`. */
  accent: 'a1',
} as const;

/**
 * The emoji this surface is allowed to draw.
 *
 * `FOUNDATIONS §8` bans them everywhere in the product except here. The set is
 * closed on purpose: the build had invented 📝, 👨‍🍳 and 🛵, none of which the
 * designer ever drew, and an invented glyph is a glyph nobody can check. These
 * nine are every emoji in `Telegram.dc.html`.
 */
export const TG_EMOJI = {
  accepted: '✅',
  cooking: '\u{1F525}',
  courier: '\u{1F69A}',
  pin: '\u{1F4CD}',
  phone: '\u{1F4DE}',
  star: '⭐',
  plov: '\u{1F372}',
  cake: '\u{1F382}',
  calendar: '\u{1F4C5}',
} as const;

/* ============================================================
   The menu
   ============================================================ */

export type TgCategory = { id: string; name: Trilingual };

/** Five, `Telegram.dc.html:519-525`. */
export const TG_CATEGORIES: readonly TgCategory[] = [
  { id: 'plov', name: { uz: 'Osh', ru: 'Плов', en: 'Plov' } },
  { id: 'grill', name: { uz: 'Grill', ru: 'Гриль', en: 'Grill' } },
  { id: 'salads', name: { uz: 'Salatlar', ru: 'Салаты', en: 'Salads' } },
  { id: 'tea', name: { uz: 'Choy', ru: 'Чай', en: 'Tea' } },
  { id: 'sweets', name: { uz: 'Shirinlik', ru: 'Десерты', en: 'Sweets' } },
];

export type TgDish = {
  id: string;
  categoryId: string;
  name: Trilingual;
  description: Trilingual;
  /** Tiyin, VAT already inside — the menu price is what the guest pays. */
  price: number;
  /** From the 86 list. A sold-out dish is shown, dimmed, and cannot be added. */
  soldOut: boolean;
  /**
   * The photograph at every size — see `media/image.ts`.
   *
   * Three states, and the screen treats two of them alike. `undefined` is a
   * fixture dish: the design's ten have no uploads, and the `.tg-shot` panel
   * is what the design draws there. `null` is a live dish the restaurant has
   * not photographed — the same panel, honestly. Optional rather than required
   * so the ten literals below stay the design's transcription and nothing
   * else.
   */
  image?: DishImage | null;
};

/** Ten, `Telegram.dc.html:500-517`. */
export const TG_MENU: readonly TgDish[] = [
  {
    id: 'd1',
    categoryId: 'plov',
    name: { uz: 'Toshkent oshi', ru: 'Ташкентский плов', en: 'Tashkent plov' },
    description: {
      uz: "Qazi, tuxum, no'xat · bir kishilik tovoq",
      ru: 'Казы, яйцо, горох · одна порция',
      en: 'Horse sausage, egg, chickpeas · one portion',
    },
    price: som(45_000),
    soldOut: false,
  },
  {
    id: 'd2',
    categoryId: 'plov',
    name: { uz: 'Sarimsoqli osh', ru: 'Плов с чесноком', en: 'Garlic plov' },
    description: {
      uz: "Butun sarimsoq bosh, qo'y go'shti",
      ru: 'Целая головка чеснока, баранина',
      en: 'Whole garlic bulb, lamb',
    },
    price: som(52_000),
    soldOut: false,
  },
  {
    id: 'd3',
    categoryId: 'plov',
    name: { uz: "To'y oshi", ru: 'Свадебный плов', en: 'Wedding plov' },
    description: {
      uz: 'Ikki kishilik lagan · 40 daqiqada tayyorlanadi',
      ru: 'Ляган на двоих · готовится 40 минут',
      en: 'Platter for two · 40 minutes to cook',
    },
    price: som(96_000),
    soldOut: false,
  },
  {
    id: 'd4',
    categoryId: 'grill',
    name: { uz: "Qo'y qovurmasi", ru: 'Жареная баранина', en: 'Grilled lamb' },
    description: {
      uz: "Ko'mirda · achchiq sous bilan",
      ru: 'На угле · с острым соусом',
      en: 'Over coals · with hot sauce',
    },
    price: som(78_000),
    soldOut: false,
  },
  {
    id: 'd5',
    categoryId: 'grill',
    name: { uz: 'Tovuq shashlik', ru: 'Куриный шашлык', en: 'Chicken skewers' },
    description: {
      uz: 'Ikki sixcha · piyoz va non bilan',
      ru: 'Два шампура · с луком и лепёшкой',
      en: 'Two skewers · with onion and bread',
    },
    price: som(44_000),
    // The one 86'd dish in the design. Kept, because the sold-out state is one
    // of the four this screen has to draw and a fixture that never exercises it
    // is a fixture that hides the bug.
    soldOut: true,
  },
  {
    id: 'd6',
    categoryId: 'salads',
    name: { uz: 'Achchiq-chuchuk', ru: 'Ачик-чучук', en: 'Achichuk salad' },
    description: {
      uz: "Pomidor, piyoz, ko'k rayhon",
      ru: 'Помидор, лук, базилик',
      en: 'Tomato, onion, basil',
    },
    price: som(22_000),
    soldOut: false,
  },
  {
    id: 'd7',
    categoryId: 'salads',
    name: { uz: 'Sezar salat', ru: 'Салат Цезарь', en: 'Caesar salad' },
    description: {
      uz: 'Tovuq, parmezan, krutonlar',
      ru: 'Курица, пармезан, крутоны',
      en: 'Chicken, parmesan, croutons',
    },
    price: som(38_000),
    soldOut: false,
  },
  {
    id: 'd8',
    categoryId: 'tea',
    name: { uz: "Ko'k choy, choynak", ru: 'Зелёный чай, чайник', en: 'Green tea, pot' },
    description: {
      uz: 'Bir litr · nonushta bilan',
      ru: 'Один литр · к завтраку',
      en: 'One litre · with breakfast',
    },
    price: som(12_000),
    soldOut: false,
  },
  {
    id: 'd9',
    categoryId: 'tea',
    name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' },
    description: {
      uz: 'Uy sharoitida · 0.4 l',
      ru: 'Домашний · 0.4 л',
      en: 'House-made · 0.4 l',
    },
    price: som(14_000),
    soldOut: false,
  },
  {
    id: 'd10',
    categoryId: 'sweets',
    name: { uz: 'Chak-chak', ru: 'Чак-чак', en: 'Chak-chak' },
    description: { uz: 'Asal bilan · 200 g', ru: 'С мёдом · 200 г', en: 'With honey · 200 g' },
    price: som(26_000),
    soldOut: false,
  },
];

export const TG_DISH_BY_ID: ReadonlyMap<string, TgDish> = new Map(
  TG_MENU.map((dish) => [dish.id, dish]),
);

/* ============================================================
   How it gets there
   ============================================================ */

export type TgMode = 'delivery' | 'pickup';

/**
 * Delivery and pickup, as the design's own header states them.
 *
 * **12 000 so'm, not 15 000** (`Telegram.dc.html:536`) and **25–35 minutes, not
 * 35** (`:812`). Both had drifted, and a delivery fee quoted 3 000 so'm high on
 * the one screen a guest reads before ordering is the difference between an
 * order and an abandoned basket.
 *
 * There is no free-delivery threshold on this surface. The customer app has
 * one; the Telegram design charges the fee on every delivery, and inventing a
 * threshold here would be a discount nobody at the restaurant agreed to.
 */
export const TG_DELIVERY = {
  fee: som(12_000),
  where: {
    uz: 'Yetkazish · Chilonzor 24, 47-xonadon',
    ru: 'Доставка · Чиланзар 24, кв 47',
    en: 'Delivery · Chilonzor 24, flat 47',
  } as Trilingual,
  when: {
    uz: "25–35 daqiqa · 12 000 so'm",
    ru: '25–35 минут · 12 000 сум',
    en: "25–35 minutes · 12 000 so'm",
  } as Trilingual,
};

export const TG_PICKUP = {
  where: {
    uz: 'Olib ketish · Chilonzor filiali',
    ru: 'Самовывоз · филиал Чиланзар',
    en: 'Takeaway · Chilonzor branch',
  } as Trilingual,
  when: {
    uz: '15 daqiqada tayyor · bepul',
    ru: 'Готово через 15 минут · бесплатно',
    en: 'Ready in 15 minutes · free',
  } as Trilingual,
};

export type TgRail = { id: 'click' | 'payme' | 'cash'; label: Trilingual; note: Trilingual };

/** Three rails, `Telegram.dc.html:539-543`. */
export const TG_RAILS: readonly TgRail[] = [
  {
    id: 'click',
    label: { uz: 'Click', ru: 'Click', en: 'Click' },
    note: {
      uz: "Telegram ichida to'lanadi",
      ru: 'Оплата внутри Telegram',
      en: 'Paid inside Telegram',
    },
  },
  {
    id: 'payme',
    label: { uz: 'Payme', ru: 'Payme', en: 'Payme' },
    note: {
      uz: 'Saqlangan karta · ···4417',
      ru: 'Сохранённая карта · ···4417',
      en: 'Saved card · ···4417',
    },
  },
  {
    id: 'cash',
    label: {
      uz: 'Yetkazishda naqd',
      ru: 'Наличными при доставке',
      en: 'Cash on delivery',
    },
    note: {
      uz: 'Kuryerga beriladi · chaqa tayyorlanadi',
      ru: 'Курьеру · сдача подготовлена',
      en: 'To the courier · change prepared',
    },
  },
];

/* ============================================================
   Loyalty
   ============================================================ */

export const TG_POINTS = {
  balance: 2_840,
  tier: { uz: 'Kumush daraja', ru: 'Серебряный уровень', en: 'Silver tier' } as Trilingual,
  next: { uz: 'Oltingacha 1 160', ru: 'До золота 1 160', en: '1 160 to gold' } as Trilingual,
  /** How far along the rail the bar is drawn — `Telegram.dc.html:378`. */
  progressPercent: 71,
  /** What one point is worth, in tiyin. One point = one so'm. */
  worth: 100,
  /**
   * The ceiling, and it is not decoration.
   *
   * `t.loyalWorth` — "1 ball = 1 so'm · hisobning 30% gacha ishlatiladi". The
   * cart used to let a balance swallow the whole food line, which turns a
   * loyalty scheme into a second currency and hands a guest a 0 so'm bill the
   * till cannot take money for.
   */
  maxSharePercent: 30,
} as const;

export type TgOffer = {
  id: string;
  icon: string;
  tone: 'acc' | 'warning' | 'success';
  title: Trilingual;
  note: Trilingual;
  /** Points it costs, or `null` when the tier includes it. */
  costs: number | null;
};

/** Three, `Telegram.dc.html:752-756`. */
export const TG_OFFERS: readonly TgOffer[] = [
  {
    id: 'second-plov',
    icon: TG_EMOJI.plov,
    tone: 'acc',
    title: {
      uz: 'Ikkinchi osh yarim narxda',
      ru: 'Второй плов за полцены',
      en: 'Second plov half price',
    },
    note: {
      uz: 'Dushanba–chorshanba · 12:00–16:00',
      ru: 'Понедельник–среда · 12:00–16:00',
      en: 'Monday–Wednesday · 12:00–16:00',
    },
    costs: null,
  },
  {
    id: 'birthday-cake',
    icon: TG_EMOJI.cake,
    tone: 'warning',
    title: {
      uz: "Tug'ilgan kun torti",
      ru: 'Торт на день рождения',
      en: 'Birthday cake',
    },
    note: {
      uz: "Tug'ilgan kunga ± 3 kun · 4 kishidan",
      ru: '± 3 дня от даты · от 4 человек',
      en: '± 3 days from the date · 4 guests or more',
    },
    costs: null,
  },
  {
    id: 'free-delivery',
    icon: TG_EMOJI.courier,
    tone: 'success',
    title: { uz: 'Bepul yetkazish', ru: 'Бесплатная доставка', en: 'Free delivery' },
    note: {
      uz: 'Keyingi buyurtmada · 3 km gacha',
      ru: 'На следующий заказ · до 3 км',
      en: 'On your next order · up to 3 km',
    },
    costs: 1_200,
  },
];

export type TgPointsEntry = {
  id: string;
  what: Trilingual;
  when: Trilingual;
  /** Signed: earned is positive, spent is negative. */
  points: number;
};

/** Three, `Telegram.dc.html:757-761`. */
export const TG_HISTORY: readonly TgPointsEntry[] = [
  {
    id: 'h1',
    what: { uz: 'Buyurtma #4471', ru: 'Заказ #4471', en: 'Order #4471' },
    when: {
      uz: "Bugun 11:02 · 124 000 so'm",
      ru: 'Сегодня 11:02 · 124 000 сум',
      en: "Today 11:02 · 124 000 so'm",
    },
    points: 620,
  },
  {
    id: 'h2',
    what: {
      uz: 'Bepul yetkazish ishlatildi',
      ru: 'Использована бесплатная доставка',
      en: 'Free delivery redeemed',
    },
    when: { uz: '6-avgust', ru: '6 августа', en: '6 August' },
    points: -1_200,
  },
  {
    id: 'h3',
    what: { uz: 'Baho berildi · 5', ru: 'Оставлена оценка · 5', en: 'Rating left · 5' },
    when: { uz: '6-avgust', ru: '6 августа', en: '6 August' },
    points: 100,
  },
];

/* ============================================================
   Tracking
   ============================================================ */

/**
 * Five rungs, and every key is the platform's.
 *
 * `packages/i18n/src/order-state.ts` is the single ladder — the audit that
 * produced it found five vocabularies for one concept. This surface had a sixth:
 * `confirmed`, which exists in no design artefact and in no database column,
 * sitting where the design draws **Tayyor**. So the rung a guest waiting for a
 * delivery cares most about — the food is finished, somebody is bringing it —
 * was the one the ladder had lost.
 *
 * `served` and `topay` are skipped rather than missing: a Telegram delivery is
 * never carried to a table and is paid before it leaves. `statesForChannel`
 * says the same thing on the server.
 */
export type TgStep = Extract<OrderState, 'accepted' | 'cooking' | 'ready' | 'enroute' | 'handed'>;

export const TG_LADDER: readonly TgStep[] = ['accepted', 'cooking', 'ready', 'enroute', 'handed'];

export const TG_ORDER = {
  number: '#4471',
  /** The rung reached; everything after it is drawn dim and timeless. */
  state: 'enroute' as TgStep,
  /** When each rung was reached — `Telegram.dc.html:648-654`. */
  times: {
    accepted: '11:02',
    cooking: '11:04',
    ready: '11:19',
    enroute: '11:21',
  } as Readonly<Partial<Record<TgStep, string>>>,
  eta: { uz: '9 daqiqa', ru: '9 минут', en: '9 minutes' } as Trilingual,
  handedEta: {
    uz: 'taxminan 11:32',
    ru: 'примерно 11:32',
    en: 'about 11:32',
  } as Trilingual,
  where: {
    uz: 'Chilonzor 24, 3-podyezd, 47-xonadon',
    ru: 'Чиланзар 24, подъезд 3, кв 47',
    en: 'Chilonzor 24, entrance 3, flat 47',
  } as Trilingual,
  courier: {
    initials: 'OS',
    note: {
      uz: 'Oybek S. · 4.9 · moped · 2.4 km',
      ru: 'Ойбек С. · 4.9 · мопед · 2.4 км',
      en: 'Oybek S. · 4.9 · moped · 2.4 km',
    } as Trilingual,
  },
  /** What it came to, tiyin, as charged. Historical: never recomputed. */
  total: som(124_000),
};

/* ============================================================
   The bot conversation

   The stage the build had no route to at all. `t.kbOpen` — "Menyuni ochish" —
   is the only door into the mini app, and `STAGENOTE.chat` says why the menu is
   not in the chat: "Menyu botda emas, mini ilovada ochiladi."
   ============================================================ */

export type TgChatAction =
  | { kind: 'open'; screen: 'menu' | 'order' | 'points' }
  | { kind: 'call' }
  | { kind: 'rate' }
  | { kind: 'problem' };

export type TgChatButton = { label: Trilingual; icon?: string; action: TgChatAction };

export type TgChatMessage = {
  id: string;
  /** Outgoing messages are the guest's own, and sit on the right. */
  outgoing: boolean;
  at: string;
  icon?: string;
  title?: Trilingual;
  body: Trilingual;
  rows?: readonly { label: Trilingual; value: string; strong?: boolean }[];
  keyboard?: readonly TgChatButton[];
};

/** Five, `Telegram.dc.html:557-580`. */
export const TG_CHAT: readonly TgChatMessage[] = [
  {
    id: 'm1',
    outgoing: false,
    at: '11:02',
    icon: TG_EMOJI.accepted,
    title: { uz: 'Buyurtma qabul qilindi', ru: 'Заказ принят', en: 'Order accepted' },
    body: {
      uz: 'Osh Xona · Chilonzor filiali\nBuyurtma #4471',
      ru: 'Osh Xona · филиал Чиланзар\nЗаказ #4471',
      en: 'Osh Xona · Chilonzor branch\nOrder #4471',
    },
    rows: [
      {
        label: {
          uz: '2 × Toshkent oshi',
          ru: '2 × Ташкентский плов',
          en: '2 × Tashkent plov',
        },
        value: '90 000',
      },
      {
        label: { uz: '1 × Achchiq-chuchuk', ru: '1 × Ачик-чучук', en: '1 × Achichuk' },
        value: '22 000',
      },
      { label: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' }, value: '12 000' },
      { label: { uz: 'Jami', ru: 'Итого', en: 'Total' }, value: '124 000', strong: true },
    ],
  },
  {
    id: 'm2',
    outgoing: true,
    at: '11:03',
    body: {
      uz: 'Qancha vaqtda yetkazasiz?',
      ru: 'Как быстро доставите?',
      en: 'How soon will it arrive?',
    },
  },
  {
    id: 'm3',
    outgoing: false,
    at: '11:04',
    icon: TG_EMOJI.cooking,
    title: { uz: 'Oshxonada', ru: 'На кухне', en: 'In the kitchen' },
    body: {
      uz: 'Oshpaz buyurtmani oldi. Yetkazish 25–35 daqiqa.\nKuryer tayinlanganda xabar beramiz.',
      ru: 'Повар принял заказ. Доставка 25–35 минут.\nСообщим, когда назначим курьера.',
      en: 'The cook has taken the order. Delivery in 25–35 minutes.\nWe will let you know when a courier is assigned.',
    },
    keyboard: [
      {
        label: { uz: 'Buyurtmani kuzatish', ru: 'Отследить заказ', en: 'Track the order' },
        icon: TG_EMOJI.pin,
        action: { kind: 'open', screen: 'order' },
      },
    ],
  },
  {
    id: 'm4',
    outgoing: false,
    at: '11:21',
    icon: TG_EMOJI.courier,
    title: { uz: "Kuryer yo'lda", ru: 'Курьер в пути', en: 'Courier on the way' },
    body: {
      uz: "Oybek S. · 2.4 km · taxminan 9 daqiqa\nNaqd to'lov: 124 000 so'm, chaqa tayyor.",
      ru: 'Ойбек С. · 2.4 км · примерно 9 минут\nОплата наличными: 124 000 сум, сдача готова.',
      en: "Oybek S. · 2.4 km · about 9 minutes\nCash payment: 124 000 so'm, change ready.",
    },
    keyboard: [
      {
        label: { uz: "Kuryerga qo'ng'iroq", ru: 'Позвонить курьеру', en: 'Call the courier' },
        icon: TG_EMOJI.phone,
        action: { kind: 'call' },
      },
      {
        label: { uz: 'Xaritada ko‘rish', ru: 'Показать на карте', en: 'Show on the map' },
        action: { kind: 'open', screen: 'order' },
      },
    ],
  },
  {
    id: 'm5',
    outgoing: false,
    at: '11:34',
    icon: TG_EMOJI.star,
    title: { uz: 'Baho bering', ru: 'Оцените заказ', en: 'Rate the order' },
    body: {
      uz: 'Buyurtma yetkazildi. Nima yaxshi bo‘ldi?',
      ru: 'Заказ доставлен. Что понравилось?',
      en: 'The order arrived. What went well?',
    },
    keyboard: [
      {
        label: { uz: '5 · hammasi yaxshi', ru: '5 · всё отлично', en: '5 · all good' },
        action: { kind: 'rate' },
      },
      /*
       * `GAPS.md §4.1 K3` — the only route in the whole product by which a
       * guest can say something went wrong. It is a chat button in the design
       * and it is a chat button here; the customer app grew the same flow
       * because a guest who ordered on the web has nowhere else to go.
       */
      {
        label: { uz: 'Muammo bor edi', ru: 'Была проблема', en: 'There was a problem' },
        action: { kind: 'problem' },
      },
      {
        label: {
          uz: 'Ballarim va aksiyalar',
          ru: 'Мои баллы и акции',
          en: 'My points and offers',
        },
        icon: TG_EMOJI.star,
        action: { kind: 'open', screen: 'points' },
      },
    ],
  },
];

/* ============================================================
   The notifications

   `Telegram.dc.html:382-414` draws them on a lock screen and `:607-624` fills
   them in. Four cards, one job each, one or two answers each — which is the
   whole argument of the stage: "Har biri bir ish uchun, har biri javob berish
   mumkin."
   ============================================================ */

export type TgPushAction =
  | { kind: 'open'; screen: 'menu' | 'order' | 'points' }
  | { kind: 'call' }
  | { kind: 'rate' }
  | { kind: 'confirm' }
  | { kind: 'cancel' };

export type TgPush = {
  id: string;
  /** A single glyph in a tinted square — not an emoji except where it is. */
  mark: string;
  tone: 'success' | 'acc' | 'warning' | 'star';
  ago: Trilingual;
  title: Trilingual;
  body: Trilingual;
  actions: readonly { label: Trilingual; action: TgPushAction }[];
};

export const TG_PUSHES: readonly TgPush[] = [
  {
    id: 'p1',
    mark: '✓',
    tone: 'success',
    ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
    title: {
      uz: "Buyurtma qabul qilindi · 124 000 so'm",
      ru: 'Заказ принят · 124 000 сум',
      en: "Order accepted · 124 000 so'm",
    },
    body: {
      uz: 'Osh Xona · #4471 · yetkazish 25–35 daqiqa',
      ru: 'Osh Xona · #4471 · доставка 25–35 минут',
      en: 'Osh Xona · #4471 · delivery in 25–35 minutes',
    },
    actions: [
      {
        label: { uz: 'Kuzatish', ru: 'Отследить', en: 'Track' },
        action: { kind: 'open', screen: 'order' },
      },
    ],
  },
  {
    id: 'p2',
    mark: '→',
    tone: 'acc',
    ago: { uz: '9 daq', ru: '9 мин', en: '9 min' },
    title: {
      uz: "Kuryer yo'lda · 9 daqiqa",
      ru: 'Курьер в пути · 9 минут',
      en: 'Courier on the way · 9 minutes',
    },
    body: {
      uz: "Oybek S. · naqd 124 000 so'm tayyorlab turing",
      ru: 'Ойбек С. · подготовьте 124 000 сум наличными',
      en: "Oybek S. · have 124 000 so'm in cash ready",
    },
    actions: [
      { label: { uz: "Qo'ng'iroq", ru: 'Позвонить', en: 'Call' }, action: { kind: 'call' } },
      {
        label: { uz: 'Xarita', ru: 'Карта', en: 'Map' },
        action: { kind: 'open', screen: 'order' },
      },
    ],
  },
  {
    id: 'p3',
    mark: TG_EMOJI.calendar,
    tone: 'warning',
    ago: { uz: '1 soat', ru: '1 ч', en: '1 h' },
    title: {
      uz: 'Ertaga stol bandlangan · 19:30',
      ru: 'Столик забронирован на завтра · 19:30',
      en: 'Table booked tomorrow · 19:30',
    },
    body: {
      uz: '4 kishi · Chilonzor · kelmasangiz bekor qiling',
      ru: '4 человека · Чиланзар · отмените, если не придёте',
      en: '4 guests · Chilonzor · cancel if you cannot come',
    },
    actions: [
      {
        label: { uz: 'Tasdiqlash', ru: 'Подтвердить', en: 'Confirm' },
        action: { kind: 'confirm' },
      },
      {
        label: { uz: 'Bekor qilish', ru: 'Отменить', en: 'Cancel' },
        action: { kind: 'cancel' },
      },
    ],
  },
  {
    id: 'p4',
    mark: TG_EMOJI.star,
    tone: 'star',
    ago: { uz: 'Kecha', ru: 'Вчера', en: 'Yesterday' },
    title: {
      uz: "Baho bering · 2 840 ball yig'ildi",
      ru: 'Оцените заказ · накоплено 2 840 баллов',
      en: 'Rate your order · 2 840 points earned',
    },
    body: {
      uz: "Baho bersangiz 100 ball qo'shiladi",
      ru: 'За отзыв добавим 100 баллов',
      en: 'Leaving a rating adds 100 points',
    },
    actions: [
      {
        label: { uz: "Ballarni ko'rish", ru: 'Посмотреть баллы', en: 'View points' },
        action: { kind: 'open', screen: 'points' },
      },
      { label: { uz: 'Baho bering', ru: 'Оценить', en: 'Rate' }, action: { kind: 'rate' } },
    ],
  },
];

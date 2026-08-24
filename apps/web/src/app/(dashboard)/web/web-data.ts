/**
 * The restaurant's own website, managed from the console.
 *
 * Read off `docs/design/source/Smart Restaurant OS.dc.html:2570-2825` (the
 * `atWeb` view) with its fixtures and derived values at `:15370-15563`. Four
 * tabs — `pages`, `menu`, `book`, `stats` — behind a strip, with the live
 * domain and a Publish button in the head.
 *
 * An earlier build drew four stacked sections and lost most of what the tabs
 * hold: the site copy fields with their character budgets, the opening hours,
 * the four menu-health figures, the bookable-window grid with its legend, the
 * four booking rules, the booking results, and the traffic tab's sources and
 * most-opened pages. The funnel survived; everything around it did not.
 *
 * Money is integer tiyin; `som()` multiplies the design's so'm on the way in.
 * Copy is the design's own `P("uz","ru","en")` triple.
 *
 * Fixtures. There is no traffic endpoint and the site's configuration is not
 * stored per tenant yet — `(site)` reads a fixture `venue-data.ts` rather than
 * a per-tenant record.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export function say(value: Trilingual, lang: Lang): string {
  return value[lang] || value.uz;
}

/** 1 UZS = 100 tiyin. */
export function som(amount: number): number {
  return amount * 100;
}

/** The one address this restaurant answers on. `wDomain`, `:15413`. */
export const SITE_DOMAIN = 'oshxona.smartrestaurant.uz';

/* ============================================================
   1 · Pages — the sections, the copy and the hours
   ============================================================ */

export type SiteSection = {
  key: string;
  name: Trilingual;
  note: Trilingual;
  /**
   * Two rows cannot be switched off.
   *
   * The hero and the menu *are* the site; a control whose only outcome is a
   * restaurant with no menu online should not look like a control. The design
   * draws those two with the word "Doim" where the switch would be, rather
   * than a disabled switch that reads as broken.
   */
  locked: boolean;
};

export const SECTIONS: readonly SiteSection[] = [
  {
    key: 'hero',
    name: { uz: 'Bosh ekran', ru: 'Главный экран', en: 'Hero' },
    note: {
      uz: 'Nom, reyting, yopish vaqti, ikki tugma',
      ru: 'Название, рейтинг, время закрытия, две кнопки',
      en: 'Name, rating, closing time, two buttons',
    },
    locked: true,
  },
  {
    key: 'menu',
    name: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
    note: {
      uz: 'POS menyusidan avtomatik olinadi',
      ru: 'Берётся из меню POS автоматически',
      en: 'Pulled from the POS menu automatically',
    },
    locked: true,
  },
  {
    key: 'order',
    name: { uz: 'Onlayn buyurtma', ru: 'Онлайн-заказ', en: 'Online ordering' },
    note: {
      uz: "Savat, yetkazish, to'lov",
      ru: 'Корзина, доставка, оплата',
      en: 'Cart, delivery, payment',
    },
    locked: false,
  },
  {
    key: 'book',
    name: { uz: 'Stol bandlash', ru: 'Бронь стола', en: 'Table booking' },
    note: {
      uz: 'Sana, vaqt, kishi soni',
      ru: 'Дата, время, число гостей',
      en: 'Date, time, party size',
    },
    locked: false,
  },
  {
    key: 'branch',
    name: { uz: 'Filiallar va xarita', ru: 'Филиалы и карта', en: 'Branches and map' },
    note: {
      uz: '5 filial · manzil, telefon, ish vaqti',
      ru: '5 филиалов · адрес, телефон, часы',
      en: '5 branches · address, phone, hours',
    },
    locked: false,
  },
  {
    key: 'about',
    name: { uz: 'Biz haqimizda', ru: 'О нас', en: 'About' },
    note: {
      uz: 'Tarix, jamoa, fotosuratlar',
      ru: 'История, команда, фото',
      en: 'Story, team, photos',
    },
    locked: false,
  },
  {
    key: 'review',
    name: { uz: 'Mijoz fikrlari', ru: 'Отзывы', en: 'Reviews' },
    note: {
      uz: 'CRM dagi bahodan olinadi · 4.9 · 1 240 baho',
      ru: 'Берётся из оценок CRM · 4.9 · 1 240 отзывов',
      en: 'From CRM ratings · 4.9 · 1 240 reviews',
    },
    locked: false,
  },
  {
    key: 'gift',
    name: { uz: "Sovg'a sertifikati", ru: 'Подарочный сертификат', en: 'Gift cards' },
    note: {
      uz: "Onlayn sotish · hozircha kam so'raladi",
      ru: 'Продажа онлайн · пока спрос низкий',
      en: 'Sold online · low demand so far',
    },
    locked: false,
  },
];

export type CopyField = {
  label: Trilingual;
  value: Trilingual;
  /** Characters used and the budget, exactly as the design prints them. */
  count: string;
  /** Row height the design gives the box. */
  height: string;
  /** False turns the counter amber — this field is empty and it matters. */
  filled: boolean;
  hint: Trilingual;
};

export const COPY_FIELDS: readonly CopyField[] = [
  {
    label: { uz: 'Sayt sarlavhasi', ru: 'Заголовок сайта', en: 'Site headline' },
    value: {
      uz: "Osh Xona — Toshkentda to'y oshi",
      ru: 'Osh Xona — свадебный плов в Ташкенте',
      en: 'Osh Xona — wedding plov in Tashkent',
    },
    count: '38 / 60',
    height: '42px',
    filled: true,
    hint: {
      uz: "Google natijalarida ko'rinadi",
      ru: 'Показывается в результатах Google',
      en: 'Appears in Google results',
    },
  },
  {
    label: { uz: 'Qisqa tavsif', ru: 'Краткое описание', en: 'Short description' },
    value: {
      uz: "Ochiq oshxona, kunda ikki marta yangi osh. Chilonzor, Yunusobod, Sergeli, Mirzo Ulug'bek va Termizda.",
      ru: 'Открытая кухня, свежий плов дважды в день. Чиланзар, Юнусабад, Сергели, Мирзо Улугбек и Термез.',
      en: "Open kitchen, fresh plov twice a day. In Chilonzor, Yunusobod, Sergeli, Mirzo Ulug'bek and Termiz.",
    },
    count: '118 / 160',
    height: '62px',
    filled: true,
    hint: {
      uz: "Telegram va ijtimoiy tarmoqlarda ulashilganda ko'rinadi",
      ru: 'Видно при отправке в Telegram и соцсети',
      en: 'Shown when shared in Telegram and social',
    },
  },
  {
    label: { uz: 'Yopish haqida eslatma', ru: 'Заметка о закрытии', en: 'Closing notice' },
    value: {
      uz: "Bo'sh — yozilmagan",
      ru: 'Пусто — не заполнено',
      en: 'Empty — not written',
    },
    count: '0 / 90',
    height: '42px',
    filled: false,
    hint: {
      uz: "Bayram va ta'mirlash kunlarida shu joy ishlatiladi",
      ru: 'Используется в праздники и на время ремонта',
      en: 'Used for holidays and maintenance days',
    },
  },
];

export type OpeningDay = {
  day: Trilingual;
  hours: string;
  /** Only one day carries a tag, and it is today. */
  today: boolean;
};

export const OPENING_HOURS: readonly OpeningDay[] = [
  {
    day: { uz: 'Dushanba', ru: 'Понедельник', en: 'Monday' },
    hours: '10:00 – 23:00',
    today: false,
  },
  { day: { uz: 'Seshanba', ru: 'Вторник', en: 'Tuesday' }, hours: '10:00 – 23:00', today: true },
  { day: { uz: 'Chorshanba', ru: 'Среда', en: 'Wednesday' }, hours: '10:00 – 23:00', today: false },
  { day: { uz: 'Payshanba', ru: 'Четверг', en: 'Thursday' }, hours: '10:00 – 23:00', today: false },
  { day: { uz: 'Juma', ru: 'Пятница', en: 'Friday' }, hours: '10:00 – 01:00', today: false },
  { day: { uz: 'Shanba', ru: 'Суббота', en: 'Saturday' }, hours: '10:00 – 01:00', today: false },
  {
    day: { uz: 'Yakshanba', ru: 'Воскресенье', en: 'Sunday' },
    hours: '11:00 – 23:00',
    today: false,
  },
];

/* ============================================================
   2 · The menu, as the site shows it
   ============================================================ */

export type SiteDish = {
  name: Trilingual;
  category: Trilingual;
  photo: boolean;
  described: boolean;
  /** Tiyin. */
  price: number;
  /** Views in the period. */
  views: number;
};

export const SITE_DISHES: readonly SiteDish[] = [
  {
    name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
    category: { uz: 'Milliy', ru: 'Национальная', en: 'Uzbek' },
    photo: true,
    described: true,
    price: som(48_000),
    views: 1_840,
  },
  {
    name: { uz: "Achchiq lag'mon", ru: 'Острый лагман', en: 'Spicy lagman' },
    category: { uz: 'Milliy', ru: 'Национальная', en: 'Uzbek' },
    photo: true,
    described: true,
    price: som(42_000),
    views: 1_220,
  },
  {
    name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pcs' },
    category: { uz: 'Milliy', ru: 'Национальная', en: 'Uzbek' },
    photo: false,
    described: true,
    price: som(38_000),
    views: 960,
  },
  {
    name: { uz: 'Chizburger', ru: 'Чизбургер', en: 'Cheeseburger' },
    category: { uz: 'Burger', ru: 'Бургеры', en: 'Burgers' },
    photo: true,
    described: false,
    price: som(39_000),
    views: 2_140,
  },
  {
    name: { uz: 'Double beef', ru: 'Double beef', en: 'Double beef' },
    category: { uz: 'Burger', ru: 'Бургеры', en: 'Burgers' },
    photo: true,
    described: true,
    price: som(58_000),
    views: 1_580,
  },
  {
    name: { uz: 'Margherita, 30 sm', ru: 'Маргарита 30 см', en: 'Margherita 30 cm' },
    category: { uz: 'Pitsa', ru: 'Пицца', en: 'Pizza' },
    photo: false,
    described: false,
    price: som(56_000),
    views: 1_310,
  },
  {
    name: { uz: 'Tovuqli lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
    category: { uz: 'Lavash', ru: 'Лаваш', en: 'Lavash' },
    photo: true,
    described: true,
    price: som(32_000),
    views: 1_740,
  },
  {
    name: { uz: 'Sezar salat', ru: 'Салат Цезарь', en: 'Caesar salad' },
    category: { uz: 'Salatlar', ru: 'Салаты', en: 'Salads' },
    photo: false,
    described: true,
    price: som(34_000),
    views: 620,
  },
  {
    name: { uz: "Ko'k choy, choynak", ru: 'Зелёный чай, чайник', en: 'Green tea, pot' },
    category: { uz: 'Ichimlik', ru: 'Напитки', en: 'Drinks' },
    photo: false,
    described: false,
    price: som(12_000),
    views: 2_260,
  },
];

/** The most-viewed dish, and the sting in the tail. `wMenuKpis[3]`, `:15466`. */
export const MOST_VIEWED = {
  views: 2_260,
  note: {
    uz: "Ko'k choy · lekin rasmi yo'q",
    ru: 'Зелёный чай · но без фото',
    en: 'Green tea · but no photo',
  } satisfies Trilingual,
} as const;

/* ============================================================
   3 · Bookings
   ============================================================ */

/**
 * How many tables are still bookable in each window. `wSlots`, `:15479`.
 *
 * Zero is full, one or two is tight, and a window the manager has closed is not
 * shown on the site at all — which is why closing one is a button rather than a
 * setting buried in a form.
 *
 * The design drew this strip with no weekday and no venue on it. The table
 * behind it — `tables.booking_windows` — has both, so this survives as the
 * *sample* week below rather than as the screen's own state: it is the shape
 * the grid falls back to when there is no session to read a real one with.
 */
export const BOOKING_WINDOWS: readonly { time: string; tables: number }[] = [
  { time: '11:00', tables: 8 },
  { time: '12:00', tables: 4 },
  { time: '13:00', tables: 2 },
  { time: '14:00', tables: 8 },
  { time: '17:00', tables: 8 },
  { time: '18:00', tables: 6 },
  { time: '19:00', tables: 0 },
  { time: '20:00', tables: 1 },
  { time: '21:00', tables: 5 },
  { time: '22:00', tables: 8 },
];

export const SLOT_LEGEND: readonly { label: Trilingual; bg: string; border: string }[] = [
  {
    label: { uz: "Bo'sh", ru: 'Свободно', en: 'Free' },
    bg: 'var(--surface)',
    border: 'var(--border-strong)',
  },
  {
    label: { uz: '8 mehmon yoki kamroq', ru: '8 гостей или меньше', en: '8 guests or fewer' },
    bg: 'var(--warning-50)',
    border: 'var(--warning-500)',
  },
  {
    label: { uz: 'To’la yoki yopiq', ru: 'Занято или закрыто', en: 'Full or closed' },
    bg: 'var(--danger-50)',
    border: 'var(--danger-500)',
  },
];

/**
 * A four-top, which is how the design's table counts become covers.
 *
 * `booking_windows.capacity` counts GUESTS and the migration says why: *"a host
 * asks how many people are coming at seven, and the table plan that seats them
 * is worked out on the night"*. The design's strip counts tables. The two are
 * the same statement at four seats a table, and picking that ratio here rather
 * than in the panel keeps the sample's tints identical to the design's: two
 * tables become eight covers, which is exactly where the amber legend sits.
 */
const COVERS_PER_TABLE = 4;

/**
 * Where a window stops being roomy and starts being worth watching.
 *
 * The design's legend says "2 tables or fewer" and this is that sentence in the
 * unit the column actually holds. It is a display threshold and nothing else —
 * the site keeps taking bookings right down to the last cover.
 */
export const TIGHT_COVERS = 2 * COVERS_PER_TABLE;

/** ISO-8601, the same convention the column uses: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * One hour a venue takes bookings in, and what the window covering it offers.
 *
 * Carried per hour rather than per weekday because a split service is two rows
 * — 12:00–15:00 at twenty covers, 18:00–23:00 at forty — and one number for the
 * day would print the dinner ceiling over lunch.
 */
export type BookingHour = {
  /** 0–23, the wall clock at the venue. */
  hour: number;
  /** Guests per slot. Zero is a real answer: open, and full. */
  capacity: number;
  /** How long one sitting is. 15–240, thirty by default. */
  slotMinutes: number;
};

/** One row of the grid: a weekday, and the hours it is bookable in. */
export type BookingDay = {
  weekday: Weekday;
  /** Ascending, and only the hours that are open. Empty is a closed day. */
  open: readonly BookingHour[];
};

/** What the bookings tab draws, and whether it may write. */
export type BookingGrid = {
  /**
   * Whether these are the venue's own windows.
   *
   * `false` is the design's sample week — no session, an expired token, an API
   * mid-restart — and the panel says so and posts nothing. A grid that wrote
   * against a sample would be closing hours at a venue nobody is looking at.
   */
  live: boolean;
  /** Seven rows, Monday first, whatever the API answered. */
  days: readonly BookingDay[];
  /**
   * Which venue these windows belong to, when it can be told from them.
   *
   * A window is NOT NULL on `branch_id` — a mall unit and a terrace do not
   * close at the same hour — so a write has to name one. `null` means "let the
   * API decide", which is right for anybody pinned to a venue and is refused
   * with its own sentence for an owner reading the whole estate.
   */
  branchId: number | null;
};

/**
 * The design's own week, for a console with no session behind it.
 *
 * The same strip on all seven rows. That is not laziness: the design drew one
 * strip and never said which day it was, so repeating it is the honest reading
 * — inventing a quiet Monday and a busy Saturday would put figures on the
 * screen the design never gave and a reader could not tell from real ones.
 */
export const DEMO_BOOKING_GRID: BookingGrid = {
  live: false,
  branchId: null,
  days: WEEKDAYS.map((weekday) => ({
    weekday,
    open: BOOKING_WINDOWS.map((slot) => ({
      hour: Number(slot.time.slice(0, 2)),
      capacity: slot.tables * COVERS_PER_TABLE,
      // The column's own default, and what `BookingWindow::SLOT_MIN` allows at
      // the bottom. A sample that quoted fifteen minutes would be describing a
      // canteen.
      slotMinutes: 30,
    })),
  })),
};

/**
 * The column's own defaults, for an hour opened where nothing stood before.
 *
 * Twenty covers and half an hour are what the migration writes when a window
 * arrives without them, so a tile drawn optimistically with these numbers is
 * showing what the row will actually hold rather than a guess. See
 * `2026_08_22_122000_a_venue_says_when_it_takes_bookings.php`.
 */
export const DEFAULT_COVERS = 20;

export const DEFAULT_SLOT_MINUTES = 30;

/**
 * One weekday's open hours, rebuilt around a new set of hours.
 *
 * Used three times and deliberately only written once: opening an hour, closing
 * one, and reconciling with what the API says the weekday became. All three are
 * the same operation — *these hours, and what each of them offers* — and three
 * separate versions of it would drift the moment one of them forgot to sort.
 *
 * An hour that was already open keeps its own capacity and sitting length. A
 * newly opened one borrows from its nearest neighbour, because the commonest
 * reason an hour appears is that a service was extended by one, and the write
 * on the other side inherits in exactly the same direction — a span split out
 * of a forty-cover evening stays a forty-cover evening. With no neighbour at
 * all there is nothing to borrow from and the column's defaults are the honest
 * answer.
 */
export function hoursOn(day: BookingDay, hours: readonly number[]): readonly BookingHour[] {
  const known = new Map(day.open.map((slot) => [slot.hour, slot]));

  return [...new Set(hours)]
    .sort((left, right) => left - right)
    .map((hour) => {
      const standing = known.get(hour);

      if (standing !== undefined) return standing;

      const nearest = [...day.open].sort((left, right) => {
        return Math.abs(left.hour - hour) - Math.abs(right.hour - hour);
      })[0];

      return {
        hour,
        capacity: nearest?.capacity ?? DEFAULT_COVERS,
        slotMinutes: nearest?.slotMinutes ?? DEFAULT_SLOT_MINUTES,
      };
    });
}

/** The design's own strip, widened by an hour, for a week with nothing in it. */
const DEMO_BAND_FIRST =
  Math.min(...BOOKING_WINDOWS.map((slot) => Number(slot.time.slice(0, 2)))) - 1;

const DEMO_BAND_LAST =
  Math.max(...BOOKING_WINDOWS.map((slot) => Number(slot.time.slice(0, 2)))) + 1;

/**
 * The hour columns to draw, from the hours the week actually uses.
 *
 * A band rather than all twenty-four, because a grid that always drew 03:00
 * would spend a third of its width on hours no restaurant trades in. One hour
 * of margin on each side is what makes the grid usable at all: extending
 * service by an hour has to be a click on a tile that is already on screen, and
 * each save widens the band again.
 *
 * Recomputed in the browser from the panel's own state rather than sent down
 * once — opening 23:00 has to grow the grid on the same press that opens it,
 * not on the next render the server happens to do.
 */
export function bandFrom(days: readonly BookingDay[]): readonly number[] {
  const open = days.flatMap((day) => day.open.map((slot) => slot.hour));

  // A venue with no windows at all is the common case — booking windows are a
  // feature a restaurant switches on by filling them in — so the empty grid
  // opens on the design's own band rather than on midnight.
  const first = open.length === 0 ? DEMO_BAND_FIRST : Math.max(0, Math.min(...open) - 1);
  const last = open.length === 0 ? DEMO_BAND_LAST : Math.min(23, Math.max(...open) + 1);

  return Array.from({ length: last - first + 1 }, (_, step) => first + step);
}

export type BookingRule = {
  key: string;
  label: Trilingual;
  note: Trilingual;
  on: boolean;
};

export const BOOKING_RULES: readonly BookingRule[] = [
  {
    key: 'auto',
    label: {
      uz: 'Bandlashni avtomatik tasdiqlash',
      ru: 'Автоматически подтверждать бронь',
      en: 'Auto-confirm bookings',
    },
    note: {
      uz: "Bo'sh stol bo'lsa mijoz darhol tasdiq oladi. O'chirilsa, menejer qo'lda tasdiqlaydi va mijoz kutadi.",
      ru: 'Если стол свободен, гость получает подтверждение сразу. Если выключить, менеджер подтверждает вручную, а гость ждёт.',
      en: 'If a table is free the guest is confirmed at once. Turn it off and the manager confirms by hand while the guest waits.',
    },
    on: true,
  },
  {
    key: 'sms',
    label: {
      uz: '2 soat oldin eslatma yuborish',
      ru: 'Напоминание за 2 часа',
      en: 'Remind 2 hours before',
    },
    note: {
      uz: "Telegram yoki SMS. Eslatma kelmasa, kelmaydigan mijoz ulushi ikki barobar ko'p.",
      ru: 'Telegram или SMS. Без напоминания доля неявок вдвое выше.',
      en: 'Telegram or SMS. Without a reminder the no-show rate doubles.',
    },
    on: true,
  },
  {
    key: 'dep',
    label: {
      uz: "6 kishidan ko'p bo'lsa oldindan to'lov",
      ru: 'Предоплата для компаний свыше 6 человек',
      en: 'Deposit for parties over 6',
    },
    note: {
      uz: "50 000 so'm. Katta kompaniya kelmasa, zal bir soat bo'sh turadi.",
      ru: '50 000 сум. Если большая компания не придёт, зал час простоит пустым.',
      en: "50 000 so'm. When a large party fails to show, the room sits empty for an hour.",
    },
    on: false,
  },
  {
    key: 'wait',
    label: {
      uz: "To'la bo'lganda navbatga yozish",
      ru: 'Лист ожидания при полной загрузке',
      en: 'Waitlist when full',
    },
    note: {
      uz: "Bo'sh joy chiqsa, navbatdagi birinchi mijozga xabar ketadi.",
      ru: 'Если место освободится, первому в листе придёт уведомление.',
      en: 'If a table frees up, the first in line is notified.',
    },
    on: true,
  },
];

export type BookingStat = {
  label: Trilingual;
  /** A plain string, or null when the figure is money. */
  value: string | null;
  /** Tiyin, when `value` is null. */
  amount?: number;
  tone: 'plain' | 'warning';
};

export const BOOKING_STATS: readonly BookingStat[] = [
  {
    label: { uz: 'Bu hafta bandlangan', ru: 'Броней на этой неделе', en: 'Booked this week' },
    value: '62',
    tone: 'plain',
  },
  {
    label: { uz: 'Kelmagan mijoz', ru: 'Неявки', en: 'No-shows' },
    value: '7 · 11%',
    tone: 'warning',
  },
  {
    label: { uz: "O'rtacha kompaniya", ru: 'Средняя компания', en: 'Average party' },
    value: '3.4',
    tone: 'plain',
  },
  {
    label: { uz: 'Bandlovdan tushum', ru: 'Выручка с брони', en: 'Revenue from bookings' },
    value: null,
    amount: som(8_940_000),
    tone: 'plain',
  },
];

/* ============================================================
   4 · Traffic
   ============================================================ */

export type TrafficKpi = {
  label: Trilingual;
  value: string;
  note: Trilingual;
  tone: 'success' | 'muted';
};

export const TRAFFIC_KPIS: readonly TrafficKpi[] = [
  {
    label: { uz: 'Bu hafta tashrif', ru: 'Посещений за неделю', en: 'Visits this week' },
    value: '4 820',
    note: { uz: '+18.4%', ru: '+18.4%', en: '+18.4%' },
    tone: 'success',
  },
  {
    label: { uz: 'Buyurtmaga aylangan', ru: 'Стало заказом', en: 'Became an order' },
    value: '6.1%',
    note: { uz: "me'yor 4–8%", ru: 'норма 4–8%', en: 'typical 4–8%' },
    tone: 'muted',
  },
  {
    label: {
      uz: "Ilova sifatida o'rnatgan",
      ru: 'Установили как приложение',
      en: 'Installed as an app',
    },
    value: '412',
    note: { uz: '+64 bu hafta', ru: '+64 за неделю', en: '+64 this week' },
    tone: 'success',
  },
  {
    label: { uz: 'Telefonda ochgan', ru: 'Открыли с телефона', en: 'Opened on mobile' },
    value: '88%',
    note: { uz: 'desktop 12%', ru: 'десктоп 12%', en: 'desktop 12%' },
    tone: 'muted',
  },
];

export type FunnelStep = {
  label: Trilingual;
  count: number;
  /** Already a signed per cent; the first step has none. */
  drop: string;
};

/**
 * Five steps, not four — and the third one is the whole screen.
 *
 * 4 820 visits become 3 410 menu views, then **892 carts**. The 74% lost there
 * is not a rounding artefact; it is the business problem, and the design marks
 * that bar and writes its cause underneath rather than drawing five neutral
 * bars and leaving the reader to subtract.
 */
export const FUNNEL: readonly FunnelStep[] = [
  { label: { uz: 'Saytga kirdi', ru: 'Зашли на сайт', en: 'Visited' }, count: 4_820, drop: '' },
  {
    label: { uz: 'Menyuni ochdi', ru: 'Открыли меню', en: 'Opened the menu' },
    count: 3_410,
    drop: '−29%',
  },
  {
    label: { uz: "Savatga qo'shdi", ru: 'Добавили в корзину', en: 'Added to cart' },
    count: 892,
    drop: '−74%',
  },
  {
    label: { uz: "To'lovga o'tdi", ru: 'Перешли к оплате', en: 'Reached checkout' },
    count: 402,
    drop: '−55%',
  },
  {
    label: { uz: 'Buyurtma berdi', ru: 'Оформили заказ', en: 'Ordered' },
    count: 294,
    drop: '−27%',
  },
];

/** Index of the step the design paints amber and calls out. */
export const WORST_STEP = 2;

export const SOURCES: readonly { label: Trilingual; visits: number; colour: string }[] = [
  { label: { uz: 'Telegram', ru: 'Telegram', en: 'Telegram' }, visits: 1_980, colour: '#229ED9' },
  {
    label: { uz: "To'g'ridan-to'g'ri", ru: 'Прямые', en: 'Direct' },
    visits: 1_240,
    colour: 'var(--brand-500)',
  },
  {
    label: { uz: 'Google', ru: 'Google', en: 'Google' },
    visits: 1_010,
    colour: 'var(--accent-500)',
  },
  {
    label: { uz: 'Instagram', ru: 'Instagram', en: 'Instagram' },
    visits: 590,
    colour: '#C13584',
  },
];

export const TOP_PAGES: readonly { label: Trilingual; views: string }[] = [
  {
    label: {
      uz: 'Menyu · Milliy taomlar',
      ru: 'Меню · Национальная кухня',
      en: 'Menu · Uzbek',
    },
    views: '1 840',
  },
  { label: { uz: 'Bosh sahifa', ru: 'Главная', en: 'Home' }, views: '1 620' },
  {
    label: { uz: 'Menyu · Burgerlar', ru: 'Меню · Бургеры', en: 'Menu · Burgers' },
    views: '1 140',
  },
  { label: { uz: 'Stol bandlash', ru: 'Бронь стола', en: 'Table booking' }, views: '680' },
  { label: { uz: 'Filiallar', ru: 'Филиалы', en: 'Branches' }, views: '410' },
];

/* ============================================================
   The screen's own chrome
   ============================================================ */

export const WEB_UI = {
  /** A switch that could not be written: it goes back to where it was. */
  saveFailed: {
    uz: 'Saqlanmadi — qayta urinib ko‘ring',
    ru: 'Не сохранилось — попробуйте ещё раз',
    en: 'Not saved — try again',
  },
  tabPages: { uz: 'Sahifalar', ru: 'Страницы', en: 'Pages' },
  tabMenu: { uz: "Menyu ko'rinishi", ru: 'Меню на сайте', en: 'Menu online' },
  tabBook: { uz: 'Bandlash', ru: 'Бронирование', en: 'Bookings' },
  tabStats: { uz: 'Statistika', ru: 'Статистика', en: 'Traffic' },

  publish: { uz: 'Nashr etish', ru: 'Опубликовать', en: 'Publish' },
  published: { uz: 'Nashr etilgan', ru: 'Опубликовано', en: 'Published' },

  always: { uz: 'Doim', ru: 'Всегда', en: 'Always' },
  sectionsHead: { uz: 'Sayt bo’limlari', ru: 'Разделы сайта', en: 'Site sections' },
  sectionsSub: {
    uz: "Kerak bo'lmagan bo'limni o'chirib qo'ying — bo'sh sahifa mijozni chalkashtiradi",
    ru: 'Отключите ненужный раздел — пустая страница только путает гостя',
    en: 'Turn off what you do not need — an empty page only confuses the guest',
  },
  copyHead: { uz: 'Sayt matni', ru: 'Текст сайта', en: 'Site copy' },
  copySub: {
    uz: "Uch tilda yoziladi. Bo'sh qolgan matn Google natijalarida ham bo'sh ko'rinadi.",
    ru: 'Пишется на трёх языках. Пустой текст останется пустым и в результатах Google.',
    en: 'Written in three languages. Copy left empty shows up empty in Google too.',
  },
  hoursHead: { uz: 'Ish vaqti', ru: 'Часы работы', en: 'Opening hours' },
  hoursSub: {
    uz: "Saytda, Telegramda va Google xaritada bir xil ko'rinadi",
    ru: 'Одинаково видно на сайте, в Telegram и на картах Google',
    en: 'The same on the site, in Telegram and on Google Maps',
  },
  today: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' },

  menuHead: { uz: 'Saytdagi menyu', ru: 'Меню на сайте', en: 'The menu online' },
  menuSub: {
    uz: "Narx va mavjudlik POS dan keladi. Bu yerda faqat ko'rinishini boshqarasiz.",
    ru: 'Цена и наличие приходят из POS. Здесь вы управляете только показом.',
    en: 'Price and availability come from the POS. Here you control only what is shown.',
  },
  fixAll: {
    uz: "Rasmsiz taomlarni to'ldirish",
    ru: 'Заполнить блюда без фото',
    en: 'Fix the dishes without photos',
  },
  menuNote: {
    uz: "Stop-listdagi taom bu jadvalda ko'rinadi, lekin saytda avtomatik xiralashadi — qo'lda yashirish kerak emas. Yashirish faqat mavsumiy yoki faqat zal uchun taomlarga kerak.",
    ru: 'Блюдо из стоп-листа остаётся в этой таблице, но на сайте гаснет автоматически — скрывать вручную не нужно. Скрытие нужно только для сезонных блюд или блюд только для зала.',
    en: "An 86'd dish stays in this table but dims on the site automatically — no need to hide it by hand. Hiding is for seasonal or dine-in-only dishes.",
  },
  colDish: { uz: 'Taom', ru: 'Блюдо', en: 'Dish' },
  colPhoto: { uz: 'Rasm', ru: 'Фото', en: 'Photo' },
  colDescription: { uz: 'Tavsif', ru: 'Описание', en: 'Description' },
  colPrice: { uz: 'Narx', ru: 'Цена', en: 'Price' },
  colViews: { uz: "Ko'rildi", ru: 'Просмотры', en: 'Views' },
  photoYes: { uz: 'Bor', ru: 'Есть', en: 'Yes' },
  photoNo: { uz: "Yo'q", ru: 'Нет', en: 'None' },
  written: { uz: "To'ldirilgan", ru: 'Заполнено', en: 'Written' },
  notWritten: { uz: 'Yozilmagan', ru: 'Не заполнено', en: 'Not written' },
  hide: { uz: 'Yashirish', ru: 'Скрыть', en: 'Hide' },
  show: { uz: "Ko'rsatish", ru: 'Показать', en: 'Show' },
  kpiLive: { uz: "Saytda ko'rinadi", ru: 'Видно на сайте', en: 'Live online' },
  kpiLiveNote: { uz: 'POS menyusidan', ru: 'из меню POS', en: 'of the POS menu' },
  kpiNoPhoto: { uz: "Rasmi yo'q", ru: 'Без фото', en: 'No photo' },
  kpiNoPhotoNote: {
    uz: 'rasmsiz taom 3 barobar kam buyurtma oladi',
    ru: 'блюдо без фото заказывают в 3 раза реже',
    en: 'dishes without a photo sell 3× less',
  },
  kpiNoDescription: { uz: "Tavsifi yo'q", ru: 'Без описания', en: 'No description' },
  kpiNoDescriptionNote: {
    uz: 'mijoz nima ekanini so’raydi',
    ru: 'гость спрашивает, что это',
    en: 'guests ask what it is',
  },
  kpiMostViewed: {
    uz: "Eng ko'p ko'rilgan",
    ru: 'Больше всего просмотров',
    en: 'Most viewed',
  },

  slotsHead: { uz: 'Bandlash oynalari', ru: 'Окна бронирования', en: 'Booking windows' },
  slotsSub: {
    uz: "Bosib oynani yopasiz. Yopilgan oyna saytda umuman ko'rinmaydi.",
    ru: 'Нажмите, чтобы закрыть окно. Закрытое окно на сайте не показывается вовсе.',
    en: 'Tap to close a window. A closed window does not appear on the site at all.',
  },
  slotClosed: { uz: 'Yopiq', ru: 'Закрыто', en: 'Closed' },
  slotFull: { uz: "To'la", ru: 'Занято', en: 'Full' },
  slotOpen: { uz: 'Ochiq', ru: 'Открыто', en: 'Open' },
  /** What the number in a tile counts, said once beside the legend. */
  slotCapacityNote: {
    uz: 'Raqam — bitta oynaga sig‘adigan mehmon soni',
    ru: 'Число — сколько гостей вмещает одно окно',
    en: 'The number is how many guests one window seats',
  },
  slotSample: {
    uz: 'Namunaviy hafta — serverda hech narsa yozilmadi',
    ru: 'Демонстрационная неделя — на сервере ничего не записано',
    en: 'Sample week — nothing is written on the server',
  },
  bookRulesHead: { uz: 'Bandlash qoidalari', ru: 'Правила бронирования', en: 'Booking rules' },
  bookRulesSub: {
    uz: "Menejer har bir bandlovni qo'lda ko'rmasligi kerak",
    ru: 'Менеджер не должен смотреть каждую бронь вручную',
    en: 'The manager should not review every booking by hand',
  },
  bookStatsHead: {
    uz: 'Bandlash natijasi',
    ru: 'Результат бронирования',
    en: 'Booking results',
  },

  funnelHead: {
    uz: 'Saytdan buyurtmaga yo’l',
    ru: 'Путь от сайта к заказу',
    en: 'From visit to order',
  },
  funnelSub: {
    uz: "Har qadamda qancha mijoz yo'qolganini ko'rsatadi",
    ru: 'Показывает, сколько гостей теряется на каждом шаге',
    en: 'Shows how many guests fall away at each step',
  },
  funnelWarn: {
    uz: "Eng katta yo'qotish menyudan savatga o'tishda — 74%. Sababi ko'pincha bitta: rasmsiz taom. To'qqiz taomdan to'rttasida rasm yo'q.",
    ru: 'Больше всего теряется между меню и корзиной — 74%. Причина чаще всего одна: блюдо без фото. Из девяти блюд у четырёх фото нет.',
    en: 'The biggest drop is menu to cart — 74%. The cause is usually one thing: dishes without photos. Four of nine have none.',
  },
  sourcesHead: {
    uz: 'Mijoz qayerdan keldi',
    ru: 'Откуда пришёл гость',
    en: 'Where visits come from',
  },
  topPagesHead: {
    uz: "Eng ko'p ochilgan sahifalar",
    ru: 'Самые открываемые страницы',
    en: 'Most opened pages',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

export const WEB_COPY = {
  nothingChanged: {
    uz: "O'zgarish yo'q — hammasi nashr etilgan",
    ru: 'Изменений нет — всё опубликовано',
    en: 'Nothing changed — everything is live',
  },
  publishedNote: {
    uz: "Nashr etildi · 30 soniyada saytda ko'rinadi",
    ru: 'Опубликовано · появится на сайте через 30 секунд',
    en: 'Published · live on the site in 30 seconds',
  },
  fixAllNote: {
    uz: 'taomga rasm kerak · fotosurat yuklash oynasi ochiladi',
    ru: 'блюдам нужно фото · откроется загрузка',
    en: 'dishes need a photo · the upload panel opens',
  },
  slotClosed: {
    uz: 'onlayn bandlash yopildi',
    ru: 'онлайн-бронь закрыта',
    en: 'online booking closed',
  },
  slotOpened: {
    uz: 'onlayn bandlash ochildi',
    ru: 'онлайн-бронь открыта',
    en: 'online booking opened',
  },
  slotSaveFailed: {
    uz: 'Server javob bermadi — oyna o‘zgarmadi',
    ru: 'Сервер не ответил — окно не изменилось',
    en: 'The server did not answer — the window did not change',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

/**
 * The copy card's rows for a live restaurant: what the site document holds,
 * counted against the budget Google and Telegram actually truncate at. The
 * fixture's three rows stay the fixture console's; a real restaurant never
 * reads "Chilonzor, Yunusobod, Sergeli" as its own short description.
 */
export function copyFieldsFrom(copy: {
  headline: string;
  subheadline: string;
  blurb: string;
  about: string;
}): readonly CopyField[] {
  const row = (
    label: Trilingual,
    value: string,
    budget: number,
    height: string,
    hint: Trilingual,
  ): CopyField => ({
    label,
    value:
      value === ''
        ? { uz: "Bo'sh — yozilmagan", ru: 'Пусто — не заполнено', en: 'Empty — not written' }
        : { uz: value, ru: value, en: value },
    count: `${value.length} / ${budget}`,
    height,
    filled: value !== '',
    hint,
  });

  return [
    row(
      { uz: 'Sayt sarlavhasi', ru: 'Заголовок сайта', en: 'Site headline' },
      copy.headline,
      60,
      '42px',
      {
        uz: "Google natijalarida ko'rinadi",
        ru: 'Показывается в результатах Google',
        en: 'Appears in Google results',
      },
    ),
    row(
      { uz: 'Qisqa tavsif', ru: 'Краткое описание', en: 'Short description' },
      copy.blurb,
      160,
      '62px',
      {
        uz: "Telegram va ijtimoiy tarmoqlarda ulashilganda ko'rinadi",
        ru: 'Видно при отправке в Telegram и соцсети',
        en: 'Shown when shared in Telegram and social',
      },
    ),
    row(
      { uz: 'Bosh sahifa osti sarlavhasi', ru: 'Подзаголовок главной', en: 'Home subheadline' },
      copy.subheadline,
      120,
      '42px',
      {
        uz: 'Bosh sahifada sarlavha ostida',
        ru: 'Под заголовком на главной',
        en: 'Under the headline on the home page',
      },
    ),
    row({ uz: 'Biz haqimizda', ru: 'О нас', en: 'About' }, copy.about, 600, '62px', {
      uz: '«Biz haqimizda» sahifasi — /settings/site da tahrirlanadi',
      ru: 'Страница «О нас» — редактируется в /settings/site',
      en: 'The About page — edited under /settings/site',
    }),
  ];
}

/** Weekday keys as `settings.hours` stores them, Monday first like the screen. */
export const HOUR_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const DAY_NAMES: Readonly<Record<(typeof HOUR_KEYS)[number], Trilingual>> = {
  mon: { uz: 'Dushanba', ru: 'Понедельник', en: 'Monday' },
  tue: { uz: 'Seshanba', ru: 'Вторник', en: 'Tuesday' },
  wed: { uz: 'Chorshanba', ru: 'Среда', en: 'Wednesday' },
  thu: { uz: 'Payshanba', ru: 'Четверг', en: 'Thursday' },
  fri: { uz: 'Juma', ru: 'Пятница', en: 'Friday' },
  sat: { uz: 'Shanba', ru: 'Суббота', en: 'Saturday' },
  sun: { uz: 'Yakshanba', ru: 'Воскресенье', en: 'Sunday' },
};

/**
 * The venue's own week, from `branch.settings.hours`.
 *
 * The card drew `OPENING_HOURS` — ten to eleven, seven days, Tuesday marked
 * as today — to every restaurant, including one that closes on Mondays. A
 * day with no pair is a day the venue is shut, which the row says rather
 * than leaving blank; `today` is computed from the reader's clock, not
 * written into the data as the fixture had it.
 */
export function openingHoursFrom(
  hours: Readonly<Record<string, readonly string[]>> | null,
  now: Date,
  closedLabel: string,
): readonly OpeningDay[] {
  // `getDay()` is Sunday-first; the screen and the settings are Monday-first.
  const todayKey = HOUR_KEYS[(now.getDay() + 6) % 7];

  return HOUR_KEYS.map((key) => {
    const pair = hours?.[key];
    const open = Array.isArray(pair) && pair.length === 2 ? `${pair[0]} – ${pair[1]}` : closedLabel;

    return { day: DAY_NAMES[key], hours: open, today: key === todayKey };
  });
}

/**
 * The staff app's shapes and its fixtures.
 *
 * House rule, and this surface leans on it hard: types and fixtures live here,
 * anything that reaches the server lives in a sibling `*-server.ts`. Several
 * screens in this group are client components — the keypad, the zone filter,
 * the approval queue — and they import values from this file. A single
 * `next/headers` import reaching this module would break the build for all of
 * them at once.
 *
 * **Money is integer tiyin.** 1 so'm = 100 tiyin. The design file writes prices
 * as whole so'm (`48000`) because it is a drawing; every figure below goes
 * through `som()`, so nothing in this app ever holds a so'm float. A waiter
 * reading a hundredfold total onto a guest's bill is exactly the bug the
 * convention exists to stop, and the waiter is the person who gets blamed.
 *
 * **What is here is data, not copy.** Dish names, people's names, branch names,
 * batch numbers, times, distances and the currency word are content a
 * restaurant owns and edits; they arrive from the database as `{uz, ru, en}`
 * columns and are seeded here in that shape. Interface text — what the product
 * says, which no restaurant edits — is in `crew-copy.ts`. The line is not
 * tidiness: a catalogue key whose three languages are identical is rejected by
 * `i18n.test.ts` as data wearing a copy key, and "so'm" and "Double beef" are
 * both identical in Uzbek and English.
 *
 * **None of this comes from the server yet.** There is no staff-app API: no
 * approvals endpoint, no calls feed, no per-waiter table list. Every figure
 * below is a fixture drawn from the design file so the screens can be built and
 * reviewed now, and each one is shaped the way the endpoint will answer, so the
 * seam is an import swap rather than a rewrite.
 */

import type { CrewRole } from './guard';

/** The three languages, equal — Uzbek authors, none is a translation host. */
export type Lang = 'uz' | 'ru' | 'en';

/** The `{uz, ru, en}` jsonb column every human-readable name is stored in. */
export type Trilingual = Readonly<Record<Lang, string>>;

/**
 * Read a stored name in the reader's language.
 *
 * Falls back to Uzbek rather than to an empty string. A dish a kitchen only
 * named in Uzbek must still be readable by a waiter working in Russian — a
 * blank line on a table's order is a line nobody can serve.
 */
export function say(value: Trilingual, lang: Lang): string {
  return value[lang] || value.uz;
}

/** 1 UZS = 100 tiyin. Fixtures below are written the way the design writes them. */
const som = (value: number): number => value * 100;

/**
 * The currency word, beside the figure rather than inside it.
 *
 * The design sets money as a number at reading weight with a smaller muted unit
 * next to it, which `Intl.NumberFormat({ style: 'currency' })` cannot express —
 * it returns one run of text. Identical in Uzbek and English, which is precisely
 * why it is data and not a catalogue key.
 */
export const CURRENCY_WORD: Trilingual = { uz: "so'm", ru: 'сум', en: "so'm" };

/** The abbreviation on a figure large enough to be read in millions. */
export const MILLION_WORD: Trilingual = { uz: 'mln', ru: 'млн', en: 'M' };

/** Minutes, on a timer a person glances at rather than reads. */
export const MINUTE_WORD: Trilingual = { uz: 'daq', ru: 'мин', en: 'min' };

/** Days of cover, on a stock chip. */
export const DAY_WORD: Trilingual = { uz: 'kun', ru: 'дн', en: 'd' };

/**
 * Month names, spelled out rather than left to `Intl`.
 *
 * The lock screen prints a date, and `Intl.DateTimeFormat('uz-Latn-UZ')` is not
 * dependable: some runtimes have no Uzbek Latin month names at all and quietly
 * answer in English, which on a screen whose whole job is to be glanced at is a
 * language change nobody notices reporting.
 */
export const MONTHS: readonly Trilingual[] = [
  { uz: 'yanvar', ru: 'января', en: 'January' },
  { uz: 'fevral', ru: 'февраля', en: 'February' },
  { uz: 'mart', ru: 'марта', en: 'March' },
  { uz: 'aprel', ru: 'апреля', en: 'April' },
  { uz: 'may', ru: 'мая', en: 'May' },
  { uz: 'iyun', ru: 'июня', en: 'June' },
  { uz: 'iyul', ru: 'июля', en: 'July' },
  { uz: 'avgust', ru: 'августа', en: 'August' },
  { uz: 'sentyabr', ru: 'сентября', en: 'September' },
  { uz: 'oktyabr', ru: 'октября', en: 'October' },
  { uz: 'noyabr', ru: 'ноября', en: 'November' },
  { uz: 'dekabr', ru: 'декабря', en: 'December' },
];

/** Weekday names, for the same reason as the months above. */
export const WEEKDAYS: readonly Trilingual[] = [
  { uz: 'Yakshanba', ru: 'Воскресенье', en: 'Sunday' },
  { uz: 'Dushanba', ru: 'Понедельник', en: 'Monday' },
  { uz: 'Seshanba', ru: 'Вторник', en: 'Tuesday' },
  { uz: 'Chorshanba', ru: 'Среда', en: 'Wednesday' },
  { uz: 'Payshanba', ru: 'Четверг', en: 'Thursday' },
  { uz: 'Juma', ru: 'Пятница', en: 'Friday' },
  { uz: 'Shanba', ru: 'Суббота', en: 'Saturday' },
];

/* ============================================================
   Who is holding the phone
   ============================================================ */

/*
 * The role vocabulary lives in `crew-guard.ts` and is re-exported here.
 *
 * `middleware.ts` needs it to compare a `/crew/<role>` segment against the
 * session cookie, and it runs on the edge runtime in a bundle of its own —
 * importing it from this module would pull two thousand lines of fixtures into
 * a file that executes on every request in the application. One declaration,
 * two runtimes; the same split `lib/crew-cookie.ts` makes for the cookie names.
 *
 * Every call site still reads `crew-data.ts`, which is where a reader looks for
 * "what is a role here" — nothing below this line moved.
 */
export {
  CREW_ROLE_COOKIE,
  CREW_ROLES,
  crewRoleInPath,
  crewRoleRedirect,
  crewSurfaceFor,
  isCrewRole,
} from './guard';

export type { CrewRole } from './guard';

/**
 * The person the header names.
 *
 * This is session data in production — it arrives with the PIN exchange, the
 * same way the POS shift session carries its user. Until that endpoint exists
 * it is a fixture per role, which is what lets the header be designed at all.
 * A name is a proper noun and is not translated; the line under it is.
 */
export type CrewIdentity = {
  name: string;
  initials: string;
  scope: Trilingual;
};

export const IDENTITY: Readonly<Record<CrewRole, CrewIdentity>> = {
  owner: {
    name: 'Rustam Kamolov',
    initials: 'RK',
    scope: {
      uz: 'Restoran egasi · 5 filial',
      ru: 'Владелец · 5 филиалов',
      en: 'Owner · 5 branches',
    },
  },
  manager: {
    name: 'Aziza Rahimova',
    initials: 'AR',
    scope: {
      uz: 'Smena menejeri · Chilonzor',
      ru: 'Менеджер смены · Чиланзар',
      en: 'Shift manager · Chilonzor',
    },
  },
  storekeeper: {
    name: 'Bekzod Ismoilov',
    initials: 'BI',
    scope: {
      uz: 'Omborchi · Chilonzor',
      ru: 'Кладовщик · Чиланзар',
      en: 'Storekeeper · Chilonzor',
    },
  },
  waiter: {
    name: 'Jasur Toshev',
    initials: 'JT',
    scope: { uz: 'Ofitsiant · 6 stol', ru: 'Официант · 6 столов', en: 'Waiter · 6 tables' },
  },
  courier: {
    name: 'Sanjar Qodirov',
    initials: 'SQ',
    scope: {
      uz: 'Kuryer · Chilonzor · moped',
      ru: 'Курьер · Чиланзар · мопед',
      en: 'Courier · Chilonzor · moped',
    },
  },
};

/* ============================================================
   The dock — four slots, and the role decides what is in them
   ============================================================ */

/**
 * The glyph a dock slot draws.
 *
 * A short union rather than a component reference, so this file stays free of
 * JSX and a client component can import it without pulling a tree of icons into
 * a bundle it does not need.
 */
export type CrewIcon =
  | 'home'
  | 'box'
  | 'grid'
  | 'layers'
  | 'check'
  | 'list'
  | 'hand'
  | 'bell'
  | 'book'
  | 'cash'
  | 'more';

/** The counter a slot may carry. Resolved at render; `undefined` draws none. */
export type CrewBadge = 'approvals' | 'calls' | 'alerts' | 'stock';

export type CrewTab = {
  /** The URL segment. `/crew/waiter/tables`. */
  slug: string;
  label: Trilingual;
  icon: CrewIcon;
  badge?: CrewBadge;
  /**
   * Whether this screen is built. A dock that lands on an empty page is worse
   * than one that says the screen is not here yet — see `panels/not-built.tsx`.
   */
  built: boolean;
};

const MORE_TAB: CrewTab = {
  slug: 'more',
  label: { uz: 'Yana', ru: 'Ещё', en: 'More' },
  icon: 'more',
  built: true,
};

/**
 * Four slots, never five.
 *
 * The design fixes it at four and the reason is the hand, not the taxonomy: the
 * reachable arc of a thumb on a 390px screen holds four targets of 50px with
 * room between them, and a fifth pushes one of them under the joint. Everything
 * that does not fit goes under More, which is why More is a real screen here
 * rather than an overflow menu.
 */
export const DOCK: Readonly<Record<CrewRole, readonly CrewTab[]>> = {
  owner: [
    {
      slug: 'today',
      label: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' },
      icon: 'home',
      built: true,
    },
    {
      slug: 'branches',
      label: { uz: 'Filiallar', ru: 'Филиалы', en: 'Branches' },
      icon: 'layers',
      built: true,
    },
    {
      slug: 'alerts',
      label: { uz: 'Signal', ru: 'Сигналы', en: 'Alerts' },
      icon: 'bell',
      badge: 'alerts',
      built: true,
    },
    MORE_TAB,
  ],
  manager: [
    {
      slug: 'today',
      label: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' },
      icon: 'home',
      built: true,
    },
    {
      slug: 'approvals',
      label: { uz: 'Tasdiq', ru: 'Согласовать', en: 'Approve' },
      icon: 'check',
      badge: 'approvals',
      built: true,
    },
    {
      slug: 'alerts',
      label: { uz: 'Signal', ru: 'Сигналы', en: 'Alerts' },
      icon: 'bell',
      badge: 'alerts',
      built: true,
    },
    MORE_TAB,
  ],
  storekeeper: [
    {
      slug: 'receiving',
      label: { uz: 'Qabul', ru: 'Приёмка', en: 'Receive' },
      icon: 'box',
      built: true,
    },
    {
      slug: 'count',
      label: { uz: 'Sanoq', ru: 'Пересчёт', en: 'Count' },
      icon: 'list',
      built: true,
    },
    {
      slug: 'stock',
      label: { uz: 'Qoldiq', ru: 'Остатки', en: 'Stock' },
      icon: 'layers',
      /*
       * The design puts a 2 here — `badge3 = … role === "warehouse" ? 2 : 0` —
       * and this tab carried no badge at all, so a storekeeper opening the app
       * saw nothing to tell them two lines are about to run out. It is derived
       * rather than written down: `RUNNING_OUT_DAYS` against `STOCK`.
       */
      badge: 'stock',
      built: true,
    },
    MORE_TAB,
  ],
  waiter: [
    {
      slug: 'tables',
      label: { uz: 'Stollarim', ru: 'Мои столы', en: 'My tables' },
      icon: 'grid',
      built: true,
    },
    {
      slug: 'calls',
      label: { uz: 'Chaqiruv', ru: 'Вызовы', en: 'Calls' },
      icon: 'hand',
      badge: 'calls',
      built: true,
    },
    { slug: 'menu', label: { uz: 'Menyu', ru: 'Меню', en: 'Menu' }, icon: 'book', built: true },
    MORE_TAB,
  ],
  courier: [
    {
      slug: 'deliveries',
      label: { uz: 'Yetkazish', ru: 'Доставка', en: 'Deliveries' },
      icon: 'box',
      built: true,
    },
    {
      slug: 'route',
      label: { uz: "Yo'nalish", ru: 'Маршрут', en: 'Route' },
      icon: 'list',
      built: true,
    },
    { slug: 'cash', label: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' }, icon: 'cash', built: true },
    MORE_TAB,
  ],
};

export function tabsFor(role: CrewRole): readonly CrewTab[] {
  return DOCK[role];
}

export function findTab(role: CrewRole, slug: string): CrewTab | undefined {
  return DOCK[role].find((tab) => tab.slug === slug);
}

/* ============================================================
   The lock screen — one push vocabulary per role

   The design's sharpest observation about this app: the notification type
   changes entirely with the role. An owner is asked to approve eight million
   so'm; a waiter is told three plates are going cold on the pass. Same screen,
   nothing in common, and building one generic notification card would have
   flattened both into "you have a new item".
   ============================================================ */

export type PushTone = 'brand' | 'success' | 'warning' | 'danger';

export type PushAction = {
  label: Trilingual;
  /** The tab where this can actually be answered. */
  tab: string;
  primary?: boolean;
};

export type Push = {
  id: string;
  kind: Trilingual;
  tone: PushTone;
  /** A single character, from the design — the icon square is 22px. */
  mark: string;
  title: Trilingual;
  body: Trilingual;
  /** How long ago, as the design writes it. Not a timestamp: a fixture. */
  ago: Trilingual;
  actions?: readonly PushAction[];
};

export const LOCK_PUSHES: Readonly<Record<CrewRole, readonly Push[]>> = {
  owner: [
    {
      id: 'o1',
      kind: { uz: 'Tasdiq kerak', ru: 'Требуется согласование', en: 'Approval needed' },
      tone: 'warning',
      mark: '!',
      title: {
        uz: "Xarajat tasdig'i · 8 400 000 so'm",
        ru: 'Согласование расхода · 8 400 000 сум',
        en: "Expense approval · 8 400 000 so'm",
      },
      body: {
        uz: "Chilonzor · sovutgich ta'miri · Aziza Rahimova yubordi",
        ru: 'Чиланзар · ремонт холодильника · отправила Азиза Рахимова',
        en: 'Chilonzor · fridge repair · sent by Aziza Rahimova',
      },
      ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
      actions: [
        {
          label: { uz: 'Tasdiqlash', ru: 'Согласовать', en: 'Approve' },
          tab: 'today',
          primary: true,
        },
        { label: { uz: "Ko'rish", ru: 'Открыть', en: 'Open' }, tab: 'today' },
      ],
    },
    {
      id: 'o2',
      kind: { uz: 'Kunlik natija', ru: 'Итог дня', en: 'Daily result' },
      tone: 'success',
      mark: '✓',
      title: {
        uz: "Bugun 18 420 000 so'm · reja 104%",
        ru: 'Сегодня 18 420 000 сум · план 104%',
        en: "Today 18 420 000 so'm · 104% of target",
      },
      body: {
        uz: '5 filial · 192 buyurtma · yalpi marja 62.4%',
        ru: '5 филиалов · 192 заказа · валовая маржа 62.4%',
        en: '5 branches · 192 orders · 62.4% gross margin',
      },
      ago: { uz: '14 daq', ru: '14 мин', en: '14 min' },
    },
    {
      id: 'o3',
      kind: { uz: 'Ogohlantirish', ru: 'Предупреждение', en: 'Warning' },
      tone: 'danger',
      mark: '!',
      title: {
        uz: 'Sergeli rejadan 24% orqada',
        ru: 'Сергели отстаёт от плана на 24%',
        en: 'Sergeli is 24% behind target',
      },
      body: {
        uz: 'Uch kun ketma-ket. Menejer bilan gaplashish kerak.',
        ru: 'Третий день подряд. Нужно поговорить с менеджером.',
        en: 'Third day running. Worth a word with the manager.',
      },
      ago: { uz: '1 soat', ru: '1 ч', en: '1 h' },
    },
  ],
  manager: [
    {
      id: 'm1',
      kind: { uz: "Tasdiq so'rovi", ru: 'Запрос согласования', en: 'Approval request' },
      tone: 'brand',
      mark: '%',
      title: {
        uz: "Chegirma 15% · Stol 12 · 284 000 so'm",
        ru: 'Скидка 15% · Стол 12 · 284 000 сум',
        en: "Discount 15% · Table 12 · 284 000 so'm",
      },
      body: {
        uz: "Jasur Toshev so'radi · doimiy mijoz, tug'ilgan kun",
        ru: 'Запросил Жасур Тошев · постоянный гость, день рождения',
        en: 'Requested by Jasur Toshev · regular guest, birthday',
      },
      ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
      actions: [
        {
          label: { uz: 'Tasdiqlash', ru: 'Согласовать', en: 'Approve' },
          tab: 'approvals',
          primary: true,
        },
        { label: { uz: 'Rad etish', ru: 'Отклонить', en: 'Decline' }, tab: 'approvals' },
      ],
    },
    {
      id: 'm2',
      kind: { uz: 'Kassa', ru: 'Касса', en: 'Till' },
      tone: 'danger',
      mark: '!',
      title: {
        uz: "Kassa farqi 32 000 so'm",
        ru: 'Расхождение кассы 32 000 сум',
        en: "Cash variance 32 000 so'm",
      },
      body: {
        uz: 'Kechki smena · Nilufar S. · sabab yozilmagan',
        ru: 'Вечерняя смена · Нилуфар С. · причина не указана',
        en: 'Evening shift · Nilufar S. · no reason given',
      },
      ago: { uz: '14 daq', ru: '14 мин', en: '14 min' },
      actions: [
        { label: { uz: "Ko'rish", ru: 'Открыть', en: 'Open' }, tab: 'alerts', primary: true },
      ],
    },
    {
      id: 'm3',
      kind: { uz: 'Ombor', ru: 'Склад', en: 'Stock' },
      tone: 'warning',
      mark: '!',
      title: {
        uz: "Mol go'shti 1.3 kunga yetadi",
        ru: 'Говядины хватит на 1.3 дня',
        en: 'Beef: 1.3 days of cover',
      },
      body: {
        uz: '12 kg qoldi · yetkazib beruvchiga buyurtma berilmagan',
        ru: 'Осталось 12 кг · заказ поставщику не оформлен',
        en: '12 kg left · no purchase order raised',
      },
      ago: { uz: '1 soat', ru: '1 ч', en: '1 h' },
    },
  ],
  storekeeper: [
    {
      id: 's1',
      kind: { uz: 'Yetkazish', ru: 'Поставка', en: 'Delivery' },
      tone: 'brand',
      mark: '↓',
      title: {
        uz: 'Toshkent Non yetib keldi',
        ru: 'Toshkent Non прибыл',
        en: 'Toshkent Non has arrived',
      },
      body: {
        /* The word in front of the number is the design's, and it is doing
           work: `#4471` alone reads as an order number on a lock screen full
           of order numbers, and this is a supplier's delivery note. */
        uz: 'Hujjat #4471 · 3 pozitsiya · haydovchi kutmoqda',
        ru: 'Документ #4471 · 3 позиции · водитель ждёт',
        en: 'Document #4471 · 3 lines · the driver is waiting',
      },
      ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
      actions: [
        {
          label: { uz: 'Qabulni boshlash', ru: 'Начать приёмку', en: 'Start receiving' },
          tab: 'receiving',
          primary: true,
        },
      ],
    },
    {
      id: 's2',
      kind: { uz: 'Muddat', ru: 'Сроки', en: 'Expiry' },
      tone: 'warning',
      mark: '!',
      title: {
        uz: 'Mozzarella 2 kundan keyin tugaydi',
        ru: 'Моцарелла истекает через 2 дня',
        en: 'Mozzarella expires in 2 days',
      },
      body: {
        uz: '7 kg · partiya #B-2214 · birinchi navbatda ishlatilsin',
        ru: '7 кг · партия #B-2214 · использовать первой',
        en: '7 kg · batch #B-2214 · use it first',
      },
      ago: { uz: '14 daq', ru: '14 мин', en: '14 min' },
    },
  ],
  waiter: [
    {
      id: 'w1',
      kind: { uz: 'Taom tayyor', ru: 'Блюдо готово', en: 'Dish ready' },
      tone: 'success',
      mark: '✓',
      title: {
        uz: 'Stol 14 · 3 pozitsiya tayyor',
        ru: 'Стол 14 · готово 3 позиции',
        en: 'Table 14 · 3 items ready',
      },
      body: {
        uz: 'Issiq stolda kutmoqda · 40 soniya',
        ru: 'Ждёт на раздаче · 40 секунд',
        en: 'Waiting on the pass · 40 seconds',
      },
      ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
      actions: [
        { label: { uz: 'Oldim', ru: 'Забрал', en: 'Picked up' }, tab: 'calls', primary: true },
      ],
    },
    {
      id: 'w2',
      kind: { uz: 'Mijoz chaqirdi', ru: 'Гость вызвал', en: 'Guest called' },
      tone: 'warning',
      mark: '●',
      title: {
        uz: 'Stol 7 · chaqiruv tugmasi bosildi',
        ru: 'Стол 7 · нажата кнопка вызова',
        en: 'Table 7 · call button pressed',
      },
      body: {
        uz: '1 daqiqa 15 soniya kutmoqda',
        ru: 'Ожидает 1 мин 15 сек',
        en: 'Waiting 1 min 15 s',
      },
      ago: { uz: '14 daq', ru: '14 мин', en: '14 min' },
    },
    {
      id: 'w3',
      kind: { uz: 'Tasdiqlandi', ru: 'Согласовано', en: 'Approved' },
      tone: 'brand',
      mark: '✓',
      title: {
        uz: 'Chegirma 15% tasdiqlandi',
        ru: 'Скидка 15% согласована',
        en: 'The 15% discount was approved',
      },
      body: {
        uz: 'Aziza Rahimova tasdiqladi · Stol 12',
        ru: 'Согласовала Азиза Рахимова · Стол 12',
        en: 'Approved by Aziza Rahimova · Table 12',
      },
      ago: { uz: '1 soat', ru: '1 ч', en: '1 h' },
    },
  ],
  courier: [
    {
      id: 'c1',
      kind: { uz: 'Yangi buyurtma', ru: 'Новый заказ', en: 'New order' },
      tone: 'brand',
      mark: '→',
      title: {
        uz: 'Chilonzor 24, 3-podyezd, 47-xonadon',
        ru: 'Чиланзар 24, подъезд 3, кв 47',
        en: 'Chilonzor 24, entrance 3, flat 47',
      },
      body: {
        uz: "2.4 km · naqd 148 000 so'm yig'ish kerak",
        ru: '2.4 км · собрать наличными 148 000 сум',
        en: "2.4 km · collect 148 000 so'm in cash",
      },
      ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
      actions: [
        {
          label: { uz: 'Qabul qilish', ru: 'Принять', en: 'Accept' },
          tab: 'deliveries',
          primary: true,
        },
        { label: { uz: "O'tkazish", ru: 'Передать', en: 'Pass' }, tab: 'deliveries' },
      ],
    },
    {
      id: 'c2',
      kind: { uz: 'Kassa', ru: 'Касса', en: 'Till' },
      tone: 'success',
      mark: '✓',
      title: {
        uz: "Naqd qabul qilindi · 148 000 so'm",
        ru: 'Наличные приняты · 148 000 сум',
        en: "Cash accepted · 148 000 so'm",
      },
      body: {
        uz: 'Kassir Nilufar tasdiqladi · hisobingiz nolga tushdi',
        ru: 'Кассир Нилуфар подтвердила · ваш баланс нулевой',
        en: 'Cashier Nilufar confirmed · your balance is clear',
      },
      ago: { uz: '14 daq', ru: '14 мин', en: '14 min' },
    },
  ],
};

/* ============================================================
   Today — owner and manager read the same shape, different scope
   ============================================================ */

export type Kpi = {
  label: Trilingual;
  /** Already formatted where the figure is not money — "14 / 32", "62.4%". */
  value: Trilingual | string;
  delta: Trilingual | string;
  tone: 'up' | 'down' | 'flat';
};

export type LeaderRow = {
  name: string;
  initials: string;
  /** Revenue in tiyin, so the column can be compared and re-totalled. */
  revenue: number;
  note: Trilingual;
};

export type TodayBoard = {
  revenueLabel: Trilingual;
  /** Tiyin. The hero figure. */
  revenue: number;
  delta: string;
  /** VAT is inside this figure — DECISIONS.md. Never added on top at the till. */
  revenueNote: Trilingual;
  /** The design's own sparkline, as a polyline over a 300x74 box. */
  spark: string;
  kpis: readonly Kpi[];
  listLabel: Trilingual;
  list: readonly LeaderRow[];
};

const SPARK = '0,62 27,58 54,52 81,36 108,24 135,30 162,38 189,42 216,31 243,15 270,8 300,19';

export const TODAY: Readonly<Record<'owner' | 'manager', TodayBoard>> = {
  owner: {
    revenueLabel: {
      uz: 'Bugungi tushum · 5 filial',
      ru: 'Выручка за сегодня · 5 филиалов',
      en: 'Revenue today · 5 branches',
    },
    revenue: som(18_420_000),
    delta: '+12.4%',
    revenueNote: {
      uz: 'QQS bilan · 11:24 holatiga',
      ru: 'с НДС · на 11:24',
      en: 'incl. VAT · as of 11:24',
    },
    spark: SPARK,
    /*
     * Six for an owner, four for a manager, and that is the design's own split.
     * An owner is looking at a business — what is tied up in stock, who owes
     * whom — while a manager is looking at a service in progress. Giving both
     * the same four would have left the owner without the two figures they open
     * the app for.
     */
    kpis: [
      {
        label: { uz: 'Tayyor mahsulot', ru: 'Готовый продукт', en: 'Prep stock' },
        value: { uz: '3.46 mln', ru: '3.46 млн', en: '3.46M' },
        delta: { uz: '5 pozitsiya omborda', ru: '5 позиций на складе', en: '5 items in store' },
        tone: 'flat',
      },
      {
        label: { uz: 'Kredit / Debit', ru: 'Кредит / Дебет', en: 'Credit / Debit' },
        value: '8.3 / 12.4',
        delta: { uz: "mln so'm", ru: 'млн сум', en: "M so'm" },
        tone: 'down',
      },
      {
        label: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
        value: '206',
        delta: '+14',
        tone: 'up',
      },
      {
        label: { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Average ticket' },
        value: '96 000',
        delta: '+3.2%',
        tone: 'up',
      },
      {
        label: { uz: 'Yalpi foyda', ru: 'Валовая прибыль', en: 'Gross profit' },
        value: { uz: '11.5 mln', ru: '11.5 млн', en: '11.5M' },
        delta: '62.4%',
        tone: 'flat',
      },
      {
        label: { uz: 'Xarajat', ru: 'Расходы', en: 'Expenses' },
        value: { uz: '4.18 mln', ru: '4.18 млн', en: '4.18M' },
        delta: '+6.1%',
        tone: 'down',
      },
    ],
    listLabel: { uz: 'Filiallar', ru: 'Филиалы', en: 'Branches' },
    list: [
      {
        name: 'Chilonzor',
        initials: 'CH',
        revenue: som(6_240_000),
        note: { uz: '+8.1%', ru: '+8.1%', en: '+8.1%' },
      },
      {
        name: 'Yunusobod',
        initials: 'YU',
        revenue: som(4_910_000),
        note: { uz: '+2.4%', ru: '+2.4%', en: '+2.4%' },
      },
      {
        name: 'Sergeli',
        initials: 'SE',
        revenue: som(3_180_000),
        note: { uz: '−1.9%', ru: '−1.9%', en: '−1.9%' },
      },
      {
        name: "Mirzo Ulug'bek",
        initials: 'MU',
        revenue: som(2_620_000),
        note: { uz: '+5.6%', ru: '+5.6%', en: '+5.6%' },
      },
      {
        name: 'Termiz',
        initials: 'TE',
        revenue: som(1_470_000),
        note: { uz: '+11.2%', ru: '+11.2%', en: '+11.2%' },
      },
    ],
  },
  manager: {
    revenueLabel: {
      uz: 'Bugungi tushum · Chilonzor',
      ru: 'Выручка за сегодня · Чиланзар',
      en: 'Revenue today · Chilonzor',
    },
    revenue: som(6_240_000),
    delta: '+8.1%',
    revenueNote: {
      uz: 'QQS bilan · 11:24 holatiga',
      ru: 'с НДС · на 11:24',
      en: 'incl. VAT · as of 11:24',
    },
    spark: SPARK,
    kpis: [
      {
        label: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
        value: '68',
        delta: '+9',
        tone: 'up',
      },
      {
        label: { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Average ticket' },
        value: '91 800',
        delta: '+2.4%',
        tone: 'up',
      },
      {
        label: { uz: 'Stollar', ru: 'Столы', en: 'Tables' },
        value: '14 / 32',
        delta: { uz: '44% band', ru: '44% занято', en: '44% seated' },
        tone: 'flat',
      },
      {
        label: { uz: "O'rtacha kutish", ru: 'Среднее ожидание', en: 'Average wait' },
        value: { uz: '12 daq', ru: '12 мин', en: '12 min' },
        delta: '+1.5',
        tone: 'down',
      },
    ],
    listLabel: {
      uz: 'Smenadagi ofitsiantlar',
      ru: 'Официанты на смене',
      en: 'Waiters on shift',
    },
    list: [
      {
        name: 'Jasur Toshev',
        initials: 'JT',
        revenue: som(1_840_000),
        note: { uz: '18 chek', ru: '18 чеков', en: '18 tickets' },
      },
      {
        name: 'Dilshod Nazarov',
        initials: 'DN',
        revenue: som(1_520_000),
        note: { uz: '16 chek', ru: '16 чеков', en: '16 tickets' },
      },
      {
        name: 'Nilufar Saidova',
        initials: 'NS',
        revenue: som(1_310_000),
        note: { uz: '14 chek', ru: '14 чеков', en: '14 tickets' },
      },
      {
        name: 'Kamola Yusupova',
        initials: 'KY',
        revenue: som(1_080_000),
        note: { uz: '12 chek', ru: '12 чеков', en: '12 tickets' },
      },
      {
        name: 'Aziz Rahmonov',
        initials: 'AR',
        revenue: som(860_000),
        note: { uz: '8 chek', ru: '8 чеков', en: '8 tickets' },
      },
    ],
  },
};

/* ============================================================
   Owner — the branch list
   ============================================================ */

export type BranchRow = {
  id: string;
  /** A branch is named after a district. A proper noun is not translated. */
  name: string;
  city: string;
  /** Tiyin. */
  revenue: number;
  /** Tiyin. The day's target, which the bar is drawn against. */
  target: number;
  delta: string;
  up: boolean;
  orders: number;
  margin: string;
  staff: number;
};

export const BRANCHES: readonly BranchRow[] = [
  {
    id: 'chilonzor',
    name: 'Chilonzor',
    city: 'Toshkent',
    revenue: som(6_240_000),
    target: som(6_800_000),
    delta: '+8.1%',
    up: true,
    orders: 68,
    margin: '62.4%',
    staff: 14,
  },
  {
    id: 'yunusobod',
    name: 'Yunusobod',
    city: 'Toshkent',
    revenue: som(4_910_000),
    target: som(5_400_000),
    delta: '+2.4%',
    up: true,
    orders: 52,
    margin: '60.1%',
    staff: 11,
  },
  {
    id: 'sergeli',
    name: 'Sergeli',
    city: 'Toshkent',
    revenue: som(3_180_000),
    target: som(4_200_000),
    delta: '−1.9%',
    up: false,
    orders: 39,
    margin: '57.8%',
    staff: 9,
  },
  {
    id: 'mirzo-ulugbek',
    name: "Mirzo Ulug'bek",
    city: 'Toshkent',
    revenue: som(2_620_000),
    target: som(2_900_000),
    delta: '+5.6%',
    up: true,
    orders: 28,
    margin: '63.9%',
    staff: 8,
  },
  {
    id: 'termiz',
    name: 'Termiz',
    city: 'Termiz',
    revenue: som(1_470_000),
    target: som(1_400_000),
    delta: '+11.2%',
    up: true,
    orders: 19,
    margin: '65.2%',
    staff: 6,
  },
];

/**
 * Attainment against the day's target, as a whole percent.
 *
 * Derived here rather than stored because the server owns the arithmetic and
 * will send both numbers; a screen that carries its own precomputed percentage
 * is a screen that disagrees with the report by a point and cannot say why.
 * Capped at 100 for the bar only — the label keeps the real figure, because a
 * branch at 105% has earned being told so.
 */
export function attainment(branch: BranchRow): number {
  return Math.round((branch.revenue / branch.target) * 100);
}

/* ============================================================
   Manager — the approval queue
   ============================================================ */

export type ApprovalKind = 'discount' | 'void' | 'refund';

export type Approval = {
  id: string;
  kind: ApprovalKind;
  /** What is being asked for, at headline size. Already a phrase, not money. */
  amount: Trilingual | string;
  requester: string;
  /** Where and how much, under the headline. */
  detail: Trilingual;
  reason: Trilingual;
  ago: Trilingual;
};

export const APPROVALS: readonly Approval[] = [
  {
    id: 'a1',
    kind: 'discount',
    amount: '15%',
    requester: 'Jasur Toshev',
    detail: {
      uz: "Jasur Toshev · Stol 12 · 284 000 so'm",
      ru: 'Жасур Тошев · Стол 12 · 284 000 сум',
      en: "Jasur Toshev · Table 12 · 284 000 so'm",
    },
    reason: {
      uz: "Doimiy mijoz, tug'ilgan kun",
      ru: 'Постоянный клиент, день рождения',
      en: 'Regular guest, birthday',
    },
    ago: { uz: '2 daq', ru: '2 мин', en: '2 min' },
  },
  {
    id: 'a2',
    kind: 'void',
    amount: { uz: '1 × Osh', ru: '1 × Плов', en: '1 × Plov' },
    requester: 'Dilshod Nazarov',
    detail: {
      uz: "Dilshod Nazarov · Stol 7 · 48 000 so'm",
      ru: 'Дилшод Назаров · Стол 7 · 48 000 сум',
      en: "Dilshod Nazarov · Table 7 · 48 000 so'm",
    },
    reason: {
      uz: "Mijoz fikrini o'zgartirdi, taom hali chiqmagan",
      ru: 'Гость передумал, блюдо не подано',
      en: 'Guest changed their mind, dish not yet served',
    },
    ago: { uz: '5 daq', ru: '5 мин', en: '5 min' },
  },
  {
    id: 'a3',
    kind: 'refund',
    amount: '126 000',
    requester: 'Nilufar Saidova',
    detail: {
      uz: 'Kassir Nilufar · Chek #1832 · karta',
      ru: 'Кассир Нилуфар · Чек #1832 · карта',
      en: 'Cashier Nilufar · Receipt #1832 · card',
    },
    reason: {
      uz: 'Taom sovuq berilgan, mijoz shikoyat qildi',
      ru: 'Блюдо подано холодным, жалоба гостя',
      en: 'Dish served cold, guest complained',
    },
    ago: { uz: '11 daq', ru: '11 мин', en: '11 min' },
  },
];

/* ============================================================
   Owner and manager — the alert feed
   ============================================================ */

export type Alert = {
  id: string;
  tone: PushTone | 'quiet';
  title: Trilingual;
  body: Trilingual;
  ago: Trilingual;
};

export const ALERTS: readonly Alert[] = [
  {
    id: 'al1',
    tone: 'danger',
    title: {
      uz: "Kassa farqi 32 000 so'm",
      ru: 'Расхождение кассы 32 000 сум',
      en: "Cash variance 32 000 so'm",
    },
    body: {
      uz: 'Chilonzor · kechki smena · Nilufar S.',
      ru: 'Чиланзар · вечерняя смена · Нилуфар С.',
      en: 'Chilonzor · evening shift · Nilufar S.',
    },
    ago: { uz: '12 daq oldin', ru: '12 мин назад', en: '12 min ago' },
  },
  {
    id: 'al2',
    tone: 'danger',
    title: {
      uz: "Mol go'shti tugamoqda",
      ru: 'Говядина заканчивается',
      en: 'Beef running out',
    },
    body: {
      uz: '12 kg qoldi · 1.3 kunga yetadi',
      ru: 'Осталось 12 кг · хватит на 1.3 дня',
      en: '12 kg left · 1.3 days of cover',
    },
    ago: { uz: '40 daq oldin', ru: '40 мин назад', en: '40 min ago' },
  },
  {
    id: 'al3',
    tone: 'warning',
    title: {
      uz: 'Katta chegirma berildi',
      ru: 'Выдана крупная скидка',
      en: 'Large discount granted',
    },
    body: {
      uz: "Stol 9 · 20% · 340 000 so'm · Aziza R. tasdiqladi",
      ru: 'Стол 9 · 20% · 340 000 сум · согласовала Азиза Р.',
      en: "Table 9 · 20% · 340 000 so'm · approved by Aziza R.",
    },
    ago: { uz: '1 soat oldin', ru: '1 ч назад', en: '1 h ago' },
  },
  {
    id: 'al4',
    tone: 'warning',
    title: {
      uz: 'Sergeli kunlik rejadan orqada',
      ru: 'Сергели отстаёт от плана',
      en: 'Sergeli behind target',
    },
    body: {
      uz: '3.18 mln · reja 4.20 mln · 76%',
      ru: '3.18 млн · план 4.20 млн · 76%',
      en: '3.18M · target 4.20M · 76%',
    },
    ago: { uz: '2 soat oldin', ru: '2 ч назад', en: '2 h ago' },
  },
  {
    id: 'al5',
    tone: 'quiet',
    title: { uz: 'Jadval nashr etildi', ru: 'Расписание опубликовано', en: 'Rota published' },
    body: {
      uz: 'Keyingi hafta · 6 xodimga xabar ketdi',
      ru: 'Следующая неделя · уведомлены 6 сотрудников',
      en: 'Next week · 6 employees notified',
    },
    ago: { uz: 'Kecha', ru: 'Вчера', en: 'Yesterday' },
  },
];

/* ============================================================
   Waiter — my tables, calls, menu
   ============================================================ */

/**
 * The canonical table states, as keys.
 *
 * Stored as the key and translated at render — CLAUDE.md rule 3. An earlier
 * version of this design carried two parallel ladders and they drifted within a
 * week; the words for each key live in `crew-copy.ts` under `TABLE_STATE`, in
 * one place, so the POS and this app cannot start disagreeing about what
 * "occupied" is called.
 */
export type TableState = 'occupied' | 'awaiting-payment' | 'free' | 'reserved';

/** The zones a floor is divided into. `all` is not a zone, it is no filter. */
/**
 * Which room, as a filter key.
 *
 * `'all'` is the only fixed member and the rest is open, because a restaurant
 * names its rooms whatever it likes: the fixtures below use `zal`, `vip` and
 * `kabina` — what is painted on the doors of the venue the design was drawn in
 * — and a live floor answers with hall ids and the hall's own name. A union of
 * three would have compiled beautifully and silently dropped every fourth room.
 * The console's floor screen learned the same thing about halls.
 */
export type ZoneKey = 'all' | (string & {});

export type MyTable = {
  id: string;
  /**
   * The open bill sitting on it, when there is one and the floor is live.
   *
   * Absent on the fixtures and on a free table, and that is the distinction
   * every control on the table detail turns on: *reprint the bill* names an
   * order, not a table, so a screen without this number has nothing to send and
   * has to say so rather than posting the table id and hoping.
   */
  orderId?: number;
  /** The number painted on the table. A label, never arithmetic. */
  number: string;
  /** The room's key: a fixture word, or a hall id from a live floor. */
  zone: string;
  seats: number;
  state: TableState;
  /** Running total in tiyin. Zero on a free or reserved table. */
  total: number;
  /** Minutes since the party sat, or since the table was cleared. */
  minutes: number;
  /** Who booked it, where the table is reserved. Empty otherwise. */
  bookedBy: string;
  bookedAt: string;
};

export const MY_TABLES: readonly MyTable[] = [
  {
    id: 't12',
    number: '12',
    zone: 'zal',
    seats: 4,
    state: 'occupied',
    total: som(284_000),
    minutes: 48,
    bookedBy: '',
    bookedAt: '',
  },
  {
    id: 't7',
    number: '7',
    zone: 'zal',
    seats: 2,
    state: 'occupied',
    total: som(148_000),
    minutes: 22,
    bookedBy: '',
    bookedAt: '',
  },
  {
    id: 't14',
    number: '14',
    zone: 'vip',
    seats: 6,
    state: 'awaiting-payment',
    total: som(612_000),
    minutes: 72,
    bookedBy: '',
    bookedAt: '',
  },
  {
    id: 't3',
    number: '3',
    zone: 'zal',
    seats: 2,
    state: 'free',
    total: 0,
    minutes: 18,
    bookedBy: '',
    bookedAt: '',
  },
  {
    id: 't19',
    number: '19',
    zone: 'vip',
    seats: 4,
    state: 'reserved',
    total: 0,
    minutes: 0,
    bookedBy: 'Alisher K.',
    bookedAt: '19:30',
  },
  {
    id: 't21',
    number: '21',
    zone: 'kabina',
    seats: 3,
    state: 'occupied',
    total: som(96_000),
    minutes: 9,
    bookedBy: '',
    bookedAt: '',
  },
];

export type ZoneChip = { key: ZoneKey; label: Trilingual };

/**
 * The zone filter.
 *
 * "ZAL", "VIP-ZAL" and "KABINA" are what is painted on the doors and what the
 * floor plan calls them, so they read the same in all three languages — which
 * is why they are here and not in the copy catalogue. Only "All" is a word the
 * product chose.
 */
export const ZONES: readonly ZoneChip[] = [
  { key: 'all', label: { uz: 'Hammasi', ru: 'Все', en: 'All' } },
  { key: 'zal', label: { uz: 'ZAL', ru: 'ZAL', en: 'ZAL' } },
  { key: 'vip', label: { uz: 'VIP-ZAL', ru: 'VIP-ZAL', en: 'VIP-ZAL' } },
  { key: 'kabina', label: { uz: 'KABINA', ru: 'KABINA', en: 'KABINA' } },
];

/** How a waiter's own day is going, on the card above the table grid. */
export const WAITER_SHIFT = {
  label: {
    uz: 'Bugungi sotuvim · smena 12:00–22:00',
    ru: 'Мои продажи сегодня · смена 12:00–22:00',
    en: 'My sales today · shift 12:00–22:00',
  } as Trilingual,
  sales: som(1_840_000),
  stats: [
    { value: '18', label: { uz: 'chek', ru: 'чеков', en: 'tickets' } as Trilingual },
    {
      value: '102 000',
      label: { uz: "o'rtacha chek", ru: 'средний чек', en: 'average ticket' } as Trilingual,
    },
    { value: '6', label: { uz: 'stol', ru: 'столов', en: 'tables' } as Trilingual },
  ],
} as const;

/**
 * The state of one line on a table's order.
 *
 * `ready` is the one that earns its own colour: a plate under the heat lamp is
 * losing quality every second, and the whole point of putting this app on a
 * waiter's phone is that the pass can reach them across the room.
 */
export type LineState = 'served' | 'cooking' | 'ready';

export type OrderLine = {
  quantity: number;
  name: Trilingual;
  /** Unit price in tiyin. The row total is quantity × this, computed at render. */
  price: number;
  state: LineState;
};

export const TABLE_LINES: Readonly<Record<string, readonly OrderLine[]>> = {
  t12: [
    {
      quantity: 2,
      name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
      price: som(48_000),
      state: 'served',
    },
    {
      quantity: 1,
      name: { uz: "Achchiq lag'mon", ru: 'Острый лагман', en: 'Spicy lagman' },
      price: som(42_000),
      state: 'cooking',
    },
    {
      quantity: 4,
      name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' },
      price: som(8_000),
      state: 'served',
    },
    {
      quantity: 2,
      name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
      price: som(12_000),
      state: 'served',
    },
  ],
  t7: [
    {
      quantity: 1,
      name: { uz: 'Double beef', ru: 'Double beef', en: 'Double beef' },
      price: som(58_000),
      state: 'cooking',
    },
    {
      quantity: 2,
      name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
      price: som(12_000),
      state: 'served',
    },
  ],
  t14: [
    {
      quantity: 3,
      name: { uz: 'Pepperoni, 30 sm', ru: 'Пепперони 30 см', en: 'Pepperoni 30 cm' },
      price: som(64_000),
      state: 'served',
    },
    {
      quantity: 6,
      name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' },
      price: som(10_000),
      state: 'served',
    },
    {
      quantity: 2,
      name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pcs' },
      price: som(38_000),
      state: 'served',
    },
  ],
  t21: [
    {
      quantity: 2,
      name: { uz: 'Tovuqli lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
      price: som(32_000),
      state: 'ready',
    },
  ],
};

export type CallKind = 'ready' | 'guest' | 'bill';

export type Call = {
  id: string;
  kind: CallKind;
  title: Trilingual;
  body: Trilingual;
  /** How long it has been waiting, mm:ss. The number a guest is counting. */
  waiting: string;
  action: Trilingual;
};

export const CALLS: readonly Call[] = [
  {
    id: 'k1',
    kind: 'ready',
    title: {
      uz: 'Stol 14 · taom tayyor',
      ru: 'Стол 14 · блюдо готово',
      en: 'Table 14 · dish ready',
    },
    body: {
      uz: "2 × Osh, 1 × Achchiq lag'mon · issiq stolda kutmoqda",
      ru: '2 × Плов, 1 × Острый лагман · ждёт на раздаче',
      en: '2 × Plov, 1 × Spicy lagman · waiting on the pass',
    },
    waiting: '0:40',
    action: { uz: 'Oldim', ru: 'Забрал', en: 'Picked up' },
  },
  {
    id: 'k2',
    kind: 'guest',
    title: {
      uz: 'Stol 7 · mijoz chaqirdi',
      ru: 'Стол 7 · гость вызвал',
      en: 'Table 7 · guest called',
    },
    body: {
      uz: 'Mijoz tugmani bosdi',
      ru: 'Гость нажал кнопку вызова',
      en: 'The guest pressed the call button',
    },
    waiting: '1:15',
    action: { uz: 'Bordim', ru: 'Подошёл', en: 'On my way' },
  },
  {
    id: 'k3',
    kind: 'bill',
    title: {
      uz: "Stol 12 · hisob so'raldi",
      ru: 'Стол 12 · просят счёт',
      en: 'Table 12 · bill requested',
    },
    body: {
      uz: "284 000 so'm · karta bilan to'laydi",
      ru: '284 000 сум · оплата картой',
      en: "284 000 so'm · paying by card",
    },
    waiting: '2:30',
    action: { uz: 'Hisobni olib bordim', ru: 'Счёт отнесён', en: 'Bill delivered' },
  },
];

export type MenuRow = {
  id: string;
  name: Trilingual;
  category: Trilingual;
  /** Tiyin. */
  price: number;
  /** On the stop list — 86'd. Dimmed, and not to be offered to a guest. */
  soldOut: boolean;
};

const CAT_UZBEK: Trilingual = { uz: 'Milliy', ru: 'Национальная', en: 'Uzbek' };
const CAT_BURGERS: Trilingual = { uz: 'Burger', ru: 'Бургеры', en: 'Burgers' };
const CAT_PIZZA: Trilingual = { uz: 'Pitsa', ru: 'Пицца', en: 'Pizza' };
const CAT_LAVASH: Trilingual = { uz: 'Lavash', ru: 'Лаваш', en: 'Lavash' };
const CAT_SALADS: Trilingual = { uz: 'Salatlar', ru: 'Салаты', en: 'Salads' };
const CAT_DRINKS: Trilingual = { uz: 'Ichimlik', ru: 'Напитки', en: 'Drinks' };

/**
 * The kitchen's full list — thirteen dishes across six headings.
 *
 * It held eight, roughly one per heading, and both screens that read it were
 * poorer for it in different ways. The waiter's order flow could not sell Manti,
 * Double beef, Pepperoni, Go'shtli lavash or Ayron at all — the design's own
 * `MENUFULL` has all thirteen and its order screen is built on them. The stop
 * list is the other half: a screen whose job is to 86 a dish cannot 86 one it
 * does not list.
 *
 * The design keeps two arrays — an eight-row `MENU` for the tab and a
 * thirteen-row `MENUFULL` for the order flow. One list here, because two copies
 * of what a kitchen sells is the drift this file exists to avoid, and because
 * the shorter one was the reason the order flow was missing five dishes.
 */
export const MENU_ROWS: readonly MenuRow[] = [
  {
    id: 'm1',
    name: { uz: "Osh, to'y oshi", ru: 'Плов свадебный', en: 'Plov, wedding style' },
    category: CAT_UZBEK,
    price: som(48_000),
    soldOut: false,
  },
  {
    id: 'm2',
    name: { uz: "Achchiq lag'mon", ru: 'Острый лагман', en: 'Spicy lagman' },
    category: CAT_UZBEK,
    price: som(42_000),
    soldOut: false,
  },
  {
    id: 'm3',
    name: { uz: 'Manti, 5 dona', ru: 'Манты, 5 шт', en: 'Manti, 5 pcs' },
    category: CAT_UZBEK,
    price: som(38_000),
    soldOut: false,
  },
  {
    id: 'm4',
    name: { uz: 'Chizburger', ru: 'Чизбургер', en: 'Cheeseburger' },
    category: CAT_BURGERS,
    price: som(39_000),
    soldOut: true,
  },
  {
    id: 'm5',
    name: { uz: 'Double beef', ru: 'Double beef', en: 'Double beef' },
    category: CAT_BURGERS,
    price: som(58_000),
    soldOut: false,
  },
  {
    id: 'm6',
    name: { uz: 'Margherita, 30 sm', ru: 'Маргарита 30 см', en: 'Margherita 30 cm' },
    category: CAT_PIZZA,
    price: som(56_000),
    soldOut: false,
  },
  {
    id: 'm7',
    name: { uz: 'Pepperoni, 30 sm', ru: 'Пепперони 30 см', en: 'Pepperoni 30 cm' },
    category: CAT_PIZZA,
    price: som(64_000),
    soldOut: false,
  },
  {
    id: 'm8',
    name: { uz: 'Tovuqli lavash', ru: 'Лаваш с курицей', en: 'Chicken lavash' },
    category: CAT_LAVASH,
    price: som(32_000),
    soldOut: false,
  },
  {
    id: 'm9',
    name: { uz: "Go'shtli lavash", ru: 'Лаваш с мясом', en: 'Beef lavash' },
    category: CAT_LAVASH,
    price: som(36_000),
    soldOut: false,
  },
  {
    id: 'm10',
    name: { uz: 'Sezar salat', ru: 'Салат Цезарь', en: 'Caesar salad' },
    category: CAT_SALADS,
    price: som(34_000),
    soldOut: true,
  },
  {
    id: 'm11',
    name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
    category: CAT_DRINKS,
    price: som(12_000),
    soldOut: false,
  },
  {
    id: 'm12',
    name: { uz: "Ko'k choy", ru: 'Зелёный чай', en: 'Green tea' },
    category: CAT_DRINKS,
    price: som(8_000),
    soldOut: false,
  },
  {
    id: 'm13',
    name: { uz: 'Ayron', ru: 'Айран', en: 'Ayran' },
    category: CAT_DRINKS,
    price: som(10_000),
    soldOut: false,
  },
];

/* ============================================================
   Storekeeper and courier — the fixtures, ahead of the screens

   Their six screens now render these — `panels/store.tsx` and
   `panels/courier.tsx`. The fixtures were written first and deliberately: the
   screens render them rather than re-deciding what a delivery or a drop-off is,
   which is how two incompatible shapes for the same row get invented a
   fortnight apart.
   ============================================================ */

export type Delivery = {
  id: string;
  /** A supplier trades under one name in every language. */
  supplier: string;
  /** Tiyin. */
  amount: number;
  lines: number;
  status: 'en-route' | 'arrived' | 'tomorrow';
  note: Trilingual;
};

export const DELIVERIES: readonly Delivery[] = [
  {
    id: 'v1',
    supplier: "Farg'ona Meat",
    amount: som(2_840_000),
    lines: 7,
    status: 'en-route',
    note: {
      uz: 'Kutilmoqda 14:30 · sovutgichli mashina',
      ru: 'Ожидается 14:30 · рефрижератор',
      en: 'Expected 14:30 · refrigerated van',
    },
  },
  {
    id: 'v2',
    supplier: 'Toshkent Non',
    amount: som(480_000),
    lines: 3,
    status: 'arrived',
    note: {
      uz: 'Hujjat #4471 · haydovchi kutmoqda',
      ru: 'Документ #4471 · водитель ждёт',
      en: 'Document #4471 · the driver is waiting',
    },
  },
  {
    id: 'v3',
    supplier: 'Sabzavot Bozor',
    amount: som(1_190_000),
    lines: 12,
    status: 'tomorrow',
    note: {
      uz: '09:00 · muzlatilmagan mahsulot',
      ru: '09:00 · неохлаждённый товар',
      en: '09:00 · ambient goods',
    },
  },
];

export type StockRow = {
  id: string;
  name: Trilingual;
  /** What is on the shelf, with its unit. A measurement, not a translation. */
  onHand: string;
  /** Days of cover at the current rate. Red under 1.5, amber under 3. */
  days: number;
};

export const STOCK: readonly StockRow[] = [
  {
    id: 'st1',
    name: { uz: "Mol go'shti", ru: 'Говядина', en: 'Beef' },
    onHand: '12 kg',
    days: 1.3,
  },
  {
    id: 'st2',
    name: { uz: 'Mozzarella', ru: 'Моцарелла', en: 'Mozzarella' },
    onHand: '7 kg',
    days: 1.8,
  },
  {
    id: 'st3',
    name: { uz: 'Tovuq filesi', ru: 'Куриное филе', en: 'Chicken fillet' },
    onHand: '19 kg',
    days: 2.4,
  },
  {
    id: 'st4',
    name: { uz: 'Guruch, lazer', ru: 'Рис лазер', en: 'Rice, lazer' },
    onHand: '48 kg',
    days: 6.1,
  },
  {
    /*
     * The drinks line, which had gone missing.
     *
     * The design lists six rows and this build carried five — dropping the one
     * item measured in pieces rather than weight. It is the row that proves the
     * screen sorts by days of cover and not by quantity: ninety-six bottles is
     * the largest number on the page and the second-least urgent thing on it.
     */
    id: 'st5',
    name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
    onHand: '96 dona',
    days: 8.0,
  },
  {
    id: 'st6',
    name: { uz: 'Zaytun moyi', ru: 'Оливковое масло', en: 'Olive oil' },
    onHand: '14 l',
    days: 11.5,
  },
];

/**
 * The card above the receiving list — the design's `mfMini` for a storekeeper.
 *
 * The same hero the waiter's table grid carries, asking the question the role
 * actually opens the app with: how much is arriving today and how much of it is
 * already at the door. Every figure is the sum of `DELIVERIES` — 2 840 000 +
 * 480 000 + 1 190 000, and 7 + 3 + 12 lines — so a delivery added below moves
 * the card rather than leaving it quietly wrong.
 */
export const STORE_TODAY = {
  label: {
    uz: 'Bugun qabul qilinadi · 3 yetkazish',
    ru: 'К приёмке сегодня · 3 поставки',
    en: 'To receive today · 3 deliveries',
  } as Trilingual,
  value: som(4_510_000),
  stats: [
    { value: '22', label: { uz: 'pozitsiya', ru: 'позиций', en: 'lines' } as Trilingual },
    { value: '1', label: { uz: 'yetib keldi', ru: 'прибыл', en: 'arrived' } as Trilingual },
    { value: '2', label: { uz: 'kam qoldiq', ru: 'мало остатка', en: 'low stock' } as Trilingual },
  ],
} as const;

/**
 * What a barcode reader hands back, one press at a time.
 *
 * The design's `SCANPOOL`: four real EAN-13 codes and the goods behind them,
 * cycled by the demo button because a web page has no camera permission to ask
 * for and no decoder behind it. The codes are not decoration — a storekeeper
 * checks the digits against the box in their other hand, and a made-up
 * thirteen-digit number is one that fails a checksum the first time anybody
 * scans it for real.
 *
 * The lookup behind it is real: `GET /api/v1/inventory/items?barcode=` answers
 * a list for any code, registered or not, and the scan screen asks it for every
 * code it reads — so a line shows the restaurant's own ingredient rather than
 * this file's label whenever the barcode is one the store has registered.
 *
 * **The reader exists now, on the phone.** This used to record that it did not,
 * and the reasoning was about a browser: `BarcodeDetector` is absent from most
 * of the handsets a restaurant buys, and the fallback is a WASM decoder — a
 * dependency and a licence decision rather than a route. None of that applies
 * to the native build. `expo-camera` ships in the binary and `CameraView`
 * decodes EAN-13 and EAN-8 on both platforms, so
 * `apps/mobile/src/crew/panels/scan.tsx` points a camera at a box, asks this
 * endpoint what the digits mean and records a count against the answer.
 *
 * These four rows stay as the *web* build's stand-in, where the decoder problem
 * is still real, and as the sample a reviewer reads the screen against.
 */
export type ScannedLine = {
  name: Trilingual;
  /** EAN-13, as printed. A code, never arithmetic. */
  code: string;
  /** What one scan books in, with its unit. */
  quantity: Trilingual;
};

export const SCAN_POOL: readonly ScannedLine[] = [
  {
    name: {
      uz: "Mol go'shti, muzlatilgan",
      ru: 'Говядина замороженная',
      en: 'Beef, frozen',
    },
    code: '4780123001927',
    quantity: { uz: '5 kg', ru: '5 кг', en: '5 kg' },
  },
  {
    name: { uz: 'Mozzarella, blok', ru: 'Моцарелла блок', en: 'Mozzarella, block' },
    code: '4780123004881',
    quantity: { uz: '2 kg', ru: '2 кг', en: '2 kg' },
  },
  {
    name: { uz: 'Kola, 0.5 · 24 dona', ru: 'Кола 0.5 · 24 шт', en: 'Cola 0.5 · 24 pcs' },
    code: '5449000000996',
    quantity: { uz: '1 quti', ru: '1 ящик', en: '1 case' },
  },
  {
    name: {
      uz: 'Zaytun moyi, 5 l',
      ru: 'Оливковое масло 5 л',
      en: 'Olive oil, 5 l',
    },
    code: '8001234500017',
    quantity: { uz: '1 dona', ru: '1 шт', en: '1 pc' },
  },
];

/** What the storekeeper counts, with the system quantity deliberately absent. */
export const COUNT_ITEMS: readonly { id: string; name: Trilingual; unit: Trilingual }[] = [
  {
    id: 'c1',
    name: { uz: "Mol go'shti", ru: 'Говядина', en: 'Beef' },
    unit: { uz: 'kg', ru: 'кг', en: 'kg' },
  },
  {
    id: 'c2',
    name: { uz: 'Guruch, lazer', ru: 'Рис лазер', en: 'Rice, lazer' },
    unit: { uz: 'kg', ru: 'кг', en: 'kg' },
  },
  {
    id: 'c3',
    name: { uz: 'Sabzi', ru: 'Морковь', en: 'Carrot' },
    unit: { uz: 'kg', ru: 'кг', en: 'kg' },
  },
  {
    id: 'c4',
    name: { uz: 'Piyoz', ru: 'Лук', en: 'Onion' },
    unit: { uz: 'kg', ru: 'кг', en: 'kg' },
  },
  {
    id: 'c5',
    name: { uz: 'Mozzarella', ru: 'Моцарелла', en: 'Mozzarella' },
    unit: { uz: 'kg', ru: 'кг', en: 'kg' },
  },
  {
    id: 'c6',
    name: { uz: 'Kola, 0.5', ru: 'Кола 0.5', en: 'Cola 0.5' },
    unit: { uz: 'dona', ru: 'шт', en: 'pcs' },
  },
];

export type Drop = {
  id: string;
  /** The order number, printed on the bag. */
  number: string;
  address: Trilingual;
  /**
   * Where it came from and when — "Chilonzor filialidan olindi · 09:38".
   *
   * The design draws it under the address on every card, and the type had no
   * field for it, so no card carried it. On a courier with four bags in a box
   * it is the line that says which branch this one came out of and how long it
   * has been in the car.
   */
  from: Trilingual;
  /**
   * What the guest asked for — "do not ring, knock instead", "also asked for a
   * printed receipt".
   *
   * Also missing from the type, and it is the half of a delivery a courier
   * cannot work out from an address. The design gives it its own line at the
   * foot of the card.
   */
  note: Trilingual;
  /** Tiyin. */
  total: number;
  /** Whether the courier is carrying this money or the guest already paid. */
  collectCash: boolean;
  distance: string;
  state: 'new' | 'picked' | 'delivered';
};

export const DROPS: readonly Drop[] = [
  {
    id: 'p1',
    number: '#2841',
    address: {
      uz: "Bunyodkor ko'chasi 12, 3-podyezd, 24-xonadon",
      ru: 'Улица Бунёдкор 12, подъезд 3, кв. 24',
      en: 'Bunyodkor street 12, entrance 3, flat 24',
    },
    from: {
      uz: 'Chilonzor filialidan olindi · 09:38',
      ru: 'Забрано из филиала Чиланзар · 09:38',
      en: 'Picked up from Chilonzor · 09:38',
    },
    note: {
      uz: "Mijoz: Nodira A. · +998 90 123 45 67 · qo'ng'iroq qilmang, eshikni taqillating",
      ru: 'Клиент: Нодира А. · +998 90 123 45 67 · не звоните, постучите',
      en: 'Guest: Nodira A. · +998 90 123 45 67 · do not ring, knock instead',
    },
    total: som(186_000),
    collectCash: false,
    distance: '3.2 km',
    state: 'picked',
  },
  {
    id: 'p2',
    number: '#2843',
    address: {
      uz: "Navoiy ko'chasi 44/2, ofis 501",
      ru: 'Улица Навои 44/2, офис 501',
      en: 'Navoiy street 44/2, office 501',
    },
    from: {
      uz: 'Chilonzor filiali · olib ketishga tayyor',
      ru: 'Филиал Чиланзар · готов к выдаче',
      en: 'Chilonzor branch · ready for pickup',
    },
    note: {
      uz: "Mijoz: Sardor T. · qo'shimcha: 1 × chek so'ralgan",
      ru: 'Клиент: Сардор Т. · дополнительно: просят чек',
      en: 'Guest: Sardor T. · also asked for a printed receipt',
    },
    total: som(242_000),
    collectCash: true,
    distance: '5.8 km',
    state: 'new',
  },
  {
    id: 'p3',
    number: '#2839',
    address: {
      uz: 'Chilonzor 19-kvartal, 7-uy',
      ru: 'Чиланзар 19-квартал, дом 7',
      en: 'Chilonzor 19th block, building 7',
    },
    from: { uz: 'Yetkazildi · 09:22', ru: 'Доставлено · 09:22', en: 'Delivered · 09:22' },
    note: {
      uz: 'Mijoz qabul qildi · baho 5',
      ru: 'Клиент принял · оценка 5',
      en: 'Guest accepted · rated 5',
    },
    total: som(94_000),
    collectCash: true,
    distance: '1.9 km',
    state: 'delivered',
  },
];

/**
 * The three figures above a courier's drop list — the design's `mfCoKpis`.
 *
 * "Left" is derived from `DROPS` rather than written down, because it is the
 * only one of the three that a press on this screen changes: marking a drop
 * delivered has to move the counter above it, or the screen is arguing with
 * itself two rows apart.
 */
export const COURIER_TODAY = {
  left: { uz: 'Qolgan', ru: 'Осталось', en: 'Left' } as Trilingual,
  done: { uz: 'Bajarildi', ru: 'Выполнено', en: 'Done' } as Trilingual,
  doneCount: '8',
  distance: { uz: 'Masofa', ru: 'Пробег', en: 'Distance' } as Trilingual,
  distanceValue: '34 km',
} as const;

/** What is left of the round, above the stop list. The design's route header. */
export const ROUTE_SUMMARY = {
  distance: '12.8 km',
  minutes: { uz: '38 daq', ru: '38 мин', en: '38 min' } as Trilingual,
} as const;

/** What a courier is carrying, which is the till's money until it is handed in. */
export const COURIER_CASH = {
  onHand: som(148_000),
  rows: [
    {
      number: '#2839',
      where: {
        uz: 'Chilonzor 19-kvartal',
        ru: 'Чиланзар 19-квартал',
        en: 'Chilonzor 19th block',
      } as Trilingual,
      amount: som(94_000),
    },
    {
      number: '#2836',
      where: {
        uz: "Qatortol ko'chasi 8",
        ru: 'Улица Каторол 8',
        en: 'Qatortol street 8',
      } as Trilingual,
      amount: som(54_000),
    },
  ],
} as const;

export type RouteStop = {
  id: string;
  name: Trilingual;
  kind: Trilingual;
  eta: string;
  distance: string;
  next: boolean;
};

export const ROUTE_STOPS: readonly RouteStop[] = [
  {
    id: 'r1',
    name: { uz: "Bunyodkor ko'chasi 12", ru: 'Улица Бунёдкор 12', en: 'Bunyodkor street 12' },
    kind: { uz: 'Yetkazish · #2841', ru: 'Доставка · #2841', en: 'Drop-off · #2841' },
    eta: '09:52',
    distance: '3.2 km',
    next: true,
  },
  {
    id: 'r2',
    name: { uz: 'Chilonzor filiali', ru: 'Филиал Чиланзар', en: 'Chilonzor branch' },
    kind: { uz: 'Olib ketish · #2843', ru: 'Забрать · #2843', en: 'Pickup · #2843' },
    eta: '10:01',
    distance: '2.4 km',
    next: false,
  },
  {
    id: 'r3',
    name: { uz: "Navoiy ko'chasi 44/2", ru: 'Улица Навои 44/2', en: 'Navoiy street 44/2' },
    kind: { uz: 'Yetkazish · #2843', ru: 'Доставка · #2843', en: 'Drop-off · #2843' },
    eta: '10:14',
    distance: '3.6 km',
    next: false,
  },
  {
    id: 'r4',
    name: { uz: 'Chilonzor filiali', ru: 'Филиал Чиланзар', en: 'Chilonzor branch' },
    kind: {
      uz: 'Qaytish · naqd topshirish',
      ru: 'Возврат · сдать наличные',
      en: 'Return · hand in cash',
    },
    eta: '10:28',
    distance: '3.6 km',
    next: false,
  },
];

/* ============================================================
   More — the honest index of everything else
   ============================================================ */

export type MoreRow = {
  id: string;
  label: Trilingual;
  note: Trilingual;
  /**
   * Where it goes, when it goes anywhere. A row with no href and `built:
   * false` renders as a named, dimmed row rather than a link into nothing —
   * a menu of dead links teaches a reader to stop trusting the menu.
   */
  href?: string;
  built: boolean;
  /**
   * Work that belongs on a desktop and is not coming to a phone. Not "not yet
   * built" — a different thing, and saying so stops someone filing it as a gap.
   */
  desktopOnly?: boolean;
};

const QUEUE_ROW: MoreRow = {
  id: 'queue',
  label: { uz: 'Yuborilmagan amallar', ru: 'Неотправленные действия', en: 'Pending actions' },
  note: {
    uz: 'Oflayn rejimda navbatga yozilganlar',
    ru: 'Записанные в офлайн-режиме',
    en: 'Recorded while offline',
  },
  /*
   * Templated per role, like the lock screen: the queue belongs to the person
   * and their role decides where "back" goes.
   */
  href: '/crew/{role}/queue',
  built: true,
};

const LOCK_ROW: MoreRow = {
  id: 'lock',
  label: { uz: 'Qulflash', ru: 'Заблокировать', en: 'Lock' },
  /*
   * The design's own sentence — `Xodimlar ilovasi.dc.html`, the lock row.
   *
   * It had been rewritten to "close it without putting the phone down", which
   * describes the gesture rather than the destination. What a person needs to
   * know before pressing it is where they end up, and they end up at the PIN
   * screen: the phone stays enrolled, the person signs back in with four
   * digits. That is what the design says and it is the more useful half.
   */
  note: {
    uz: 'PIN ekraniga qaytish',
    ru: 'Вернуться к экрану PIN',
    en: 'Back to the PIN screen',
  },
  /*
   * Templated rather than relative. The lock screen deliberately lives outside
   * the role's own subtree — everything under `/crew/<role>/` is wrapped by the
   * app chrome, and a lock screen with a dock across it is not locked.
   */
  href: '/crew/lock/{role}',
  built: true,
};

/**
 * The design's third tail row, under the name the design gives it.
 *
 * `SWITCHITEM` — "Hisobni almashtirish · Bir telefonda bir necha xodim
 * ishlaydi". The row existed here as "Smenani yopish · End the session", which
 * describes what the code does rather than why anybody would press it: on a
 * handset passed between a waiter and a runner, ending a session is not the
 * point, handing the phone over is. The design's own words say that, and the
 * clause about open orders stays because it answers the fear that stops people
 * pressing it — a waiter will not sign out mid-service if they think their
 * tables go with them.
 *
 * The design opens a sheet listing who else is on this phone; this goes to the
 * PIN screen, which is the same act with one fewer step — the next person types
 * their four digits and the sheet's list is what the keypad already is.
 */
const SWITCH_ROW: MoreRow = {
  id: 'switch',
  label: { uz: 'Hisobni almashtirish', ru: 'Сменить аккаунт', en: 'Switch account' },
  note: {
    uz: 'Bir telefonda bir necha xodim ishlaydi · ochiq buyurtmalar sizda qoladi',
    ru: 'На одном телефоне работают несколько сотрудников · открытые заказы останутся за вами',
    en: 'Several people share one phone · your open orders stay yours',
  },
  href: '/crew',
  built: true,
};

export const MORE: Readonly<Record<CrewRole, readonly MoreRow[]>> = {
  owner: [
    {
      id: 'finance',
      label: { uz: 'Moliya', ru: 'Финансы', en: 'Finance' },
      note: {
        uz: 'Foyda, xarajat, naqd oqim',
        ru: 'Прибыль, расходы, денежный поток',
        en: 'Profit, expenses, cash flow',
      },
      href: '/crew/{role}/more/finance',
      built: true,
    },
    {
      id: 'people',
      label: { uz: 'Odamlar', ru: 'Люди', en: 'People' },
      note: {
        uz: 'Kim ishlayapti, eng yaxshi ofitsiantlar',
        ru: 'Кто работает, лучшие официанты',
        en: 'Who is on, top waiters',
      },
      href: '/crew/{role}/more/people',
      built: true,
    },
    {
      id: 'control',
      label: { uz: 'Nazorat', ru: 'Контроль', en: 'Loss prevention' },
      note: {
        uz: 'Bekor qilish, chegirma, kassa farqi',
        ru: 'Отмены, скидки, расхождения кассы',
        en: 'Voids, discounts, cash variance',
      },
      href: '/crew/{role}/more/control',
      built: true,
    },
    {
      id: 'desktop',
      label: { uz: "To'liq tizim", ru: 'Полная система', en: 'Full system' },
      note: {
        uz: 'Menyu, hisobotlar, sozlamalar — kompyuterda',
        ru: 'Меню, отчёты, настройки — на компьютере',
        en: 'Menu, reports, settings — on desktop',
      },
      built: false,
      desktopOnly: true,
    },
    QUEUE_ROW,
    LOCK_ROW,
    SWITCH_ROW,
  ],
  manager: [
    {
      id: 'closing',
      label: { uz: 'Smenani yopish', ru: 'Закрыть смену', en: 'Close the shift' },
      note: {
        uz: 'Beshta qadam, kassa sanoq va Z-hisobot',
        ru: 'Пять шагов, пересчёт кассы и Z-отчёт',
        en: 'Five steps, cash count and Z report',
      },
      href: '/crew/{role}/more/closing',
      built: true,
    },
    {
      id: 'rota',
      label: { uz: 'Jadval', ru: 'Расписание', en: 'Rota' },
      note: {
        uz: 'Kim keldi, kim kelmadi',
        ru: 'Кто пришёл, кто нет',
        en: 'Who showed up, who did not',
      },
      href: '/crew/{role}/more/rota',
      built: true,
    },
    {
      id: 'kitchen',
      label: { uz: 'Oshxona tezligi', ru: 'Скорость кухни', en: 'Kitchen speed' },
      note: {
        uz: "Bo'limlar bo'yicha o'rtacha vaqt",
        ru: 'Среднее время по цехам',
        en: 'Average time per station',
      },
      href: '/crew/{role}/more/kitchen',
      built: true,
    },
    {
      id: 'desktop',
      label: { uz: "To'liq tizim", ru: 'Полная система', en: 'Full system' },
      note: {
        uz: 'Menyu, ombor, xodimlar — kompyuterda',
        ru: 'Меню, склад, персонал — на компьютере',
        en: 'Menu, stock, staff — on desktop',
      },
      built: false,
      desktopOnly: true,
    },
    QUEUE_ROW,
    LOCK_ROW,
    SWITCH_ROW,
  ],
  storekeeper: [
    {
      id: 'waste',
      label: { uz: 'Chiqindi qayd etish', ru: 'Списание', en: 'Record waste' },
      note: {
        uz: 'Yaroqsiz mahsulot va sababi',
        ru: 'Испорченный товар и причина',
        en: 'Spoiled goods and the reason',
      },
      href: '/crew/{role}/more/waste',
      built: true,
    },
    {
      id: 'expiry',
      label: { uz: 'Muddat nazorati', ru: 'Контроль сроков', en: 'Expiry watch' },
      note: {
        uz: 'Muddati yaqinlashgan partiyalar',
        ru: 'Партии с истекающим сроком',
        en: 'Batches approaching their date',
      },
      href: '/crew/{role}/more/expiry',
      built: true,
    },
    {
      id: 'porder',
      label: { uz: 'Buyurtma berish', ru: 'Заказать у поставщика', en: 'Order from a supplier' },
      note: {
        uz: 'Qoldiqqa qarab avtomatik taklif',
        ru: 'Автоподбор по остаткам',
        en: 'Auto-suggested from stock cover',
      },
      href: '/crew/{role}/more/porder',
      built: true,
    },
    {
      id: 'desktop',
      label: { uz: "To'liq ombor", ru: 'Полный склад', en: 'Full inventory' },
      note: {
        uz: "Texnologik karta, ko'chirish — kompyuterda",
        ru: 'Техкарты, перемещения — на компьютере',
        en: 'Recipe cards, transfers — on desktop',
      },
      built: false,
      desktopOnly: true,
    },
    QUEUE_ROW,
    LOCK_ROW,
    SWITCH_ROW,
  ],
  waiter: [
    {
      id: 'myshift',
      label: { uz: 'Mening smenam', ru: 'Моя смена', en: 'My shift' },
      note: { uz: 'Sotuv, choypuli, soat', ru: 'Продажи, чаевые, часы', en: 'Sales, tips, hours' },
      href: '/crew/{role}/more/myshift',
      built: true,
    },
    {
      id: 'bookings',
      label: { uz: 'Bandlovlarim', ru: 'Мои брони', en: 'My bookings' },
      note: {
        uz: 'Bugun mening stollarimga kim keladi',
        ru: 'Кто придёт за мои столы',
        en: 'Who is coming to my tables',
      },
      href: '/crew/{role}/more/bookings',
      built: true,
    },
    {
      id: 'swap',
      label: { uz: 'Smenani almashtirish', ru: 'Обмен сменами', en: 'Swap a shift' },
      note: {
        uz: 'Hamkasb bilan kelishish',
        ru: 'Договориться с коллегой',
        en: 'Arrange it with a colleague',
      },
      href: '/crew/{role}/more/swap',
      built: true,
    },
    {
      id: 'order',
      label: { uz: 'Buyurtma qabul qilish', ru: 'Принять заказ', en: 'Take an order' },
      note: {
        uz: 'Stol, taomlar, oshxonaga yuborish',
        ru: 'Стол, блюда, отправка на кухню',
        en: 'Table, items, send to the kitchen',
      },
      /*
       * Straight to the floor, not to a picker.
       *
       * Taking an order starts by choosing a table, and the waiter's own table
       * grid is that screen — it is where the order flow's own "Take an order"
       * button lives. A second table list reachable only from this menu would
       * be the same list, kept in step by hand.
       *
       * -------------------------------------------------------------------
       * And it is deliberately not the design's row
       *
       * The drawing calls this "Planshet POS · Buyurtma qabul qilish" and
       * pressing it flashes "this screen works on a separate device": in the
       * design, a waiter's phone cannot take an order and the row exists to say
       * so. This app has the screen — `crew/[role]/table/[table]/order.tsx` —
       * so the row goes there. Restoring the drawing here would mean replacing
       * a working control with a dead one, which is the one thing fidelity to a
       * drawing must not buy.
       */
      href: '/crew/{role}/tables',
      built: true,
    },
    QUEUE_ROW,
    LOCK_ROW,
    SWITCH_ROW,
  ],
  courier: [
    {
      id: 'myday',
      label: { uz: 'Kunlik hisobim', ru: 'Мой день', en: 'My day' },
      note: {
        uz: 'Yetkazishlar, kilometr, daromad',
        ru: 'Доставки, километры, заработок',
        en: 'Deliveries, distance, earnings',
      },
      href: '/crew/{role}/more/myday',
      built: true,
    },
    {
      id: 'handback',
      label: { uz: 'Buyurtmani qaytarish', ru: 'Вернуть заказ', en: 'Hand an order back' },
      note: {
        uz: 'Manzil topilmadi yoki mijoz javob bermadi',
        ru: 'Адрес не найден или клиент не отвечает',
        en: 'Address not found or the guest is unreachable',
      },
      href: '/crew/{role}/more/handback',
      built: true,
    },
    {
      id: 'endshift',
      label: { uz: 'Smenani yopish', ru: 'Закрыть смену', en: 'End the shift' },
      note: {
        uz: "To'rtta shart tekshiriladi",
        ru: 'Проверяются четыре условия',
        en: 'Four conditions are checked',
      },
      href: '/crew/{role}/more/endshift',
      built: true,
    },
    QUEUE_ROW,
    LOCK_ROW,
    SWITCH_ROW,
  ],
};

/* ============================================================
   Counters the dock draws
   ============================================================ */

/**
 * Under this many days of cover, a line is about to run out.
 *
 * The number the storekeeper's badge counts against, and the design's own: two
 * of the six stock rows sit under it, which is the 2 its dock draws.
 */
export const RUNNING_OUT_DAYS = 2;

/**
 * What each badge counts, per role.
 *
 * Derived from the same fixtures the screens render, never written down twice:
 * a dock that says three and a list that shows two is the kind of small lie
 * that makes people stop opening the tab.
 */
export function badgeCount(role: CrewRole, badge: CrewBadge): number {
  if (badge === 'approvals') return APPROVALS.length;
  if (badge === 'calls') return CALLS.length;
  if (badge === 'stock') return STOCK.filter((row) => row.days < RUNNING_OUT_DAYS).length;

  // Alerts are only shown to the two roles whose tabs carry them, and an owner
  // sees the branch-wide feed while a manager sees their own branch's. Until
  // the endpoint splits them, both read the same list.
  return role === 'owner' || role === 'manager' ? ALERTS.length : 0;
}

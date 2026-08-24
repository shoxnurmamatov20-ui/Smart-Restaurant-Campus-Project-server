import type { Lang } from '@/lib/locale';

/**
 * The words the two settings sheets say, in three languages.
 *
 * **Why these are not in `@restaurant/surfaces/mp/copy`.** That catalogue was
 * transcribed from `MyPOS Marketplace - Sayt.dc.html`, and the design draws the
 * profile's six rows without ever opening one: there is no notifications sheet
 * in it and no subscribe button, so there are no keys for either. Everything
 * the design *did* draw is still read from the shared catalogue — `row_plus`,
 * `plusStart`, `plusStop`, `plusMathOn`, `addrOutside` — and only the sentences
 * below are new.
 *
 * They belong in the shared catalogue the moment the web build draws the same
 * two sheets, and moving them there is the whole of that job. Kept here until
 * then rather than added to a file another surface is being rewritten in this
 * week: two catalogues saying the same sentence is exactly the drift
 * `lib/pricing.ts` warns about, and the cheap moment to merge them is when the
 * second caller appears.
 *
 * Uzbek is the platform's own language and reads first, which is also the order
 * `Trilingual` is written in everywhere else.
 */
type Line = Readonly<Record<Lang, string>>;

const say = (line: Line, lang: Lang): string => line[lang];

/* ============================================================
   Notifications
   ============================================================ */

const NOTIFY: Readonly<Record<string, Line>> = {
  lede: {
    uz: 'Qaysi xabarlarni olishni tanlang. Buyurtma holati — eng kerakli xabar.',
    ru: 'Выберите, какие сообщения получать. Статус заказа — самое нужное из них.',
    en: 'Choose which messages to receive. Order status is the one worth keeping.',
  },

  /* The four switches. Each label says what arrives, and the note says when —
     a person deciding whether to keep a channel is deciding about frequency as
     much as about subject. */
  orders: { uz: 'Buyurtma holati', ru: 'Статус заказа', en: 'Order status' },
  ordersNote: {
    uz: 'Qabul qilindi, tayyorlanmoqda, tayyor',
    ru: 'Принят, готовится, готов',
    en: 'Accepted, cooking, ready',
  },
  delivery: { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' },
  deliveryNote: {
    uz: "Kuryer yo'lga chiqdi va eshik oldida",
    ru: 'Курьер выехал и уже у двери',
    en: 'On the way, and at the door',
  },
  promos: { uz: 'Aksiyalar', ru: 'Акции', en: 'Offers' },
  promosNote: {
    uz: 'Chegirmalar va yangi restoranlar — haftasiga bir necha marta',
    ru: 'Скидки и новые рестораны — несколько раз в неделю',
    en: 'Discounts and new restaurants — a few times a week',
  },
  newsletter: { uz: 'Yangiliklar', ru: 'Новости', en: 'Newsletter' },
  newsletterNote: {
    uz: 'Oyiga bir marta, MyPOS haqida',
    ru: 'Раз в месяц, о MyPOS',
    en: 'Once a month, about MyPOS',
  },

  /*
   * The OS's own switch, said where it matters rather than left to be
   * discovered. Four switches that are all on while the phone drops every
   * message is a settings screen that lies, and the guest blames the app for
   * the silence.
   */
  blocked: {
    uz: 'Telefon bu ilovaga bildirishnoma berishni bloklagan. Sozlamalardan ruxsat bering.',
    ru: 'Телефон блокирует уведомления для этого приложения. Разрешите их в настройках.',
    en: 'Your phone is blocking notifications for this app. Allow them in Settings.',
  },
  settings: { uz: 'Sozlamalarni ochish', ru: 'Открыть настройки', en: 'Open Settings' },

  /** The profile row, when the guest has switched every one of them off. */
  allOff: { uz: 'Hammasi o‘chirilgan', ru: 'Все отключены', en: 'All switched off' },

  saved: { uz: 'Saqlandi', ru: 'Сохранено', en: 'Saved' },
  saveFailed: {
    uz: 'Saqlanmadi — qayta urinib ko‘ring',
    ru: 'Не сохранилось — попробуйте ещё раз',
    en: 'Not saved — try again',
  },
  signInFirst: {
    uz: 'Avval telefon raqami bilan kiring',
    ru: 'Сначала войдите по номеру телефона',
    en: 'Sign in with your phone number first',
  },
};

export const notify = (key: keyof typeof NOTIFY | string, lang: Lang): string => {
  const line = NOTIFY[key];

  return line === undefined ? '' : say(line, lang);
};

/* ============================================================
   MyPOS Plus
   ============================================================ */

const PLUS: Readonly<Record<string, Line>> = {
  /*
   * The renewal, said plainly, because the platform cannot do the other thing.
   *
   * A card-on-file mandate — the provider charging month after month without
   * being asked again — is a contract with an acquirer rather than a column
   * here. What exists is one invoice at a time, so the subscription is renewed
   * by the guest each month and this is the sentence that says so. A screen
   * that implied a standing order would produce a guest who believed their
   * delivery was still free in October.
   */
  manual: {
    uz: 'Har oy qo‘lda yangilanadi — avtomatik yechib olinmaydi.',
    ru: 'Продлевается вручную каждый месяц — автосписания нет.',
    en: 'Renewed by hand each month — nothing is charged automatically.',
  },
  /** With the date the current month runs out. `{date}` is filled by the sheet. */
  until: {
    uz: '{date} gacha amal qiladi',
    ru: 'Действует до {date}',
    en: 'Runs until {date}',
  },
  renews: {
    uz: '{date} da yangilash kerak',
    ru: 'Продлить нужно {date}',
    en: 'Renew it on {date}',
  },
  /** Shown after `cancel`, while the paid month is still running. */
  cancelled: {
    uz: 'Bekor qilingan — oy oxirigacha ishlaydi',
    ru: 'Отменена — работает до конца месяца',
    en: 'Cancelled — it runs to the end of the month',
  },
  /**
   * The provider wants the first month paid before the benefit starts.
   *
   * Its own sentence rather than a silent redirect: a guest who taps "start"
   * and finds a bank page has been handed to somebody else, and being told that
   * is going to happen is the difference between finishing and closing the app.
   */
  invoice: {
    uz: 'To‘lov sahifasi ochiladi — to‘langach Plus darhol yoqiladi.',
    ru: 'Откроется страница оплаты — после неё Plus включится сразу.',
    en: 'A payment page opens — Plus starts the moment it is paid.',
  },
  invoiceFailed: {
    uz: 'To‘lov sahifasi ochilmadi. Havolani qayta bosing.',
    ru: 'Страница оплаты не открылась. Нажмите ссылку ещё раз.',
    en: 'The payment page did not open. Tap it again.',
  },
  pay: { uz: 'To‘lovga o‘tish', ru: 'Перейти к оплате', en: 'Go to payment' },
  working: { uz: 'Bajarilmoqda…', ru: 'Выполняется…', en: 'Working…' },
  signInFirst: {
    uz: 'Avval telefon raqami bilan kiring',
    ru: 'Сначала войдите по номеру телефона',
    en: 'Sign in with your phone number first',
  },
};

export const plusWord = (key: keyof typeof PLUS | string, lang: Lang): string => {
  const line = PLUS[key];

  return line === undefined ? '' : say(line, lang);
};

/** `'{date} gacha'` + `12.09.2026`. One placeholder, one call site each. */
export const fillDate = (template: string, date: string): string =>
  template.replace('{date}', date);

/**
 * An ISO stamp as a date somebody reads, in the reader's own timezone.
 *
 * Day-month-year with dots, which is what Uzbekistan writes and what the rest
 * of this app prints. Not `toLocaleDateString`: Hermes ships without full ICU
 * unless the build opts in, so the locale-aware version silently answers
 * American order on Android and would put the eleventh of September where the
 * ninth of November belongs.
 */
export function shortDate(iso: string | null): string | null {
  if (iso === null) return null;

  const at = new Date(iso);

  if (Number.isNaN(at.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}`;
}

/**
 * Complaints — every channel's unhappy guest in one queue.
 *
 * The design file's `cases` module. It is missing from `specs/01-os.md`, which
 * is why this module was missing from the build for so long: the spec lists
 * twenty-two sidebar rows and the design file draws twenty-four, and the
 * handoff's rule — the file wins, the document is a bug — settles which count
 * is real.
 *
 * The screen is a decision desk, not an inbox. Every row carries the four
 * things somebody needs to answer without opening anything else: what the guest
 * said in their own words, what it is worth, the two or three facts that say
 * whose process failed, and — where the amount is small enough — the sentence
 * saying no manager is needed. A complaint queue that makes the answerer go
 * looking is a complaint queue that answers slowly, and lateness is what makes
 * a complaint expensive.
 *
 * Live, through the sibling `cases-server.ts`. The rows below are what the
 * screen draws with no session behind it.
 *
 * This file used to say the seam did not exist, and why: there was a
 * `crm.feedbacks` table but feedback is a rating with a comment — no amount, no
 * channel, no refund decision, no audit of who decided. `crm.cases` is that
 * table (`2026_08_22_180400`), and the shapes below were written as its shape
 * on purpose, so the mapping is a rename rather than a redesign.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** Where the complaint came in. Channel names are companies or places. */
export type CaseChannel = Trilingual;

/**
 * What the guest was unhappy about.
 *
 * Five kinds, and they are the five the causes panel counts. Keeping them a
 * closed set is what makes the panel possible: free-text reasons produce a
 * list nobody can act on, because "late" and "delivery took ages" count as two
 * different problems.
 */
export type CaseKind = 'late' | 'missing' | 'wrong' | 'quality' | 'courier';

/**
 * How a complaint was settled.
 *
 * Four outcomes, and `points` is the one that matters commercially: it costs
 * the loyalty budget rather than the till, and it only works because the guest
 * has to come back to spend it. A queue with only refund and decline pushes
 * every borderline case to one of two extremes.
 */
export type CaseOutcome = 'refunded' | 'partly' | 'points' | 'declined';

/** One fact about the order, shown beside the complaint. */
export type CaseFact = {
  label: Trilingual;
  value: Trilingual;
  /** Colour only where the fact is the problem. Neutral otherwise. */
  tone?: 'danger' | 'warning' | 'success';
};

export type Complaint = {
  id: string;
  /**
   * The row's own id, when there is a row.
   *
   * `id` above is the number a guest is asked to quote on the telephone —
   * `SH-2418` — and is what the card prints. It is not what an endpoint takes.
   * Absent on a fixture, which is exactly what stops the decision buttons
   * posting `SH-2418` at an API that has never heard of it.
   */
  apiId?: number;
  channel: CaseChannel;
  kind: CaseKind;
  /** Name, phone and how many orders they have placed — or that they are anonymous. */
  who: Trilingual;
  /** Tiyin. The amount in dispute, not the order total. */
  amount: number;
  /** What the amount covers: three teas, the whole order. */
  amountNote: Trilingual;
  /** The guest's own words. Never paraphrased — the wording is evidence. */
  quote: Trilingual;
  photos: number;
  /** How long ago, already phrased. Relative time is a render concern. */
  ago: Trilingual;
  facts: readonly CaseFact[];
  /** Settled, or still open. */
  outcome?: CaseOutcome;
  /** Who settled it and when. Present exactly when `outcome` is. */
  settledBy?: string;
};

/**
 * The threshold below which a refund needs nobody's permission, in tiyin.
 *
 * 30 000 so'm. The rule exists because of arithmetic, not generosity: a guest
 * who waits twenty minutes for a manager to approve a 24 000 so'm refund tells
 * a different story afterwards than one refunded in ninety seconds, and the
 * difference in what that story costs is far more than 24 000 so'm.
 */
export const AUTO_REFUND_CEILING = 30_000_00;

/** Above this, the owner decides — on their phone, wherever they are. */
export const OWNER_CEILING = 150_000_00;

/** Whether this one settles itself, by the rule above. */
export const settlesItself = (complaint: Complaint): boolean =>
  complaint.outcome === undefined && complaint.amount <= AUTO_REFUND_CEILING;

/**
 * Half, rounded to the nearest thousand so'm.
 *
 * "Refund half" is offered as a button with the number already on it, because
 * an answerer doing the division themselves is an answerer typing 44 000 when
 * the amount was 88 000 and the guest expected 44 000 exactly.
 */
export const halfOf = (amount: number): number => Math.round(amount / 2 / 1000_00) * 1000_00;

export const CASES: readonly Complaint[] = [
  {
    id: 'SH-2418',
    channel: { uz: 'Sayt', ru: 'Сайт', en: 'Website' },
    kind: 'missing',
    who: {
      uz: 'Nilufar Yusupova · +998 90 123 45 67 · 4-buyurtma',
      ru: 'Нилуфар Юсупова · +998 90 123 45 67 · 4-й заказ',
      en: 'Nilufar Yusupova · +998 90 123 45 67 · 4th order',
    },
    amount: 24_000_00,
    amountNote: { uz: "3 × Ko'k choy", ru: '3 × Зелёный чай', en: '3 × Green tea' },
    quote: {
      uz: 'Uch choy buyurtma qildim, ikkitasi keldi. Kuryer “shunday berildi” dedi.',
      ru: 'Заказала три чая, привезли два. Курьер сказал “так и выдали”.',
      en: 'I ordered three teas and got two. The courier said that is what he was handed.',
    },
    photos: 1,
    ago: { uz: '8 daqiqa oldin', ru: '8 минут назад', en: '8 min ago' },
    facts: [
      {
        label: { uz: "Yig'ish", ru: 'Сборка', en: 'Packed by' },
        value: { uz: 'Jasur T.', ru: 'Жасур Т.', en: 'Jasur T.' },
      },
      {
        label: { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' },
        value: { uz: 'Oybek S.', ru: 'Ойбек С.', en: 'Oybek S.' },
      },
      {
        label: { uz: 'Mijoz tarixi', ru: 'История гостя', en: 'Guest history' },
        value: { uz: 'Birinchi shikoyat', ru: 'Первая жалоба', en: 'First complaint' },
        tone: 'success',
      },
    ],
  },
  {
    id: 'SH-2417',
    channel: { uz: 'Telegram', ru: 'Telegram', en: 'Telegram' },
    kind: 'late',
    who: {
      uz: 'Sardor Aliyev · +998 93 448 12 09 · 11-buyurtma',
      ru: 'Сардор Алиев · +998 93 448 12 09 · 11-й заказ',
      en: 'Sardor Aliyev · +998 93 448 12 09 · 11th order',
    },
    amount: 88_000_00,
    amountNote: { uz: 'Butun buyurtma', ru: 'Весь заказ', en: 'Whole order' },
    quote: {
      uz: "Pitsa sovuq keldi. Buyurtma 52 daqiqada yetkazildi, va'da 30 daqiqa edi.",
      ru: 'Пицца приехала холодной. Заказ доставили за 52 минуты вместо обещанных 30.',
      en: 'The pizza arrived cold. Delivery took 52 minutes against the 30 promised.',
    },
    photos: 0,
    ago: { uz: '26 daqiqa oldin', ru: '26 минут назад', en: '26 min ago' },
    facts: [
      {
        label: { uz: "Va'da", ru: 'Обещано', en: 'Promised' },
        value: { uz: '30 daq', ru: '30 мин', en: '30 min' },
      },
      {
        label: { uz: 'Haqiqiy', ru: 'Фактически', en: 'Actual' },
        value: { uz: '52 daq', ru: '52 мин', en: '52 min' },
        tone: 'danger',
      },
      {
        label: { uz: 'Sabab', ru: 'Причина', en: 'Cause' },
        value: {
          uz: 'Kuryer 3 buyurtma olgan',
          ru: 'Курьер взял 3 заказа',
          en: 'Courier took 3 orders',
        },
        tone: 'warning',
      },
    ],
  },
  {
    id: 'SH-2415',
    channel: { uz: 'Zal · QR', ru: 'Зал · QR', en: 'Dine-in · QR' },
    kind: 'wrong',
    who: {
      uz: 'Stol 14 · mehmon · anonim',
      ru: 'Стол 14 · гость · анонимно',
      en: 'Table 14 · guest · anonymous',
    },
    amount: 42_000_00,
    amountNote: { uz: "1 × Achchiq lag'mon", ru: '1 × Острый лагман', en: '1 × Spicy lagman' },
    quote: {
      uz: 'Achchiq qilmang deb yozdim, achchiq keldi. Bola bilan edik.',
      ru: 'Написала «не острое», принесли острое. Я была с ребёнком.',
      en: 'I wrote no chilli and it came spicy. I was with my child.',
    },
    photos: 0,
    ago: { uz: '1 soat oldin', ru: '1 ч назад', en: '1 h ago' },
    facts: [
      {
        label: { uz: 'Izoh bor edi', ru: 'Комментарий был', en: 'Note was present' },
        value: { uz: 'Ha', ru: 'Да', en: 'Yes' },
        tone: 'danger',
      },
      {
        label: { uz: 'Oshpaz', ru: 'Повар', en: 'Cook' },
        value: { uz: 'Bekzod A.', ru: 'Бекзод А.', en: 'Bekzod A.' },
      },
      {
        label: { uz: 'Mijoz aloqasi', ru: 'Контакт гостя', en: 'Guest contact' },
        value: { uz: "Yo'q — QR anonim", ru: 'Нет — QR анонимно', en: 'None — QR is anonymous' },
        tone: 'warning',
      },
    ],
  },
  {
    id: 'SH-2411',
    channel: { uz: 'Yandex Eats', ru: 'Yandex Eats', en: 'Yandex Eats' },
    kind: 'quality',
    who: {
      uz: 'Kamola Rasulova · +998 91 776 03 22 · 2-buyurtma',
      ru: 'Камола Расулова · +998 91 776 03 22 · 2-й заказ',
      en: 'Kamola Rasulova · +998 91 776 03 22 · 2nd order',
    },
    amount: 96_000_00,
    amountNote: {
      uz: "2 × Osh, to'y oshi",
      ru: '2 × Плов свадебный',
      en: '2 × Plov, wedding style',
    },
    quote: {
      uz: "Go'sht qattiq va quruq edi. Avval yaxshi edi, shu marta boshqacha.",
      ru: 'Мясо было жёстким и сухим. В прошлый раз было хорошо, сейчас иначе.',
      en: 'The meat was tough and dry. It was good last time, different this time.',
    },
    photos: 2,
    ago: { uz: 'Kecha, 21:40', ru: 'Вчера, 21:40', en: 'Yesterday, 21:40' },
    facts: [
      {
        label: { uz: 'Partiya', ru: 'Партия', en: 'Batch' },
        value: { uz: '#B-2214', ru: '#B-2214', en: '#B-2214' },
      },
      {
        label: { uz: 'Shu partiyada', ru: 'По этой партии', en: 'Same batch' },
        value: { uz: '3 shikoyat', ru: '3 жалобы', en: '3 complaints' },
        tone: 'danger',
      },
      {
        label: { uz: 'Yetkazib beruvchi', ru: 'Поставщик', en: 'Supplier' },
        value: { uz: "Farg'ona Meat", ru: 'Fargʻona Meat', en: "Farg'ona Meat" },
      },
    ],
  },
];

/**
 * The four rules that decide who answers.
 *
 * Read as a ladder: money buys speed at the bottom and attention at the top,
 * and the fourth rung is not about money at all. A third complaint from one
 * guest never auto-resolves, because by then the thing to fix is not this
 * order.
 */
export const DECISION_RULES: readonly { n: string; title: Trilingual; body: Trilingual }[] = [
  {
    n: '1',
    title: {
      uz: "30 000 so'mgacha — avtomatik",
      ru: 'До 30 000 сум — автоматически',
      en: "Up to 30 000 so'm — automatic",
    },
    body: {
      uz: "Menejer kutilmaydi. Tasdiq keyin jurnalda ko'rinadi.",
      ru: 'Ожидание менеджера не требуется. Согласование видно в журнале потом.',
      en: 'No waiting for a manager. The approval shows in the log afterwards.',
    },
  },
  {
    n: '2',
    title: {
      uz: '30 000 – 150 000 — menejer',
      ru: '30 000 – 150 000 — менеджер',
      en: '30 000 – 150 000 — manager',
    },
    body: {
      uz: '15 daqiqa ichida javob berilishi kerak, aks holda avtomatik qaytariladi.',
      ru: 'Ответить нужно за 15 минут, иначе возврат произойдёт автоматически.',
      en: 'An answer is due within 15 minutes, otherwise the refund happens automatically.',
    },
  },
  {
    n: '3',
    title: {
      uz: '150 000 dan yuqori — egasi',
      ru: 'Свыше 150 000 — владелец',
      en: 'Above 150 000 — owner',
    },
    body: {
      uz: 'Telefonga bildirishnoma ketadi. Egasi masofadan tasdiqlaydi.',
      ru: 'Уведомление уходит на телефон. Владелец согласует удалённо.',
      en: 'A push goes to the phone. The owner approves remotely.',
    },
  },
  {
    n: '4',
    title: {
      uz: 'Uchinchi shikoyat — doim odam',
      ru: 'Третья жалоба — всегда человек',
      en: 'Third complaint — always a human',
    },
    body: {
      uz: 'Bir mijozdan uchinchi shikoyat avtomatik hal qilinmaydi. Sabab boshqa joyda.',
      ru: 'Третья жалоба от одного гостя не решается автоматически. Причина в другом.',
      en: 'A third complaint from one guest never auto-resolves. The cause lies elsewhere.',
    },
  },
];

/**
 * This month's complaints by cause.
 *
 * The panel exists to make one point, and the note under it says it out loud:
 * the biggest bar is lateness, and lateness here is not the kitchen — it is one
 * courier carrying three orders between seven and eight.
 */
export const CAUSES: readonly { kind: CaseKind; label: Trilingual; count: number; tone: string }[] =
  [
    {
      kind: 'late',
      label: { uz: 'Kechikish', ru: 'Задержка', en: 'Lateness' },
      count: 12,
      tone: 'bg-danger-500',
    },
    {
      kind: 'missing',
      label: { uz: 'Taom kelmadi', ru: 'Не привезли блюдо', en: 'Missing item' },
      count: 8,
      tone: 'bg-warning-500',
    },
    {
      kind: 'wrong',
      label: { uz: "Noto'g'ri taom", ru: 'Не то блюдо', en: 'Wrong item' },
      count: 6,
      tone: 'bg-warning-500',
    },
    {
      kind: 'quality',
      label: { uz: 'Sifat', ru: 'Качество', en: 'Quality' },
      count: 5,
      tone: 'bg-brand-400',
    },
    {
      kind: 'courier',
      label: { uz: 'Kuryer xatti-harakati', ru: 'Поведение курьера', en: 'Courier conduct' },
      count: 3,
      tone: 'bg-n-300',
    },
  ];

/** What the month's complaints cost, in tiyin. Three lines and their sum. */
export const COST: readonly { label: Trilingual; amount: number }[] = [
  {
    label: { uz: 'Qaytarilgan pul', ru: 'Возвращённые деньги', en: 'Money refunded' },
    amount: 1_420_000_00,
  },
  {
    label: { uz: 'Qayta tayyorlangan taom', ru: 'Переготовленные блюда', en: 'Dishes remade' },
    amount: 680_000_00,
  },
  {
    label: { uz: 'Berilgan ball', ru: 'Начисленные баллы', en: 'Points issued' },
    amount: 240_000_00,
  },
];

/** The sum, computed rather than written, so the three lines cannot drift from it. */
export const costTotal = (): number => COST.reduce((sum, line) => sum + line.amount, 0);

/**
 * What the console says after a complaint is settled.
 *
 * Verbatim from `decide()` at `Smart Restaurant OS.dc.html:16934-16937`. Each
 * message names the consequence rather than the click: "refunded" alone leaves
 * a guest wondering when, and "the money returns to Click in 1–3 days" is the
 * sentence the operator repeats on the phone.
 */
export const OUTCOME_FLASH: Readonly<Record<CaseOutcome, Trilingual>> = {
  refunded: {
    uz: "Qaytarildi · pul Click'ga 1–3 kunda qaytadi",
    ru: 'Возвращено · деньги вернутся на Click за 1–3 дня',
    en: 'Refunded · the money returns to Click in 1–3 days',
  },
  partly: {
    uz: 'Yarmi qaytarildi · mijozga sabab bilan xabar yuborildi',
    ru: 'Половина возвращена · гостю отправлено объяснение',
    en: 'Half refunded · the guest has been sent an explanation',
  },
  points: {
    uz: 'Ball berildi · keyingi buyurtmada ishlatiladi',
    ru: 'Баллы начислены · сработают в следующем заказе',
    en: 'Points given · they apply to the next order',
  },
  declined: {
    uz: 'Rad etildi · sabab mijozga yuborildi',
    ru: 'Отклонено · причина отправлена гостю',
    en: 'Declined · the reason has been sent to the guest',
  },
};

/** The word the settled strip carries, and the tint that goes with it. */
export const OUTCOME_LABEL: Readonly<Record<CaseOutcome, Trilingual>> = {
  refunded: { uz: 'Qaytarildi', ru: 'Возвращено', en: 'Refunded' },
  partly: { uz: 'Qismli qaytarildi', ru: 'Частичный возврат', en: 'Partly refunded' },
  points: { uz: 'Ball berildi', ru: 'Начислены баллы', en: 'Points given' },
  declined: { uz: 'Rad etildi', ru: 'Отклонено', en: 'Declined' },
};

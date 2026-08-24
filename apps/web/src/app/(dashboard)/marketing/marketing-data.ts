/**
 * Campaigns, promotions, loyalty and automated messages.
 *
 * Read off `docs/design/source/Smart Restaurant OS.dc.html:2826-3003` (the
 * `atMarketing` view) with its fixtures at `:12894-12977` and its derived
 * values at `:15292-15368`. Four tabs — `mkCamp`, `mkPromo`, `mkLoy`,
 * `mkAuto` — not four stacked sections.
 *
 * An earlier build drew this module as "campaigns · coupons · loyalty ·
 * segments", which is a different screen: the design has no coupon table at
 * all. What it has instead is a **composer** — pick a segment, type the
 * message, and watch the cost and the break-even move as you type — plus a
 * promotions tab that can pause a live offer, and an automation tab with four
 * triggers. Those are the three things a marketer actually does here, and none
 * of them existed.
 *
 * Money is integer tiyin; `som()` multiplies the design's so'm figures on the
 * way in. Copy is the design's own `P("uz","ru","en")` triple, copied rather
 * than translated. `MARKETING_UI` and `MARKETING_COPY` still live here and are
 * owed the move the settings panels have already made — into `console.*` in
 * `src/i18n`, where `i18n.test.ts` checks the three languages carry the same
 * keys. The row content around them stays: a segment's size and a promo's
 * redemption count are figures, not copy.
 *
 * Three of the four tabs are live through the sibling `./marketing-server.ts`;
 * what is below is what the screen draws with no session behind it.
 *
 * This file used to say CRM had no campaign, promotion or trigger table. All
 * three exist now. The loyalty tab is the one that is still fixtures, and for a
 * different reason than the other three ever were: tiers and the points
 * liability are a report over `crm.loyalty_transactions` rather than a table of
 * their own, and that report has no endpoint.
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

const plain = (text: string): Trilingual => ({ uz: text, ru: text, en: text });

/* ============================================================
   1 · Campaigns
   ============================================================ */

export type Segment = {
  id: string;
  name: Trilingual;
  /** How many people are in it. */
  count: number;
};

export const SEGMENTS: readonly Segment[] = [
  { id: 'all', name: { uz: 'Hammasi', ru: 'Все', en: 'Everyone' }, count: 2_148 },
  { id: 'loyal', name: { uz: 'Sodiq', ru: 'Лояльные', en: 'Loyal' }, count: 312 },
  {
    id: 'risk',
    name: { uz: "Yo'qolish xavfida", ru: 'Под риском ухода', en: 'At risk' },
    count: 41,
  },
  { id: 'new', name: { uz: 'Yangi', ru: 'Новые', en: 'New' }, count: 186 },
  { id: 'vip', name: plain('VIP'), count: 24 },
];

export const DEFAULT_SEGMENT = 'loyal';

export type CampaignState = 'sent' | 'sched' | 'draft';

export const CAMPAIGN_STATE: Readonly<
  Record<CampaignState, { label: Trilingual; className: string }>
> = {
  sent: {
    label: { uz: 'Yuborilgan', ru: 'Отправлено', en: 'Sent' },
    className: 'bg-success-50 text-success-700',
  },
  sched: {
    label: { uz: 'Rejalashtirilgan', ru: 'Запланировано', en: 'Scheduled' },
    className: 'bg-brand-50 text-brand-700',
  },
  draft: {
    label: { uz: 'Qoralama', ru: 'Черновик', en: 'Draft' },
    className: 'bg-bg-muted text-fg-muted',
  },
};

export type Campaign = {
  /**
   * The row's own id, when there is a row.
   *
   * Absent on a fixture, which is what stops a control posting at an API that
   * has never heard of it. The same seam `Complaint.apiId` carries on the
   * complaints desk.
   */
  apiId?: number;
  name: Trilingual;
  state: CampaignState;
  segment: Trilingual;
  /** `dd.mm`, or an em dash for a draft that has no send date. */
  date: string;
  recipients: number;
  redeemed: number;
  /** Tiyin. */
  revenue: number;
  /** Tiyin — what the SMS gateway charged. */
  cost: number;
};

export const CAMPAIGNS: readonly Campaign[] = [
  {
    name: {
      uz: 'Payshanba lavash aksiyasi',
      ru: 'Четверговая акция на лаваш',
      en: 'Thursday lavash offer',
    },
    state: 'sent',
    segment: { uz: 'Sodiq', ru: 'Лояльные', en: 'Loyal' },
    date: '06.08',
    recipients: 312,
    redeemed: 47,
    revenue: som(7_896_000),
    cost: som(17_160),
  },
  {
    name: { uz: 'Yangi mavsum menyusi', ru: 'Меню нового сезона', en: 'New season menu' },
    state: 'sent',
    segment: { uz: 'Hammasi', ru: 'Все', en: 'Everyone' },
    date: '01.08',
    recipients: 2_148,
    redeemed: 164,
    revenue: som(27_552_000),
    cost: som(236_280),
  },
  {
    name: {
      uz: 'Qaytib keling — 15% chegirma',
      ru: 'Возвращайтесь — скидка 15%',
      en: 'Come back — 15% off',
    },
    state: 'sent',
    segment: { uz: "Yo'qolish xavfida", ru: 'Под риском', en: 'At risk' },
    date: '28.07',
    recipients: 41,
    redeemed: 9,
    revenue: som(1_512_000),
    cost: som(4_510),
  },
  {
    name: { uz: 'Bayram taklifi', ru: 'Праздничное предложение', en: 'Holiday offer' },
    state: 'sched',
    segment: { uz: 'Hammasi', ru: 'Все', en: 'Everyone' },
    date: '18.08',
    recipients: 2_148,
    redeemed: 0,
    revenue: 0,
    cost: som(236_280),
  },
  {
    name: { uz: 'VIP degustatsiya kechasi', ru: 'VIP-дегустация', en: 'VIP tasting night' },
    state: 'draft',
    segment: plain('VIP'),
    date: '—',
    recipients: 24,
    redeemed: 0,
    revenue: 0,
    cost: som(2_640),
  },
];

/** Tiyin. `mk.monthCost`, `:15361`. */
export const SMS_SPEND_THIS_MONTH = som(494_830);

/* ------------------------------------------------------- the composer sums */

/** Tiyin, per message part. `smsPrice`, `:12907`. */
export const SMS_PRICE = som(55);

/** Tiyin. The average order the break-even is measured against. */
export const AVERAGE_ORDER = som(168_000);

/**
 * What a so'm of revenue leaves after food cost — the design's `0.62`.
 *
 * The break-even is not "how many orders cover the SMS bill" but "how many
 * orders' *margin* covers it", which is a different and larger number. Getting
 * this wrong is how a campaign that lost money looks like one that paid off.
 */
export const CONTRIBUTION = 0.62;

/**
 * How many characters fit in one SMS part.
 *
 * Latin fits GSM-7 at 160; anything Cyrillic drops the whole message to UCS-2
 * at 70. The composer shows which alphabet it detected because switching one
 * word to Cyrillic can more than double the bill.
 */
export const GSM7_PER_PART = 160;
export const UCS2_PER_PART = 70;

export const DEFAULT_MESSAGE: Trilingual = {
  uz: 'Salom! Bugun barcha lavashlarga 20% chegirma. Kechqurun 22:00 gacha.',
  ru: 'Здравствуйте! Сегодня скидка 20% на все лаваши. До 22:00.',
  en: 'Hello. 20% off all lavash today, until 22:00.',
};

/** Message parts for a body of this length, in the alphabet it is written in. */
export function smsParts(text: string): { parts: number; cyrillic: boolean } {
  const cyrillic = /[Ѐ-ӿ]/.test(text);
  const per = cyrillic ? UCS2_PER_PART : GSM7_PER_PART;

  return { parts: Math.max(1, Math.ceil(text.length / per)), cyrillic };
}

/** Tiyin. */
export function smsCost(parts: number, recipients: number): number {
  return parts * recipients * SMS_PRICE;
}

/** Orders needed before the campaign has paid for itself. */
export function breakEven(cost: number): number {
  return Math.ceil(cost / (AVERAGE_ORDER * CONTRIBUTION));
}

/* ============================================================
   2 · Promotions
   ============================================================ */

export type Promotion = {
  /** The row's own id, when there is a row. See `Campaign.apiId`. */
  apiId?: number;
  name: Trilingual;
  rule: Trilingual;
  when: Trilingual;
  where: Trilingual;
  used: number;
  /** Tiyin. */
  revenue: number;
  /** Margin the offer leaves, per cent. */
  margin: number;
  on: boolean;
  accent: string;
  /** Only the offer that is eating full-price sales carries one. */
  warning?: Trilingual;
};

export const PROMOTIONS: readonly Promotion[] = [
  {
    name: {
      uz: 'Biznes-lanch 12:00–15:00',
      ru: 'Бизнес-ланч 12:00–15:00',
      en: 'Business lunch 12:00–15:00',
    },
    rule: {
      uz: "Birinchi taom + asosiy taom + choy — 48 000 so'm",
      ru: 'Первое + основное + чай — 48 000 сум',
      en: "Starter + main + tea — 48 000 so'm",
    },
    when: { uz: 'Dushanba–Juma', ru: 'Пн–Пт', en: 'Mon–Fri' },
    where: { uz: 'Faqat zal', ru: 'Только зал', en: 'Dine-in only' },
    used: 1_284,
    revenue: som(61_632_000),
    margin: 41.2,
    on: true,
    accent: 'var(--brand-500)',
  },
  {
    name: { uz: 'Ikkinchi pitsa 50%', ru: 'Вторая пицца 50%', en: 'Second pizza 50%' },
    rule: {
      uz: "Ikkita pitsa buyurtma qilinganda arzonrog'iga 50% chegirma",
      ru: 'При заказе двух пицц скидка 50% на меньшую',
      en: 'Buy two pizzas, 50% off the cheaper one',
    },
    when: { uz: 'Har kuni 18:00 dan', ru: 'Ежедневно с 18:00', en: 'Daily from 18:00' },
    where: { uz: 'Zal · Olib ketish', ru: 'Зал · Самовывоз', en: 'Dine-in · Takeaway' },
    used: 462,
    revenue: som(18_018_000),
    margin: 22.8,
    on: true,
    accent: 'var(--warning-500)',
    warning: {
      uz: "Marja 22.8% — me'yordan 12 punkt past. Har uchinchi pitsa shu aksiya bilan sotilmoqda, ya'ni to'liq narxdagi savdoni yeb qo'yyapti.",
      ru: 'Маржа 22.8% — на 12 пунктов ниже нормы. Каждая третья пицца продаётся по акции, то есть акция съедает продажи по полной цене.',
      en: 'Margin is 22.8% — twelve points below target. One pizza in three now sells on this offer, which means it is eating full-price sales.',
    },
  },
  {
    name: { uz: "Tug'ilgan kun deserti", ru: 'Десерт в день рождения', en: 'Birthday dessert' },
    rule: {
      uz: "Tug'ilgan kunda bepul desert, hisob 100 000 dan yuqori bo'lsa",
      ru: 'Бесплатный десерт в день рождения при чеке от 100 000',
      en: 'Free dessert on your birthday when the bill is over 100 000',
    },
    when: { uz: 'Doimiy', ru: 'Постоянно', en: 'Always on' },
    where: { uz: 'Faqat zal', ru: 'Только зал', en: 'Dine-in only' },
    used: 38,
    revenue: som(8_664_000),
    margin: 58.4,
    on: true,
    accent: 'var(--accent-500)',
  },
  {
    name: {
      uz: 'Yetkazishda bepul salat',
      ru: 'Бесплатный салат при доставке',
      en: 'Free salad on delivery',
    },
    rule: {
      uz: '150 000 dan yuqori yetkazish buyurtmalariga',
      ru: 'При заказе доставки от 150 000',
      en: 'On delivery orders over 150 000',
    },
    when: { uz: "To'xtatilgan", ru: 'Остановлена', en: 'Paused' },
    where: { uz: 'Faqat yetkazish', ru: 'Только доставка', en: 'Delivery only' },
    used: 96,
    revenue: som(19_584_000),
    margin: 31.6,
    on: false,
    accent: 'var(--n-300)',
  },
];

/* ============================================================
   3 · Loyalty
   ============================================================ */

export type LoyaltyKpi = {
  label: Trilingual;
  /** Already a string where it is not money; `null` means "format the tiyin". */
  value: string | null;
  /** Tiyin, when `value` is null. */
  amount?: number;
  note: Trilingual;
  tone: 'plain' | 'success';
};

export const LOYALTY_KPIS: readonly LoyaltyKpi[] = [
  {
    label: { uz: "Faol a'zolar", ru: 'Активные участники', en: 'Active members' },
    value: '312',
    note: { uz: 'mijozlarning 14.5%', ru: '14.5% клиентов', en: '14.5% of customers' },
    tone: 'plain',
  },
  {
    label: { uz: "A'zo o'rtacha cheki", ru: 'Средний чек участника', en: 'Member average ticket' },
    value: null,
    amount: som(186_000),
    note: {
      uz: "a'zo bo'lmaganidan +28%",
      ru: '+28% к неучастникам',
      en: '+28% vs non-members',
    },
    tone: 'success',
  },
  {
    label: { uz: 'Qaytish chastotasi', ru: 'Частота возврата', en: 'Return frequency' },
    value: '2.4×',
    note: {
      uz: "oyiga · a'zo bo'lmagan 1.3×",
      ru: 'в месяц · неучастники 1.3×',
      en: 'per month · non-members 1.3×',
    },
    tone: 'plain',
  },
  {
    label: { uz: 'Ball ishlatish', ru: 'Использование баллов', en: 'Redemption rate' },
    value: '62%',
    note: { uz: 'berilgan balldan', ru: 'от начисленных', en: 'of points issued' },
    tone: 'plain',
  },
];

export type Tier = {
  name: Trilingual;
  rule: Trilingual;
  members: number;
  /** Tiyin. */
  averageOrder: number;
  dot: string;
};

export const TIERS: readonly Tier[] = [
  {
    name: { uz: 'Kumush · 1%', ru: 'Серебро · 1%', en: 'Silver · 1%' },
    rule: { uz: "Ro'yxatdan o'tganda", ru: 'При регистрации', en: 'On sign-up' },
    members: 194,
    averageOrder: som(142_000),
    dot: 'var(--n-400)',
  },
  {
    name: { uz: 'Oltin · 3%', ru: 'Золото · 3%', en: 'Gold · 3%' },
    rule: {
      uz: "6 oyda 1 500 000 so'mdan yuqori",
      ru: 'Более 1 500 000 сум за 6 месяцев',
      en: "Over 1 500 000 so'm in six months",
    },
    members: 94,
    averageOrder: som(186_000),
    dot: 'var(--rating-star)',
  },
  {
    name: { uz: 'Platina · 5%', ru: 'Платина · 5%', en: 'Platinum · 5%' },
    rule: {
      uz: "6 oyda 4 000 000 so'mdan yuqori",
      ru: 'Более 4 000 000 сум за 6 месяцев',
      en: "Over 4 000 000 so'm in six months",
    },
    members: 24,
    averageOrder: som(264_000),
    dot: 'var(--brand-500)',
  },
];

/** Tiyin. What the restaurant owes its members in unspent points. */
export const POINTS_LIABILITY = {
  total: som(18_640_000),
  issued: som(4_820_000),
  redeemed: som(2_988_000),
  expired: som(412_000),
  note: {
    uz: "312 a'zoda to'plangan ball · o'rtacha 59 700 so'm",
    ru: 'Баллы 312 участников · в среднем 59 700 сум',
    en: "Points held by 312 members · 59 700 so'm on average",
  } satisfies Trilingual,
} as const;

/* ============================================================
   4 · Automated messages
   ============================================================ */

export type Trigger = {
  /** The stable handle the console addresses a row by — `bday`, `back`. */
  id: string;
  /** The row's own id, when there is a row. See `Campaign.apiId`. */
  apiId?: number;
  name: Trilingual;
  rule: Trilingual;
  /** The message itself, drawn in mono on a tinted ground. */
  message: Trilingual;
  audience: number;
  sent: number;
  /** How many of those came in. */
  converted: number;
  on: boolean;
};

export const TRIGGERS: readonly Trigger[] = [
  {
    id: 'bday',
    name: {
      uz: "Tug'ilgan kun tabrigi",
      ru: 'Поздравление с днём рождения',
      en: 'Birthday message',
    },
    rule: {
      uz: "Tug'ilgan kundan 3 kun oldin yuboriladi. Kupon 14 kun amal qiladi.",
      ru: 'Отправляется за 3 дня до дня рождения. Купон действует 14 дней.',
      en: 'Sent three days before the birthday. The coupon is valid for fourteen days.',
    },
    message: {
      uz: "Tug'ilgan kuningiz bilan! Sizni kutamiz — bepul desert sizni kutmoqda.",
      ru: 'С днём рождения! Ждём вас — десерт за счёт заведения.',
      en: 'Happy birthday. We are saving a dessert for you.',
    },
    audience: 186,
    sent: 41,
    converted: 34,
    on: true,
  },
  {
    id: 'back',
    name: { uz: 'Qaytarish xabari', ru: 'Возврат клиента', en: 'Win-back' },
    rule: {
      uz: '60 kun kelmagan mijozga bir marta yuboriladi. Uch oyda takrorlanmaydi.',
      ru: 'Отправляется один раз клиенту, не приходившему 60 дней. Не повторяется три месяца.',
      en: 'Sent once to a customer who has not visited for sixty days. Not repeated for three months.',
    },
    message: {
      uz: "Sizni sog'indik. Keyingi tashrifingizga 15% chegirma.",
      ru: 'Мы соскучились. 15% на следующий визит.',
      en: 'We have missed you. 15% off your next visit.',
    },
    audience: 41,
    sent: 41,
    converted: 22,
    on: true,
  },
  {
    id: 'first',
    name: {
      uz: 'Birinchi tashrifdan keyin',
      ru: 'После первого визита',
      en: 'After the first visit',
    },
    rule: {
      uz: "Birinchi tashrifdan 2 soat keyin. Baho so'raladi, chegirma taklif qilinmaydi.",
      ru: 'Через 2 часа после первого визита. Просим оценку, скидку не предлагаем.',
      en: 'Two hours after the first visit. Asks for a rating; offers no discount.',
    },
    message: {
      uz: 'Tashrifingiz uchun rahmat. Bir daqiqada baho qoldirasizmi?',
      ru: 'Спасибо за визит. Оставите оценку за минуту?',
      en: 'Thank you for visiting. Would you leave a rating?',
    },
    audience: 186,
    sent: 186,
    converted: 71,
    on: true,
  },
  {
    id: 'sleep',
    name: { uz: 'Sodiqlik balli muddati', ru: 'Срок действия баллов', en: 'Points expiring' },
    rule: {
      uz: 'Ballar muddati tugashiga 14 kun qolganda. Faqat 50 000 dan yuqori balli mijozlarga.',
      ru: 'За 14 дней до сгорания баллов. Только клиентам с балансом свыше 50 000.',
      en: 'Fourteen days before points expire. Only for balances over 50 000.',
    },
    message: {
      uz: "Sizda 84 000 so'mlik ball bor, 14 kundan keyin muddati tugaydi.",
      ru: 'У вас 84 000 баллов, они сгорают через 14 дней.',
      en: 'You have 84 000 in points; they expire in fourteen days.',
    },
    audience: 68,
    sent: 0,
    converted: 0,
    on: false,
  },
];

/* ============================================================
   The screen's own chrome
   ============================================================ */

export const MARKETING_UI = {
  tabCampaigns: { uz: 'Kampaniyalar', ru: 'Кампании', en: 'Campaigns' },
  tabPromotions: { uz: 'Aksiyalar', ru: 'Акции', en: 'Promotions' },
  tabLoyalty: { uz: 'Sodiqlik', ru: 'Лояльность', en: 'Loyalty' },
  tabAutomated: { uz: 'Avtomatik', ru: 'Автоматические', en: 'Automated' },

  sentHead: {
    uz: 'Yuborilgan kampaniyalar',
    ru: 'Отправленные кампании',
    en: 'Campaigns sent',
  },
  monthCost: {
    uz: 'Shu oy SMS xarajati:',
    ru: 'Расход на SMS в этом месяце:',
    en: 'SMS spend this month:',
  },
  colName: { uz: 'Kampaniya', ru: 'Кампания', en: 'Campaign' },
  colTo: { uz: 'Qabul qiluvchi', ru: 'Получателей', en: 'Recipients' },
  colUsed: { uz: 'Foydalanildi', ru: 'Использовано', en: 'Redeemed' },
  colRevenue: { uz: 'Tushum', ru: 'Выручка', en: 'Revenue' },
  colCost: { uz: 'SMS xarajati', ru: 'Расход на SMS', en: 'SMS cost' },

  newCampaign: { uz: 'Yangi kampaniya', ru: 'Новая кампания', en: 'New campaign' },
  segment: { uz: 'Segment', ru: 'Сегмент', en: 'Segment' },
  messageText: { uz: 'Xabar matni', ru: 'Текст сообщения', en: 'Message text' },
  placeholder: {
    uz: 'Salom {ism}! Bugun barcha lavashlarga 20% chegirma.',
    ru: 'Здравствуйте, {имя}! Сегодня скидка 20% на все лаваши.',
    en: 'Hello {name}. 20% off all lavash today.',
  },
  estimatedCost: {
    uz: 'Taxminiy xarajat',
    ru: 'Ориентировочная стоимость',
    en: 'Estimated cost',
  },
  breakEven: {
    uz: 'Qoplanishi uchun kerak',
    ru: 'Нужно для окупаемости',
    en: 'Orders needed to break even',
  },
  scheduleSend: {
    uz: 'Yuborishni rejalashtirish',
    ru: 'Запланировать отправку',
    en: 'Schedule send',
  },
  legalNote: {
    uz: 'Xabar 09:00 dan 21:00 gacha yuboriladi. Obunani bekor qilgan mijozlarga yuborilmaydi — bu qonun talabi.',
    ru: 'Сообщения отправляются с 09:00 до 21:00. Отписавшимся клиентам не отправляется — этого требует закон.',
    en: 'Messages go out between 09:00 and 21:00. Customers who opted out are excluded — that is a legal requirement.',
  },
  characters: { uz: 'belgi', ru: 'символов', en: 'characters' },
  latin: {
    uz: 'Lotin · 160 belgi/SMS',
    ru: 'Латиница · 160 символов/SMS',
    en: 'Latin · 160 chars/SMS',
  },
  cyrillic: {
    uz: 'Kirill · 70 belgi/SMS',
    ru: 'Кириллица · 70 символов/SMS',
    en: 'Cyrillic · 70 chars/SMS',
  },
  ordersWord: { uz: 'buyurtma', ru: 'заказов', en: 'orders' },

  marginImpact: { uz: "Marjaga ta'siri", ru: 'Влияние на маржу', en: 'Margin impact' },
  live: { uz: 'Faol', ru: 'Активна', en: 'Live' },
  paused: { uz: "To'xtatilgan", ru: 'Остановлена', en: 'Paused' },
  pause: { uz: "To'xtatish", ru: 'Остановить', en: 'Pause' },
  resume: { uz: 'Yoqish', ru: 'Включить', en: 'Resume' },

  tiers: { uz: 'Darajalar', ru: 'Уровни', en: 'Tiers' },
  members: { uz: "a'zo", ru: 'участн.', en: 'members' },
  averageOrder: { uz: "o'rt. chek", ru: 'средн. чек', en: 'avg ticket' },
  liability: {
    uz: "To'lanmagan ball majburiyati",
    ru: 'Обязательство по неиспользованным баллам',
    en: 'Unredeemed points liability',
  },
  liabilityNote: {
    uz: 'Bu ball emas, qarz. Mijoz ballarini istalgan kunda ishlatishi mumkin, shuning uchun bu summa buxgalteriyada majburiyat sifatida turishi kerak — foyda hisobidan chegiriladi.',
    ru: 'Это не баллы, а долг. Клиент может использовать их в любой день, поэтому сумма должна стоять в бухгалтерии как обязательство и вычитаться из прибыли.',
    en: 'These are not points, they are debt. A customer can spend them any day, so the amount belongs in the books as a liability and comes off profit.',
  },
  issued: { uz: 'Shu oy berilgan', ru: 'Начислено за месяц', en: 'Issued this month' },
  redeemed: { uz: 'Shu oy ishlatilgan', ru: 'Списано за месяц', en: 'Redeemed this month' },
  expired: { uz: "Muddati o'tgan", ru: 'Сгорело', en: 'Expired' },

  audience: { uz: 'Auditoriya', ru: 'Аудитория', en: 'Audience' },
  thisMonth: { uz: 'Shu oy', ru: 'За месяц', en: 'This month' },
  converted: { uz: 'Kelgan', ru: 'Пришли', en: 'Converted' },
} as const satisfies Readonly<Record<string, Trilingual>>;

export const MARKETING_COPY = {
  emptyMessage: {
    uz: "Xabar matni bo'sh",
    ru: 'Текст сообщения пуст',
    en: 'The message is empty',
  },
  scheduled: {
    uz: 'mijozga rejalashtirildi · ertaga 10:00',
    ru: 'клиентам запланировано · завтра в 10:00',
    en: 'recipients scheduled · tomorrow at 10:00',
  },
  promoLive: { uz: 'Aksiya yoqildi', ru: 'Акция включена', en: 'Promotion is live' },
  promoPaused: { uz: "Aksiya to'xtatildi", ru: 'Акция остановлена', en: 'Promotion paused' },
  automationOn: {
    uz: 'Avtomatik xabar yoqildi',
    ru: 'Автосообщение включено',
    en: 'Automation is on',
  },
  automationOff: {
    uz: "Avtomatik xabar o'chirildi",
    ru: 'Автосообщение выключено',
    en: 'Automation is off',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

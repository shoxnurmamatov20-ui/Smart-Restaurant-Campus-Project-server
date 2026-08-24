/**
 * The site-and-PWA panel's explainer blocks, from the design file.
 *
 * `files/Smart Restaurant Sayt va PWA.dc.html` — its `pwaFacts`, `compare` and
 * `limits` arrays. Three blocks the configurator was missing, and the third one
 * is the reason the other two are trustworthy: a page that lists what a PWA can
 * do and never lists what it cannot is a sales page, and this one is shown to
 * the person who has to answer for the decision afterwards.
 */

const uz = {
  pwaFacts: [
    {
      value: '0',
      label: 'Do’kon tekshiruvi',
      note: 'App Store va Google Play chetlab o’tiladi',
    },
    {
      value: '~30 son',
      label: 'Nashr etish',
      note: 'Yangilanish darhol yetadi, yuklab olish kerak emas',
    },
    {
      value: '1',
      label: 'Kodbaza',
      note: '42 restoran bitta shablonda ishlaydi',
    },
    {
      value: '~1.4 MB',
      label: 'O’rnatish hajmi',
      note: 'Native ilova o’rniga · oflayn menyu ichida',
    },
  ],
  compare: [
    {
      label: 'Chiqarish vaqti',
      pwa: '30 soniya',
      native: '2–6 hafta tekshiruv',
    },
    {
      label: 'Yangilanish',
      pwa: 'Darhol, hammaga',
      native: 'Foydalanuvchi yuklab olishi kerak',
    },
    {
      label: '42 restoran',
      pwa: 'Bitta shablon',
      native: '42 listing, 42 tekshiruv',
    },
    {
      label: 'Mijozga to’siq',
      pwa: 'Havola bosish',
      native: 'Do’kondan yuklab olish',
    },
    {
      label: 'Komissiya',
      pwa: 'Yo’q',
      native: 'Do’kon 15–30%',
    },
    {
      label: 'Push bildirishnoma',
      pwa: 'Bor, iOS 16.4+ dan',
      native: 'Bor',
    },
  ],
  limits: [
    {
      head: 'iOS da o’rnatish qo’lda',
      body: 'Safari o’z bannerini ko’rsatmaydi — mijozga «Ulashish → Bosh ekranga qo’shish» ni o’zimiz aytishimiz kerak. Shuning uchun taklif ekranda tushuntirish bilan chiqadi.',
    },
    {
      head: 'Do’konda topilmaydi',
      body: 'Odam App Store’da qidirsa, topmaydi. Trafik QR kod, Telegram, Instagram va chekdan keladi — shuning uchun QR har chekda bo’lishi shart.',
    },
    {
      head: 'Domen restoranga tegishli emas',
      body: 'oshxona.smartrestaurant.uz — bizning domenimiz. Restoran ketsa, manzil qoladi. O’z domenini ulash Enterprise tarifda beriladi.',
    },
    {
      head: 'Oflayn faqat o’qish',
      body: 'Menyu va manzil oflayn ishlaydi, buyurtma esa yo’q — tarmoqsiz buyurtma qabul qilib, keyin «yo’q ekan» deyish mijozni yo’qotadi.',
    },
  ],
};

/** The shape every language fills. */
export type PwaCopy = typeof uz;

const ru: PwaCopy = {
  pwaFacts: [
    {
      value: '0',
      label: 'Проверок в сторах',
      note: 'App Store и Google Play обходим',
    },
    {
      value: '~30 сек',
      label: 'Публикация',
      note: 'Обновление доходит сразу, скачивать не нужно',
    },
    {
      value: '1',
      label: 'Кодовая база',
      note: '42 ресторана работают на одном шаблоне',
    },
    {
      value: '~1.4 MB',
      label: 'Размер установки',
      note: 'Вместо нативного приложения · меню работает офлайн',
    },
  ],
  compare: [
    {
      label: 'Время выпуска',
      pwa: '30 секунд',
      native: '2–6 недель проверки',
    },
    {
      label: 'Обновление',
      pwa: 'Сразу, всем',
      native: 'Пользователь должен скачать',
    },
    {
      label: '42 ресторана',
      pwa: 'Один шаблон',
      native: '42 листинга, 42 проверки',
    },
    {
      label: 'Барьер для гостя',
      pwa: 'Нажать ссылку',
      native: 'Скачать из стора',
    },
    {
      label: 'Комиссия',
      pwa: 'Нет',
      native: 'Стор 15–30%',
    },
    {
      label: 'Push-уведомления',
      pwa: 'Есть, с iOS 16.4',
      native: 'Есть',
    },
  ],
  limits: [
    {
      head: 'Установка на iOS вручную',
      body: 'Safari не показывает свой баннер — нужно самим подсказать «Поделиться → На экран Домой». Поэтому предложение выводится с объяснением.',
    },
    {
      head: 'Не находится в сторе',
      body: 'Если гость ищет в App Store, он не найдёт. Трафик идёт с QR, из Telegram, Instagram и чека — поэтому QR обязателен на каждом чеке.',
    },
    {
      head: 'Домен не принадлежит ресторану',
      body: 'oshxona.smartrestaurant.uz — наш домен. Если ресторан уйдёт, адрес останется. Свой домен — на тарифе Enterprise.',
    },
    {
      head: 'Офлайн только чтение',
      body: 'Меню и адрес работают офлайн, заказ — нет: принять заказ без сети и потом отказать значит потерять гостя.',
    },
  ],
};

const en: PwaCopy = {
  pwaFacts: [
    {
      value: '0',
      label: 'Store reviews',
      note: 'App Store and Google Play are bypassed',
    },
    {
      value: '~30 s',
      label: 'Publish time',
      note: 'Updates arrive at once, with nothing to download',
    },
    {
      value: '1',
      label: 'Codebase',
      note: '42 restaurants run on one template',
    },
    {
      value: '~1.4 MB',
      label: 'Install size',
      note: 'Instead of a native app · the menu works offline',
    },
  ],
  compare: [
    {
      label: 'Time to ship',
      pwa: '30 seconds',
      native: '2–6 weeks of review',
    },
    {
      label: 'Updates',
      pwa: 'Instant, for everyone',
      native: 'The user must download it',
    },
    {
      label: '42 restaurants',
      pwa: 'One template',
      native: '42 listings, 42 reviews',
    },
    {
      label: 'Barrier for the guest',
      pwa: 'Tap a link',
      native: 'Download from a store',
    },
    {
      label: 'Commission',
      pwa: 'None',
      native: 'Store 15–30%',
    },
    {
      label: 'Push notifications',
      pwa: 'Yes, from iOS 16.4',
      native: 'Yes',
    },
  ],
  limits: [
    {
      head: 'iOS install is manual',
      body: 'Safari shows no banner of its own — we have to point to Share → Add to Home Screen. That is why the prompt carries an explanation.',
    },
    {
      head: 'Not found in a store',
      body: 'Search the App Store and it is not there. Traffic comes from the QR code, Telegram, Instagram and the receipt — so the QR belongs on every receipt.',
    },
    {
      head: 'The domain is not the restaurant’s',
      body: 'oshxona.smartrestaurant.uz is our domain. If the restaurant leaves, the address stays with us. A custom domain comes with Enterprise.',
    },
    {
      head: 'Offline is read-only',
      body: 'Menu and address work offline; ordering does not — taking an order with no network and refusing it later loses the guest.',
    },
  ],
};

const COPY = { uz, ru, en } as const;

export function pwaCopy(lang: 'uz' | 'ru' | 'en'): PwaCopy {
  return COPY[lang] ?? uz;
}

/**
 * Names nobody may take — `dc.html:678`.
 *
 * Two kinds in one list, and it matters that they are: `www`, `admin` and
 * `smart` are ours and would collide with the platform's own hosts; `osh`,
 * `plov` and `test` are generic. A restaurant that got `www.smartrestaurant.uz`
 * would break the platform for everybody else, which is why this is checked
 * before the field is even submitted.
 *
 * **The real answer comes on save, and it is a real answer.**
 * `UpdateSiteSettingsRequest` checks uniqueness across the whole platform —
 * unscoped and deliberately outside tenancy, because the entire question is
 * whether SOMEBODY ELSE holds this name and a tenant-scoped query can only ever
 * answer "not you", which is the answer that lets the collision through. It
 * also keeps its own reserved list, wider than this one: every label in
 * `tenancy.central_domains` plus `api`, `app`, `platform`, `static`, `cdn` and
 * `mail`.
 *
 * So this list is the fast half rather than the whole check. It refuses what
 * can be known without a round trip and the panel calls the rest *available*,
 * which stays a hope until the save answers — and when the save is refused, the
 * chip moves to "taken" and names the address that was refused, so the reader
 * is not left rereading a field that looked fine. There is no separate
 * availability endpoint and there does not need to be one: a name is only
 * genuinely yours at the moment it is written, and a green tick issued a minute
 * earlier is a reservation nobody made.
 */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  'osh',
  'plov',
  'test',
  'admin',
  'www',
  'smart',
];

/** The tones each PWA fact is drawn in, index-aligned with `pwaFacts`. */
export const PWA_FACT_TONES: readonly ('success' | 'brand' | 'warning' | 'neutral')[] = [
  'success',
  'neutral',
  'neutral',
  'neutral',
];

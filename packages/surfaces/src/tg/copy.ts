import type { Lang, Trilingual } from './data';

/**
 * Everything the bot and the mini app say, in the three languages.
 *
 * Its own file rather than `src/i18n`, for the same reason the guest and
 * customer surfaces have theirs: this runs inside Telegram's WebView on a
 * phone over a café's connection, and shipping the staff console's whole
 * catalogue to it would be several hundred kilobytes of strings about payroll.
 *
 * Every line below is `Smart Restaurant Telegram.dc.html` verbatim — the `t`
 * block at `:822-848` and the `flash()` calls scattered through the handlers.
 * A reviewer can diff them against the prototype, which is the only reason to
 * keep copy in a file at all.
 */
type Section = Readonly<Record<string, Trilingual>>;

export const TG = {
  /* ------------------------------------------------------------- the dock */
  menu: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
  cart: { uz: 'Buyurtma', ru: 'Заказ', en: 'Your order' },
  order: { uz: 'Buyurtmani kuzatish', ru: 'Отслеживание', en: 'Order tracking' },
  points: { uz: 'Ballar va aksiyalar', ru: 'Баллы и акции', en: 'Points and offers' },

  /*
   * Said at the top of every screen in this mini app, and it is not decoration.
   *
   * Nothing on this surface reads the API: the menu, the prices, the points
   * balance, the ledger and the order being tracked are all `tg/data.ts`. A
   * guest opening a real restaurant's bot was shown the demo restaurant's menu
   * at the demo's prices, a balance that was not theirs, and an order being
   * followed that does not exist — and could fill a basket from it.
   *
   * The endpoints that would fix it are two different sizes of job.
   * `GET /api/v1/public/menu` is tenant-scoped by `X-Tenant` and needs no login,
   * so the menu and the basket are a seam away. Points and order tracking need
   * the Telegram identity — `initData` has to be verified against the bot
   * token, and nothing on this platform does that yet — so until it does, a
   * balance shown here would be somebody's.
   *
   * Until both land, the surface says what it is. That is the whole fix
   * available today, and it is a real one: a guest told it is a demonstration
   * does not ring the restaurant about an order.
   */
  sample: {
    uz: 'Namoyish rejimi — menyu, narxlar va ballar namunaviy',
    ru: 'Демо-режим — меню, цены и баллы демонстрационные',
    en: 'Demonstration — the menu, prices and points are samples',
  },

  /*
   * What replaces `sample` once the menu is the restaurant's own.
   *
   * `GET /api/v1/public/menu` needs no login — the restaurant is named by
   * `X-Tenant` — so the menu and the basket landed first, and the checkout was
   * already real: it goes through the same `placeSiteOrder` the restaurant
   * site's does. Points and order tracking did not, and cannot until `initData`
   * is verified against the bot token, because a balance shown before that is
   * somebody else's.
   *
   * Two sentences rather than one that hedges. A banner that says "some of this
   * is a sample" makes a guest distrust the price as well, and the price is now
   * the kitchen's.
   */
  samplePoints: {
    uz: 'Ballar va buyurtma kuzatuvi namunaviy — bot hali sizni tanimaydi',
    ru: 'Баллы и отслеживание заказа демонстрационные — бот вас ещё не узнаёт',
    en: 'Points and order tracking are samples — the bot does not know you yet',
  },

  /* Short forms for the four-slot dock, where the full titles do not fit. */
  tabMenu: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
  tabCart: { uz: 'Savat', ru: 'Корзина', en: 'Cart' },
  tabOrder: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order' },
  tabPoints: { uz: 'Ballar', ru: 'Баллы', en: 'Points' },

  /* ------------------------------------------------------- the bot itself */
  botOnline: {
    uz: 'bot · doim javob beradi',
    ru: 'бот · отвечает всегда',
    en: 'bot · always answers',
  },
  kbOpen: { uz: 'Menyuni ochish', ru: 'Открыть меню', en: 'Open the menu' },
  kbPlaceholder: { uz: 'Xabar yozish…', ru: 'Написать сообщение…', en: 'Write a message…' },
  /*
   * The sentence that explains why this screen exists.
   *
   * `STAGENOTE.chat`. The build shipped a mini app with no door into it — a
   * guest arriving at `/tg` was redirected straight to the menu, so the one
   * decision the design makes about this product ("the menu is not in the
   * chat") was invisible.
   */
  chatNote: {
    uz: 'Mijoz botga kiradi. Uch tugma, uch savol — boshqa hech narsa. Menyu botda emas, mini ilovada ochiladi.',
    ru: 'Клиент заходит в бота. Три кнопки, три вопроса — и ничего лишнего. Меню открывается не в боте, а в мини-приложении.',
    en: 'The guest opens the bot. Three buttons, three questions — nothing more. The menu opens in the mini app, not in the chat.',
  },
  appClose: { uz: 'Yopish', ru: 'Закрыть', en: 'Close' },
  appVia: { uz: 'mini ilova', ru: 'мини-приложение', en: 'mini app' },

  /* ---------------------------------------------------------- the menu */
  change: { uz: "O'zgartirish", ru: 'Изменить', en: 'Change' },
  soldOut: { uz: 'Tugadi', ru: 'Закончилось', en: 'Sold out' },
  mainToOrder: { uz: "Buyurtmaga o'tish", ru: 'Перейти к заказу', en: 'Go to the order' },
  mainPickFirst: { uz: 'Menyudan tanlang', ru: 'Выберите из меню', en: 'Pick from the menu' },
  pickDishFirst: {
    uz: 'Avval taom tanlang',
    ru: 'Сначала выберите блюдо',
    en: 'Pick a dish first',
  },
  modeSwitched: {
    uz: 'Yetkazish usuli almashtirildi',
    ru: 'Способ получения изменён',
    en: 'The delivery method has changed',
  },
  added: { uz: 'savatga qo‘shildi', ru: 'добавлено в корзину', en: 'added to the cart' },

  /* ---------------------------------------------------------- the basket */
  empty: { uz: 'Savat bo‘sh', ru: 'Корзина пуста', en: 'The cart is empty' },
  emptySub: {
    uz: 'Menyudan taom qo‘shing — bu yerda ko‘rinadi.',
    ru: 'Добавьте блюда из меню — они появятся здесь.',
    en: 'Add dishes from the menu and they appear here.',
  },
  backToMenu: { uz: 'Menyuga qaytish', ru: 'Вернуться в меню', en: 'Back to the menu' },
  payHow: { uz: "To'lov usuli", ru: 'Способ оплаты', en: 'Payment method' },
  items: { uz: 'Taomlar', ru: 'Блюда', en: 'Items' },
  delivery: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
  pickup: { uz: 'Olib ketish', ru: 'Самовывоз', en: 'Takeaway' },
  free: { uz: 'bepul', ru: 'бесплатно', en: 'free' },
  fromPoints: { uz: 'Ballardan', ru: 'Баллами', en: 'From points' },
  total: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  usePoints: { uz: 'Ballarni ishlatish', ru: 'Списать баллы', en: 'Use points' },
  /**
   * The ceiling, said where a guest can act on it.
   *
   * `t.loyalWorth` states the rule once on the loyalty card; the cart repeats
   * it beside the checkbox, because that is the moment somebody wonders why
   * their 2 840 points only took 5 000 so'm off.
   */
  pointsCap: {
    uz: "1 ball = 1 so'm · hisobning 30% gacha",
    ru: '1 балл = 1 сум · до 30% суммы счёта',
    en: "1 point = 1 so'm · up to 30% of the bill",
  },
  /**
   * VAT, exactly as `lib/pricing.ts` computes it — and the design disagrees.
   *
   * The design file extracts VAT from a sum that **includes** the delivery fee
   * (`20 036` on a 124 000 bill), while `BillTotals::of()` keeps delivery
   * outside the tax base and this surface must not have a second arithmetic:
   * the printed cheque, the fiscal driver and the Z report all read the
   * server's figure. So the sentence is the design's and the number is the
   * ledger's, and the discrepancy is written down rather than papered over.
   */
  vatNote: {
    uz: 'Narx ichida QQS 12% bor. Yetkazishda xizmat haqi olinmaydi.',
    ru: 'В цене уже есть НДС 12%. При доставке сервисный сбор не берётся.',
    en: 'VAT 12% is already in the price. No service charge on delivery.',
  },
  vatOf: { uz: 'Shundan QQS', ru: 'В том числе НДС', en: 'Of which VAT' },
  mainPay: { uz: "To'lash va yuborish", ru: 'Оплатить и отправить', en: 'Pay and send' },
  sent: {
    uz: 'Yuborildi · buyurtma POS ga tushdi va oshxonaga ketdi',
    ru: 'Отправлено · заказ попал в POS и ушёл на кухню',
    en: 'Sent · the order landed in the POS and went to the kitchen',
  },
  notWired: {
    uz: 'Bu ekran hali serverga ulanmagan — buyurtma shu telefonda qoladi.',
    ru: 'Экран ещё не подключён к серверу — заказ останется на этом телефоне.',
    en: 'This screen is not wired to the server yet — the order stays on this phone.',
  },

  /* ---------------------------------------- placing it from the mini app */
  yourName: { uz: 'Ismingiz', ru: 'Ваше имя', en: 'Your name' },
  yourPhone: { uz: 'Telefon raqamingiz', ru: 'Ваш телефон', en: 'Your phone' },
  whoNote: {
    uz: "Bot raqamingizni bermaydi — buyurtma tayyor bo'lganda qo'ng'iroq qilamiz.",
    ru: 'Бот не передаёт ваш номер — он нужен, чтобы позвонить, когда заказ готов.',
    en: 'The bot does not pass your number on — we need it to call when the order is ready.',
  },
  pickupOnly: {
    uz: "Mini ilova faqat olib ketishga buyurtma oladi — manzil so'ralmaydi.",
    ru: 'Мини-приложение принимает только самовывоз — адрес не спрашиваем.',
    en: 'The mini app takes collection orders only — no address is asked for.',
  },
  switchToPickup: {
    uz: "Olib ketishga o'tkazish",
    ru: 'Переключить на самовывоз',
    en: 'Switch to collection',
  },
  payOnPickup: {
    uz: "Telegram ichida to'lash hali ulanmagan — olib ketishda to'laysiz.",
    ru: 'Оплата внутри Telegram ещё не подключена — оплатите при получении.',
    en: 'Paying inside Telegram is not wired yet — pay when you collect.',
  },
  sampleMenu: {
    uz: "Menyu namunaviy — bu savatni yuborib bo'lmaydi.",
    ru: 'Меню демонстрационное — такую корзину отправить нельзя.',
    en: 'The menu is a sample — this basket cannot be sent.',
  },
  pointsNotWired: {
    uz: 'Ballarni sarflash hali ulanmagan — buyurtma berish uchun belgini oling.',
    ru: 'Списание баллов ещё не подключено — снимите галочку, чтобы оформить заказ.',
    en: 'Spending points is not wired yet — clear the tick to place the order.',
  },
  placed: {
    uz: 'Buyurtma qabul qilindi · {number}',
    ru: 'Заказ принят · {number}',
    en: 'Order placed · {number}',
  },

  /* --------------------------------------------------------- the tracking */
  mainBack: { uz: 'Botga qaytish', ru: 'Вернуться в бот', en: 'Back to the bot' },
  courier: { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' },
  call: { uz: "Qo'ng'iroq", ru: 'Позвонить', en: 'Call' },
  callHidden: {
    uz: "Qo'ng'iroq · raqam yashirin, bot ulaydi",
    ru: 'Звонок · номер скрыт, соединяет бот',
    en: 'Calling · the number is hidden, the bot connects you',
  },
  callCourier: {
    uz: "Kuryerga qo'ng'iroq · Oybek S.",
    ru: 'Звонок курьеру · Ойбек С.',
    en: 'Calling the courier · Oybek S.',
  },

  /*
   * The ladder's guest words.
   *
   * The keys are `packages/i18n/src/order-state.ts`'s and the words are the
   * design's — which agree on four of the five. `accepted` is the exception:
   * the canonical guest label is "Tasdiqlandi", the Telegram file draws "Qabul
   * qilindi", and the handoff's own rule is that the file wins. The key is what
   * crosses the wire, so nothing downstream can tell the difference.
   */
  step_accepted: { uz: 'Qabul qilindi', ru: 'Принят', en: 'Accepted' },
  step_cooking: { uz: 'Oshxonada', ru: 'На кухне', en: 'In the kitchen' },
  step_ready: { uz: 'Tayyor', ru: 'Готов', en: 'Ready' },
  step_enroute: { uz: "Kuryer yo'lda", ru: 'Курьер в пути', en: 'Courier on the way' },
  step_handed: { uz: 'Yetkazildi', ru: 'Доставлен', en: 'Delivered' },
  now: { uz: 'hozir', ru: 'сейчас', en: 'now' },
  noOrder: { uz: 'Kuzatiladigan buyurtma yo‘q', ru: 'Нечего отслеживать', en: 'Nothing to track' },

  /* ----------------------------------------------------------- the points */
  loyalPts: { uz: "Ball qoldig'i", ru: 'Баланс баллов', en: 'Point balance' },
  /** Opened outside Telegram: there is no signature, so there is nobody to be. */
  /** A step the order has not reached yet, on a live tracker. */
  soon: { uz: 'kutilmoqda', ru: 'ожидается', en: 'to come' },
  loyalOutside: {
    uz: 'Ballarni ko‘rish uchun mini ilovani Telegram ichida oching',
    ru: 'Чтобы увидеть баллы, откройте мини-приложение в Telegram',
    en: 'Open the mini app inside Telegram to see your points',
  },
  /** The restaurant has connected no bot, so nothing can be verified. */
  loyalNoBot: {
    uz: 'Bu restoran hali Telegram botini ulamagan',
    ru: 'Этот ресторан ещё не подключил Telegram-бота',
    en: 'This restaurant has not connected a Telegram bot yet',
  },
  loyalWorth: {
    uz: "1 ball = 1 so'm · hisobning 30% gacha ishlatiladi",
    ru: '1 балл = 1 сум · до 30% суммы счёта',
    en: "1 point = 1 so'm · up to 30% of the bill",
  },
  loyalOffers: { uz: 'Mavjud aksiyalar', ru: 'Доступные акции', en: 'Available offers' },
  loyalHistory: { uz: 'Ball harakati', ru: 'История баллов', en: 'Point history' },
  costs: { uz: '{n} ball', ru: '{n} баллов', en: '{n} points' },
  identityNote: {
    uz: 'Ballar telefon raqamiga bog‘lanadi. Telegram hisobingiz boshqa raqamga ulangan bo‘lsa, ballar ikkiga bo‘linadi — restoran menejeri ularni birlashtira oladi.',
    ru: 'Баллы привязаны к номеру телефона. Если Telegram-аккаунт на другом номере, баллы разделятся — менеджер ресторана может их объединить.',
    en: 'Points are keyed to a phone number. If your Telegram account uses a different one they split in two — the restaurant manager can merge them.',
  },

  /* ---------------------------------------------------- the notifications */
  pushTab: { uz: 'Bildirishnoma', ru: 'Уведомления', en: 'Notifications' },
  lockDate: { uz: 'Seshanba, 11-avgust', ru: 'Вторник, 11 августа', en: 'Tuesday, 11 August' },
  lockNote: {
    uz: 'Bot xabarlari suhbat bo‘lib qoladi — mijoz eski xabarlarni qayta o‘qiy oladi. Oddiy push esa yo‘qoladi.',
    ru: 'Сообщения бота остаются диалогом — клиент может перечитать старые. Обычный пуш исчезает.',
    en: 'The bot’s messages stay as a conversation — the guest can reread them. A plain push disappears.',
  },
  pushNote: {
    uz: 'Bot xabarlari qulflangan ekranda shunday ko‘rinadi. Har biri bir ish uchun, har biri javob berish mumkin.',
    ru: 'Так сообщения бота выглядят на экране блокировки. Каждое — для одного дела, на каждое можно ответить.',
    en: 'This is how the bot’s messages look on the lock screen. Each does one job, each can be answered.',
  },

  /* ------------------------------------------------ what the buttons said */
  ratedInChat: {
    uz: 'Rahmat · baho POS dagi mijoz kartasiga yoziladi',
    ru: 'Спасибо · оценка попадёт в карточку клиента в POS',
    en: 'Thank you · the rating lands on the guest’s POS record',
  },
  ratedInPush: {
    uz: "Rahmat · 100 ball qo'shildi",
    ru: 'Спасибо · начислено 100 баллов',
    en: 'Thank you · 100 points added',
  },
  problemSent: {
    uz: "Menejerga yuborildi · u siz bilan bog'lanadi",
    ru: 'Отправлено менеджеру · он свяжется с вами',
    en: 'Sent to the manager · they will get in touch',
  },
  bookingConfirmed: {
    uz: 'Bandlov tasdiqlandi · zal administratoriga xabar ketdi',
    ru: 'Бронь подтверждена · хостес уведомлена',
    en: 'Booking confirmed · the host has been notified',
  },
  bookingCancelled: {
    uz: "Bandlov bekor qilindi · stol bo'shatildi",
    ru: 'Бронь отменена · столик освобождён',
    en: 'Booking cancelled · the table is free again',
  },
} as const satisfies Section;

export const t = (key: keyof typeof TG, lang: Lang): string => TG[key][lang];

/** `{name}` → value, for the handful of lines that interpolate. */
export const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

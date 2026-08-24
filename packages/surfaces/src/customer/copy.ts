/**
 * Everything this surface says, in three languages.
 *
 * **This file is a staging post, not its final home.** Catalogues live in
 * `apps/web/src/i18n`, which this session does not own, so the copy is written
 * here in the shape that file wants and handed over as one group. When it
 * lands, every section below becomes a namespace under `customer` and this
 * module collapses to a re-export — the call sites do not change, because they
 * already read through `copy()` rather than reaching into the object.
 *
 * Two rules decide what is allowed in here, and both have already cost time.
 *
 * **Copy, never data.** A dish name, a branch name, a payment rail and the
 * currency word are content a restaurant owns; they are in `customer-data.ts`
 * as `{uz, ru, en}` columns. What is here is interface text — the things the
 * product says, which no restaurant edits.
 *
 * **No key whose three languages are identical.** `i18n.test.ts` rejects those,
 * and it is right to: a row that reads the same in all three is data wearing a
 * catalogue key, and it will be edited in the wrong place by whoever finds it
 * first. "so'm" is the example that catches people out — Uzbek and English
 * spell it the same, so it is data.
 *
 * The Uzbek is the authoring language and the other two are written, not
 * machine-translated: Russian is neutral-professional and English is the most
 * concise of the three, per START-HERE §6. All three came from the design file
 * verbatim, so a reviewer can diff them against the prototype.
 */

import type { Lang, Trilingual } from './data';

/** A section of the catalogue: keys to their three languages. */
type Section = Readonly<Record<string, Trilingual>>;

/** The same section after `copy()` has picked a language. */
export type Resolved<S extends Section> = { readonly [K in keyof S]: string };

/**
 * Pick one language out of a section.
 *
 * Returns a plain object rather than a lookup function so a component
 * destructures once at the top and the rest of it reads as prose. The generic
 * keeps the keys: a typo in a key name is a compile error, which is the whole
 * benefit a catalogue has over inline strings.
 */
export function copy<S extends Section>(section: S, lang: Lang): Resolved<S> {
  const out: Record<string, string> = {};

  for (const key of Object.keys(section)) {
    const entry = section[key];
    if (entry !== undefined) out[key] = entry[lang] || entry.uz;
  }

  return out as Resolved<S>;
}

/* ============================================================
   Shared — said on more than one screen
   ============================================================ */

export const SHARED = {
  soldOut: { uz: 'Tugadi', ru: 'Закончилось', en: 'Sold out' },
  change: { uz: "O'zgartirish", ru: 'Изменить', en: 'Change' },
  open: { uz: 'Ochish', ru: 'Открыть', en: 'Open' },
  remove: { uz: "O'chirish", ru: 'Удалить', en: 'Remove' },
  total: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  items: { uz: 'Taomlar', ru: 'Блюда', en: 'Items' },
  delivery: { uz: 'Yetkazib berish', ru: 'Доставка', en: 'Delivery' },
  pickup: { uz: 'Olib ketish', ru: 'Самовывоз', en: 'Pickup' },
  free: { uz: 'bepul', ru: 'бесплатно', en: 'free' },
  discount: { uz: 'Chegirma', ru: 'Скидка', en: 'Discount' },
  back: { uz: 'Orqaga', ru: 'Назад', en: 'Back' },
  search: {
    uz: 'Taom yoki kategoriya qidirish',
    ru: 'Поиск блюда или категории',
    en: 'Search a dish or a category',
  },
  minutes: { uz: 'daqiqa', ru: 'мин', en: 'min' },
  /*
   * Every list in this app has four states and this is the third of them.
   * CLAUDE.md rule 10: an error says what failed and what to do, never "Oops".
   * The customer app fails in exactly one way that matters — the menu did not
   * load — and a guest can act on "try again", so that is what it offers.
   */
  errorTitle: {
    uz: 'Menyu yuklanmadi',
    ru: 'Меню не загрузилось',
    en: 'The menu did not load',
  },
  errorBody: {
    uz: "Aloqa uzildi. Qayta urinib ko'ring — savatingiz saqlanib qoladi.",
    ru: 'Связь прервалась. Попробуйте ещё раз — корзина сохранится.',
    en: 'The connection dropped. Try again — your cart is kept.',
  },
  retry: { uz: 'Qayta urinish', ru: 'Повторить', en: 'Try again' },
  /* Said when a write was refused and the platform sent no sentence of its own
     — the rating on the tracking screen posts for real now. */
  notSent: {
    uz: "Yuborilmadi — qaytadan urinib ko'ring",
    ru: 'Не отправлено — попробуйте ещё раз',
    en: 'Not sent — try again',
  },
} as const satisfies Section;

/* ============================================================
   The dock
   ============================================================ */

export const DOCK = {
  menu: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
  cart: { uz: 'Savat', ru: 'Корзина', en: 'Cart' },
  order: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order' },
  profile: { uz: 'Profil', ru: 'Профиль', en: 'Profile' },
} as const satisfies Section;

/* ============================================================
   1 · Sign in
   ============================================================ */

export const AUTH = {
  heading: { uz: 'Bir daqiqada buyurtma', ru: 'Заказ за минуту', en: 'Order in a minute' },
  lede: {
    uz: 'Telefon raqamingizni kiriting. Parol kerak emas — SMS kod yuboramiz.',
    ru: 'Введите номер телефона. Пароль не нужен — отправим код в SMS.',
    en: 'Enter your phone number. No password — we send an SMS code.',
  },
  phoneLabel: { uz: 'Telefon raqami', ru: 'Номер телефона', en: 'Phone number' },
  send: { uz: 'Kod yuborish', ru: 'Отправить код', en: 'Send the code' },
  terms: {
    uz: 'Davom etish bilan foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz.',
    ru: 'Продолжая, вы соглашаетесь с условиями использования и политикой конфиденциальности.',
    en: 'By continuing you agree to the terms of use and the privacy policy.',
  },
  codeLabel: {
    uz: 'SMS kodni kiriting',
    ru: 'Введите код из SMS',
    en: 'Enter the code from the SMS',
  },
  resend: {
    uz: 'Qayta yuborish 00:42 dan keyin',
    ru: 'Отправить снова через 00:42',
    en: 'Resend in 00:42',
  },
  changeNumber: { uz: "Raqamni o'zgartirish", ru: 'Изменить номер', en: 'Change number' },
  incomplete: {
    uz: "Telefon raqamini to'liq kiriting — 9 raqam",
    ru: 'Введите номер полностью — 9 цифр',
    en: 'Enter the full number — 9 digits',
  },
  codeSent: { uz: 'kod yuborildi', ru: 'код отправлен', en: 'code sent' },
  welcome: { uz: 'Xush kelibsiz', ru: 'Добро пожаловать', en: 'Welcome back' },
} as const satisfies Section;

/* ============================================================
   2 · Home
   ============================================================ */

export const HOME = {
  /*
   * Two sentences, and the first one is the fee.
   *
   * The design's `modeNote` reads "Yetkazib berish 12 000 so'm. 250 000
   * so'mdan yuqori buyurtmada bepul." — the amount first, the threshold
   * second. Only the threshold was here, so the screen announced free delivery
   * over 250 000 without ever saying what delivery costs below it. The figure
   * is per branch (Termiz charges 15 000) so it is interpolated rather than
   * written down: `{amount}` is filled from `Branch.deliveryFee`.
   */
  deliveryNote: {
    uz: "Yetkazib berish {amount}. 250 000 so'mdan yuqori buyurtmada bepul.",
    ru: 'Доставка {amount}. Бесплатно от 250 000 сум.',
    en: 'Delivery {amount}. Free over 250 000 so’m.',
  },
  pickupNote: {
    uz: "Olib ketishda 5% chegirma. Tayyor bo'lganda xabar keladi.",
    ru: 'При самовывозе скидка 5%. Придёт уведомление о готовности.',
    en: 'Pickup gets 5% off. You get a notification when it is ready.',
  },
  promoTag: { uz: 'Bu haftada', ru: 'На этой неделе', en: 'This week' },
  promoHeading: {
    uz: "To'y oshi — ikkinchi porsiya yarim narxda",
    ru: 'Свадебный плов — вторая порция вполовину',
    en: 'Wedding plov — second portion half price',
  },
  promoNote: {
    uz: 'Faqat 11:00–15:00 · 17-avgustgacha',
    ru: 'Только 11:00–15:00 · до 17 августа',
    en: '11:00–15:00 only · until 17 August',
  },
  /** The unit after a category's dish count — "18 ta", "18 шт", "18 items". */
  countUnit: { uz: 'ta', ru: 'шт', en: 'items' },
  categories: { uz: 'Kategoriyalar', ru: 'Категории', en: 'Categories' },
  seeAll: { uz: 'Barchasi', ru: 'Все', en: 'See all' },
  popular: { uz: "Ko'p buyurtma qilinadi", ru: 'Часто заказывают', en: 'Most ordered' },
  popularNote: { uz: 'Oxirgi 7 kun', ru: 'За 7 дней', en: 'Last 7 days' },
  loyaltyStrip: { uz: 'ball · 3 kupon', ru: 'баллов · 3 купона', en: 'points · 3 coupons' },
  loyaltyStripNote: {
    uz: 'Kumush daraja · keyingi darajaga 1 520 ball',
    ru: 'Серебряный уровень · до следующего 1 520 баллов',
    en: 'Silver tier · 1 520 points to the next',
  },
  inTown: { uz: 'shahar ichida', ru: 'по городу', en: 'in town' },
  openHours: { uz: 'Ish vaqti 08:00–23:00', ru: 'Часы работы 08:00–23:00', en: 'Open 08:00–23:00' },
} as const satisfies Section;

/* ============================================================
   3 · Menu
   ============================================================ */

export const MENU = {
  heading: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
  countOne: { uz: 'ta taom', ru: 'блюд', en: 'dishes' },
  countFound: { uz: 'ta taom topildi', ru: 'блюд найдено', en: 'dishes found' },
  clearSearch: { uz: 'Qidiruvni tozalash', ru: 'Очистить поиск', en: 'Clear the search' },
  noHitsHeading: { uz: 'Taom topilmadi', ru: 'Блюдо не найдено', en: 'No dish found' },
  noHitsBody: {
    uz: 'Boshqa nom kiriting yoki kategoriyadan tanlang.',
    ru: 'Введите другое название или выберите категорию.',
    en: 'Try another name, or pick a category.',
  },
  addedToCart: {
    uz: "savatga qo'shildi",
    ru: 'добавлено в корзину',
    en: 'added to the cart',
  },
  /*
   * The empty state, which the design does not draw and the API can produce:
   * a branch outside its opening hours, or a menu nobody has published yet.
   * Rule 10 wants one line saying what would be here and at most one action.
   */
  emptyHeading: { uz: 'Menyu hozircha bo’sh', ru: 'Меню пока пустое', en: 'The menu is empty' },
  emptyBody: {
    uz: 'Bu filial hozir buyurtma qabul qilmayapti. Boshqa filialni tanlang.',
    ru: 'Этот филиал сейчас не принимает заказы. Выберите другой филиал.',
    en: 'This branch is not taking orders right now. Pick another branch.',
  },
  /*
   * The menu on screen is the fixture, not the kitchen's.
   *
   * Said out loud rather than hidden, because the alternative is a customer
   * ordering a dish at a price this restaurant never set. The same sentence the
   * staff app uses for a floor it could not load — a demo somebody acts on is
   * worse than a screen that admits it knows nothing.
   */
  demoMenu: {
    uz: 'Namunaviy menyu — restoranga ulanib bo‘lmadi. Qayta urinish uchun bosing.',
    ru: 'Демо-меню — не удалось связаться с рестораном. Нажмите, чтобы повторить.',
    en: 'Sample menu — the restaurant could not be reached. Tap to try again.',
  },
} as const satisfies Section;

/* ============================================================
   4 · Dish
   ============================================================ */

export const DISH = {
  size: { uz: 'Hajmi', ru: 'Размер', en: 'Size' },
  extras: { uz: "Qo'shimchalar", ru: 'Добавки', en: 'Extras' },
  base: { uz: 'asosiy', ru: 'базовая', en: 'base' },
  note: { uz: 'Oshxonaga izoh', ru: 'Комментарий на кухню', en: 'Note for the kitchen' },
  notePlaceholder: {
    uz: 'Masalan: kamroq tuz',
    ru: 'Например: меньше соли',
    en: 'For example: less salt',
  },
  addToCart: { uz: "Savatga qo'shish", ru: 'В корзину', en: 'Add to cart' },
  added: { uz: "Savatga qo'shildi", ru: 'Добавлено в корзину', en: 'Added to the cart' },
  ratings: { uz: 'baho', ru: 'оценок', en: 'ratings' },
  soldOutBody: {
    uz: "Oshxona bu taomni tugagan deb belgiladi. Tayyor bo'lganda menyuga qaytadi.",
    ru: 'Кухня отметила блюдо как закончившееся. Оно вернётся в меню, когда появится.',
    en: 'The kitchen has marked this sold out. It returns to the menu when it is back.',
  },
  notFound: { uz: 'Bunday taom yo’q', ru: 'Такого блюда нет', en: 'No such dish' },
} as const satisfies Section;

/* ============================================================
   5 · Cart
   ============================================================ */

export const CART = {
  heading: { uz: 'Savat', ru: 'Корзина', en: 'Cart' },
  positions: { uz: 'ta pozitsiya', ru: 'позиций', en: 'items' },
  emptyHeading: { uz: "Savat bo'sh", ru: 'Корзина пуста', en: 'Your cart is empty' },
  emptyBody: {
    uz: "Menyudan taom tanlang — narxlar QQS bilan ko'rsatilgan.",
    ru: 'Выберите блюдо из меню — цены указаны с НДС.',
    en: 'Pick something from the menu — prices include VAT.',
  },
  emptyCta: { uz: "Menyuga o'tish", ru: 'Открыть меню', en: 'Open the menu' },
  noExtras: { uz: "qo'shimchasiz", ru: 'без добавок', en: 'no extras' },
  promoPlaceholder: { uz: 'Promokod', ru: 'Промокод', en: 'Promo code' },
  promoApply: { uz: "Qo'llash", ru: 'Применить', en: 'Apply' },
  promoEmpty: { uz: 'Promokodni kiriting', ru: 'Введите промокод', en: 'Enter a promo code' },
  promoAlready: {
    uz: "Bu kod allaqachon qo'llangan",
    ru: 'Этот код уже применён',
    en: 'That code is already applied',
  },
  promoUnknown: {
    uz: 'Promokod topilmadi. Kuponlar Sodiqlik bo’limida.',
    ru: 'Промокод не найден. Купоны — в разделе лояльности.',
    en: 'No such promo code. Coupons live in Loyalty.',
  },
  promoFloor: {
    uz: "Bu kod 50 000 so'mdan yuqori buyurtmalarda ishlaydi",
    ru: 'Код работает при заказе от 50 000 сум',
    en: "This code applies to orders above 50 000 so'm",
  },
  promoApplied: { uz: "chegirma qo'llandi", ru: 'скидка применена', en: 'discount applied' },
  removed: { uz: "O'chirildi", ru: 'Удалено', en: 'Removed' },
  vatNote: {
    uz: 'Narxlar QQS 12% bilan. Shundan QQS:',
    ru: 'Цены с НДС 12%. В том числе НДС:',
    en: 'Prices include 12% VAT. Of which VAT:',
  },
  toPayment: { uz: "To'lovga o'tish", ru: 'К оплате', en: 'Continue to payment' },
} as const satisfies Section;

/* ============================================================
   6 · Payment
   ============================================================ */

export const PAY = {
  heading: { uz: "To'lov", ru: 'Оплата', en: 'Payment' },
  addressHeading: { uz: 'Yetkazib berish manzili', ru: 'Адрес доставки', en: 'Delivery address' },
  pickupHeading: {
    uz: 'Olib ketish filiali',
    ru: 'Филиал для самовывоза',
    en: 'Pickup branch',
  },
  pickupNote: {
    uz: "Tayyor bo'lganda xabar keladi · 15–20 daqiqa",
    ru: 'Придёт уведомление о готовности · 15–20 минут',
    en: 'You get a notification when it is ready · 15–20 minutes',
  },
  methodHeading: { uz: "To'lov usuli", ru: 'Способ оплаты', en: 'Payment method' },
  tipHeading: { uz: 'Kuryerga rahmat', ru: 'Чаевые курьеру', en: 'Courier tip' },
  tipNone: { uz: "Yo'q", ru: 'Нет', en: 'None' },
  tipNote: {
    uz: "Choypuli to'liq kuryerga o'tadi va restoran tushumiga kirmaydi.",
    ru: 'Чаевые полностью достаются курьеру и не входят в выручку ресторана.',
    en: "Tips go entirely to the courier and are not part of the restaurant's revenue.",
  },
  toPay: { uz: "To'lovga", ru: 'К оплате', en: 'To pay' },
  place: { uz: 'Buyurtma berish', ru: 'Оформить заказ', en: 'Place the order' },
  placeNote: {
    uz: 'Tasdiqlagandan keyin 2 daqiqa ichida bekor qilish mumkin.',
    ru: 'Отменить можно в течение 2 минут после подтверждения.',
    en: 'You can cancel within 2 minutes of confirming.',
  },
  accepted: { uz: 'Buyurtma qabul qilindi', ru: 'Заказ принят', en: 'Order accepted' },
  /*
   * `GAPS.md §4.2 Y3` — there is no address book. The design's Change control
   * says only that addresses are kept in the profile, and that is what it says
   * here: an honest dead end reads better than a control that silently does
   * nothing, and it is the gap the next iteration fills.
   */
  addressesInProfile: {
    uz: 'Manzillar profilda saqlanadi',
    ru: 'Адреса хранятся в профиле',
    en: 'Addresses are kept in your profile',
  },
  /**
   * The totals row, which is a word, and the sentence, which is a paragraph.
   *
   * Two keys rather than one clipped at its first full stop: a row label has to
   * fit beside a figure on a 390px screen, and "Naqd to'lovda hisob eng yaqin
   * 1 000 so'mga yaxlitlanadi" is not a label in any of the three languages.
   */
  rounding: { uz: 'Yaxlitlash', ru: 'Округление', en: 'Rounding' },
  cashRounding: {
    uz: "Naqd to'lovda hisob eng yaqin 1 000 so'mga yaxlitlanadi.",
    ru: 'При оплате наличными счёт округляется до ближайшей 1 000 сум.',
    en: 'A cash bill settles to the nearest 1 000 so’m.',
  },

  /* ---- placing it, and the four ways that does not happen -------------- */

  placing: { uz: 'Yuborilmoqda…', ru: 'Отправляем…', en: 'Sending…' },
  /**
   * The menu on the screen is the demo catalogue.
   *
   * Said on the button rather than after the tap. A basket built from
   * `DEMO_MENU` carries dish ids that are words, and the ordering endpoint
   * prices every line through the kitchen's own catalogue and refuses what it
   * was never offered — so the whole basket comes back rejected at the last
   * tap, with a sentence about a menu item id.
   */
  sampleMenu: {
    uz: "Namunaviy menyu — restoranga ulanib bo'lmadi",
    ru: 'Демо-меню — не удалось связаться с рестораном',
    en: 'Sample menu — the restaurant is not reachable',
  },
  phoneNeeded: {
    uz: 'Buyurtma uchun telefon raqami kerak',
    ru: 'Для заказа нужен номер телефона',
    en: 'An order needs a phone number',
  },
  addressNeeded: {
    uz: 'Yetkazib berish uchun manzil tanlang',
    ru: 'Выберите адрес доставки',
    en: 'Choose a delivery address',
  },
  /** The last resort, when the API said no in a language nobody set. */
  rejected: {
    uz: "Buyurtma qabul qilinmadi. Qayta urinib ko'ring.",
    ru: 'Заказ не принят. Попробуйте ещё раз.',
    en: 'The order was not accepted. Please try again.',
  },
  /** Signing in is optional, and this says what it buys rather than demanding it. */
  signInForAddresses: {
    uz: 'Manzillaringiz uchun kiring',
    ru: 'Войдите, чтобы увидеть свои адреса',
    en: 'Sign in to use your saved addresses',
  },

  /** A promo the cart showed and the server did not honour. */
  promoNotApplied: {
    uz: "Promo kod qo'llanmadi — hisob to'liq narxda",
    ru: 'Промокод не применён — счёт по полной цене',
    en: 'The promo code was not applied — full price',
  },
  /**
   * The order exists, the rail did not open, and nobody is cooking it.
   *
   * An online order waits at `draft` with `payment_state = 'pending'` until a
   * provider says the money landed — no docket is printed and no pan is lit. A
   * guest whose Payme never opened is owed that sentence rather than a tracking
   * screen that looks like every other one.
   */
  railFailed: {
    uz: "To'lov ilovasi ochilmadi — buyurtma to'lov kutmoqda",
    ru: 'Приложение оплаты не открылось — заказ ждёт оплаты',
    en: 'The payment app did not open — the order is waiting to be paid',
  },
  /**
   * The menu is live and the basket is not — lines added before it arrived.
   *
   * A phone that opened in a lift browses the fixtures, and a dish added there
   * carries an id that is a word. When the catalogue lands, the basket is still
   * holding it: the restaurant is reachable and the checkout still cannot go,
   * which "could not reach the restaurant" would explain wrongly. What the
   * guest can do about it is the whole of this sentence.
   */
  staleBasket: {
    uz: "Savatdagi taomlar namunaviy menyudan — o'chirib, menyudan qayta qo'shing.",
    ru: 'Блюда в корзине из демо-меню — удалите их и добавьте из меню заново.',
    en: 'The cart holds sample dishes — remove them and add them again from the menu.',
  },
} as const satisfies Section;

/* ============================================================
   7 · Order status
   ============================================================ */

/**
 * The guest's words for the state ladder.
 *
 * The key is `cooking` in the database and the kitchen screen reads it as
 * "Tayyorlanmoqda"; a guest reads "Oshxonada", because what matters to them is
 * that the restaurant has it, not which station is on it. One row, three
 * audiences — `DATABASE.md §6.1`.
 */
export const ORDER_STATE = {
  accepted: { uz: 'Qabul qilindi', ru: 'Заказ принят', en: 'Order accepted' },
  cooking: { uz: 'Oshxonada', ru: 'На кухне', en: 'In the kitchen' },
  enroute: { uz: "Yo'lda", ru: 'В пути', en: 'On the way' },
  handed: { uz: 'Yetkazildi', ru: 'Доставлено', en: 'Delivered' },
} as const satisfies Section;

export const ORDER_STATE_NOTE = {
  accepted: {
    uz: "To'lov o'tdi · chek yuborildi",
    ru: 'Оплата прошла · чек отправлен',
    en: 'Payment cleared · receipt sent',
  },
  cooking: {
    uz: 'Oshxona buyurtmani oldi',
    ru: 'Кухня приняла заказ',
    en: 'The kitchen has taken the order',
  },
  enroute: {
    uz: "Kuryer olib ketdi · 2 to'xtash",
    ru: 'Курьер забрал · 2 остановки',
    en: 'The courier collected it · 2 stops',
  },
  handed: {
    uz: 'Bahoingizni qoldiring',
    ru: 'Оставьте оценку',
    en: 'Leave a rating',
  },
} as const satisfies Section;

export const TRACK = {
  heading: { uz: 'Buyurtma holati', ru: 'Статус заказа', en: 'Order status' },
  arriving: { uz: 'Yetkazib beriladi', ru: 'Доставим', en: 'Arriving' },
  readyAt: { uz: "Tayyor bo'ladi", ru: 'Будет готов', en: 'Ready at' },
  contents: { uz: 'Buyurtma tarkibi', ru: 'Состав заказа', en: 'What you ordered' },
  repeat: {
    uz: 'Shu buyurtmani takrorlash',
    ru: 'Повторить заказ',
    en: 'Repeat this order',
  },
  repeated: {
    uz: "Buyurtma savatga ko'chirildi",
    ru: 'Заказ перенесён в корзину',
    en: 'The order has been copied to your cart',
  },
  callCourier: { uz: "Kuryerga qo'ng'iroq", ru: 'Позвонить курьеру', en: 'Call the courier' },
  numberHidden: {
    uz: "Qo'ng'iroq raqami yashiriladi",
    ru: 'Номер скрывается при звонке',
    en: 'Your number stays hidden on the call',
  },
  courierOnWay: { uz: "Kuryer yo'lda", ru: 'Курьер в пути', en: 'Courier on the way' },

  /** The tracking screen is drawing the design's sample, not this guest's dinner. */

  /** The tracking screen is drawing the design's sample, not this guest's dinner. */

  /** The tracking screen is drawing the design's sample, not this guest's dinner. */

  noneHeading: { uz: 'Faol buyurtma yo’q', ru: 'Активных заказов нет', en: 'No active order' },
  noneBody: {
    uz: 'Buyurtma bergach, uning holati shu yerda ko’rinadi.',
    ru: 'После заказа его статус появится здесь.',
    en: 'Once you order, its progress shows here.',
  },
  /*
   * `GAPS.md §4.2 Y4` — a guest can cancel but cannot modify. The design draws
   * the two-minute cancel window and nothing else, so that is what the screen
   * offers and this line says why an edit is not on offer.
   */
  changeNote: {
    uz: 'Buyurtmani o’zgartirish uchun menejerga yozing — ilovadan tahrirlash hali yo’q.',
    ru: 'Чтобы изменить заказ, напишите менеджеру — редактирования в приложении пока нет.',
    en: 'To change an order, message the manager — editing in the app does not exist yet.',
  },
  /** The tracking screen is drawing the design's sample, not this guest's dinner. */
  sampleOrder: {
    uz: 'Namunaviy buyurtma — holat olinmadi. Qayta urinish uchun bosing.',
    ru: 'Демо-заказ — статус не получен. Нажмите, чтобы повторить.',
    en: 'Sample order — the status did not load. Tap to try again.',
  },
  /**
   * The bill is off the ladder: voided, refunded or comped.
   *
   * Not a failure to fetch, which is why it does not offer a retry: there is
   * genuinely no progress bar to draw, and a guest waiting for food nobody is
   * cooking needs to be told rather than left watching a dimmed rail.
   */
  orderGone: {
    uz: 'Bu buyurtma bekor qilindi yoki yopildi. Batafsil — menejerda.',
    ru: 'Этот заказ отменён или закрыт. Подробности — у менеджера.',
    en: 'This order was cancelled or closed. The manager has the details.',
  },
  /**
   * The order exists and nobody is cooking it, because the money has not landed.
   *
   * An online bill waits at `draft` with `payment_state = 'pending'` — no
   * docket, no pan — until the provider's callback says otherwise, and
   * `trackedOrderFrom()` answers null for it because there is genuinely no rung
   * to draw. That null and the one a voided bill produces mean opposite things
   * to the person waiting: one is "confirm it in the bank's app", the other is
   * "this is not happening".
   */
  awaitingPayment: {
    uz: "To'lov kutilmoqda — to'lov ilovasida tasdiqlang. Tasdiqlangach oshxona boshlaydi.",
    ru: 'Ожидается оплата — подтвердите её в приложении. После этого кухня начнёт готовить.',
    en: 'Waiting for payment — confirm it in the payment app. The kitchen starts once it lands.',
  },
} as const satisfies Section;

/* ============================================================
   The problem route — `GAPS.md §4.1 K3`

   The one thing no surface in this product could do: let a guest say something
   went wrong. The Telegram design has it as a chat button (`rate2`,
   `Telegram.dc.html:594`) and the customer app has no equivalent at all, which
   meant a guest who ordered on the web had nowhere to go but the phone number
   on a receipt. Same two words, same two answers, on both surfaces.
   ============================================================ */

export const PROBLEM = {
  rate: { uz: '5 · hammasi yaxshi', ru: '5 · всё отлично', en: '5 · all good' },
  rated: {
    uz: 'Rahmat · baho POS dagi mijoz kartasiga yoziladi',
    ru: 'Спасибо · оценка попадёт в карточку клиента в POS',
    en: 'Thank you · the rating lands on your record',
  },
  report: { uz: 'Muammo bor edi', ru: 'Была проблема', en: 'There was a problem' },
  /*
   * The field is optional and says so: the design's own button sends the signal
   * and nothing else, and a report a guest abandons because it demanded an
   * essay is a report the restaurant never receives.
   */
  reportPlaceholder: {
    uz: 'Nima bo‘ldi? Ixtiyoriy',
    ru: 'Что случилось? Необязательно',
    en: 'What went wrong? Optional',
  },
  send: { uz: 'Yuborish', ru: 'Отправить', en: 'Send' },
  sent: {
    uz: "Menejerga yuborildi · u siz bilan bog'lanadi",
    ru: 'Отправлено менеджеру · он свяжется с вами',
    en: 'Sent to the manager · they will get in touch',
  },
  cancel: { uz: 'Bekor qilish', ru: 'Отменить', en: 'Cancel' },
} as const satisfies Section;

/* ============================================================
   8 · Loyalty
   ============================================================ */

export const LOYALTY_COPY = {
  heading: { uz: 'Sodiqlik', ru: 'Лояльность', en: 'Loyalty' },
  yourPoints: { uz: 'Sizning ballaringiz', ru: 'Ваши баллы', en: 'Your points' },
  silverTier: { uz: 'Kumush daraja', ru: 'Серебряный уровень', en: 'Silver tier' },
  toGold: {
    uz: 'Oltin darajaga 1 520 ball qoldi',
    ru: 'До золотого уровня 1 520 баллов',
    en: '1 520 points to Gold',
  },
  coupons: { uz: 'Kuponlar', ru: 'Купоны', en: 'Coupons' },
  use: { uz: 'Ishlatish', ru: 'Использовать', en: 'Use' },
  couponApplies: {
    uz: "Kupon savatga qo'llanadi",
    ru: 'Купон применится в корзине',
    en: 'The coupon applies at the cart',
  },
  howItWorks: { uz: 'Qanday ishlaydi', ru: 'Как это работает', en: 'How it works' },
} as const satisfies Section;

/* ============================================================
   9 · Profile
   ============================================================ */

export const PROFILE = {
  orders: { uz: 'Buyurtma', ru: 'Заказов', en: 'Orders' },
  spent: { uz: 'Sarflandi', ru: 'Потрачено', en: 'Spent' },
  /*
   * The unit on the "spent" tile, and the reason the tile is not a `<Money>`.
   *
   * The design writes `"3.6 " + P("mln", "млн", "M")`. Three figures share one
   * row on a 390px screen, and "3 600 000 so'm" is eleven characters that push
   * the other two out of shape — so a lifetime total is abbreviated where a
   * bill never is.
   */
  millions: { uz: 'mln', ru: 'млн', en: 'M' },
  points: { uz: 'Ball', ru: 'Баллов', en: 'Points' },
  addresses: { uz: 'Manzillar', ru: 'Адреса', en: 'Addresses' },
  /** Signing out of a device somebody else may pick up. */
  signOut: { uz: 'Chiqish', ru: 'Выйти', en: 'Sign out' },
  signedOut: {
    uz: 'Hisobdan chiqdingiz',
    ru: 'Вы вышли из аккаунта',
    en: 'You are signed out',
  },

  /** The tracking screen is drawing the design's sample, not this guest's dinner. */

  /** The history under the figures is the design's three rows, not this guest's. */

  /** The tracking screen is drawing the design's sample, not this guest's dinner. */

  /** The history under the figures is the design's three rows, not this guest's. */

  /** Signed in, and the list did not arrive — which is not the same as signed out. */

  /** The tracking screen is drawing the design's sample, not this guest's dinner. */

  /** The history under the figures is the design's three rows, not this guest's. */

  /** Signed in, and the list did not arrive — which is not the same as signed out. */

  /** Signed in, and nothing ordered yet. */
  primary: { uz: 'Asosiy', ru: 'Основной', en: 'Default' },
  addAddress: { uz: "Manzil qo'shish", ru: 'Добавить адрес', en: 'Add an address' },
  addAddressNote: {
    uz: 'Manzilni xaritadan tanlaysiz',
    ru: 'Адрес выбирается на карте',
    en: 'You pick the address on a map',
  },
  /*
   * The four the address sheet needs, and the reason they exist at all.
   *
   * `GAPS.md §4.2 Y3` is right that the design draws no address book — no form,
   * no map picker — and the dashed control used to answer by saying where the
   * address *would* come from. `POST /api/v1/public/addresses` exists now, so
   * the control does the thing instead, and the smallest honest form is a name
   * for the place and the street line: exactly what a courier needs and exactly
   * what a person can type one-handed. The map picker the note promises is
   * still missing and the columns for it (`lat`, `lng`) are still nullable.
   */
  addressLabel: { uz: 'Nomi — Uy, Ish', ru: 'Название — Дом, Работа', en: 'Name it — Home, Work' },
  addressLine: {
    uz: "Ko'cha, uy, podyezd, qavat, xonadon",
    ru: 'Улица, дом, подъезд, этаж, квартира',
    en: 'Street, block, entrance, floor, flat',
  },
  saveAddress: { uz: 'Saqlash', ru: 'Сохранить', en: 'Save' },
  removeAddress: { uz: "Manzilni o'chirish", ru: 'Удалить адрес', en: 'Remove address' },
  history: { uz: 'Buyurtmalar tarixi', ru: 'История заказов', en: 'Order history' },
  settings: { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
  language: { uz: 'Til', ru: 'Язык', en: 'Language' },
  appearance: { uz: "Ko'rinish", ru: 'Оформление', en: 'Appearance' },
  light: { uz: 'Kun', ru: 'День', en: 'Light' },
  dark: { uz: 'Tun', ru: 'Ночь', en: 'Dark' },
  systemTheme: { uz: 'Tizim', ru: 'Система', en: 'System' },
  notifications: { uz: 'Bildirishnomalar', ru: 'Уведомления', en: 'Notifications' },
  paymentMethods: { uz: "To'lov usullari", ru: 'Способы оплаты', en: 'Payment methods' },
  help: { uz: 'Yordam va aloqa', ru: 'Помощь и связь', en: 'Help and contact' },
  demoMode: { uz: 'namoyish rejimi', ru: 'демо-режим', en: 'demo mode' },
  /*
   * `GAPS.md §4.1 K3` — no channel in this product lets a guest report a
   * problem or ask for a refund; a refund exists only as a manager approval.
   * The Help row is where a guest would look for it, so it is the honest place
   * to say the route is a person rather than a screen.
   */
  reportProblem: {
    uz: 'Muammo bo’lsa menejerga yozing — ilovadan pul qaytarish so’rovi hali yo’q.',
    ru: 'При проблеме напишите менеджеру — запроса возврата из приложения пока нет.',
    en: 'If something went wrong, message the manager — refund requests are not in the app yet.',
  },
  /** The history under the figures is the design's three rows, not this guest's. */
  sampleHistory: {
    uz: 'Namunaviy tarix — kirsangiz, o‘z buyurtmalaringiz ko‘rinadi',
    ru: 'Демо-история — войдите, чтобы увидеть свои заказы',
    en: 'Sample history — sign in to see your own orders',
  },
  /** Signed in, and the list did not arrive — which is not the same as signed out. */
  historyUnreachable: {
    uz: 'Namunaviy tarix — buyurtmalaringiz olinmadi. Qayta urinish uchun bosing.',
    ru: 'Демо-история — заказы не загрузились. Нажмите, чтобы повторить.',
    en: 'Sample history — your orders did not load. Tap to try again.',
  },
  /** Signed in, and nothing ordered yet. */
  historyEmpty: {
    uz: 'Hali buyurtma yo‘q',
    ru: 'Заказов пока нет',
    en: 'No orders yet',
  },
} as const satisfies Section;

/* ============================================================
   The footer note the design puts under the frame

   Kept because it is the one place the app explains where its menu comes from,
   and a guest who has just seen a dish grey out mid-order deserves the reason.
   ============================================================ */

export const FOOT = {
  note: {
    uz: 'Menyu, narxlar va stop-list POS tizimidan keladi — oshxona taomni tugadi deb belgilasa, u shu ilovada ham darhol xiralashadi. Narxlar QQS bilan; xizmat haqi yetkazib berish va olib ketishda olinmaydi.',
    ru: 'Меню, цены и стоп-лист приходят из POS — если кухня отметит блюдо как закончившееся, оно сразу гаснет и здесь. Цены с НДС; сервисный сбор не берётся при доставке и самовывозе.',
    en: 'Menu, prices and the stop list come from the POS — when the kitchen marks a dish sold out it dims here immediately. Prices include VAT; no service charge on delivery or pickup.',
  },
} as const satisfies Section;

import type { Lang, Trilingual } from './data';

/** MyPOS Marketplace, in the three languages. Its own file — see `tg-copy.ts`. */
type Section = Readonly<Record<string, Trilingual>>;

export const MP = {
  brand: { uz: 'MyPOS', ru: 'MyPOS', en: 'MyPOS' },

  /* The store badges at the foot of the home page — see `store-badges.tsx`. */
  appHeading: { uz: 'Ilovani o‘rnating', ru: 'Установите приложение', en: 'Get the app' },
  appAppleOver: { uz: 'Yuklab olish', ru: 'Скачать в', en: 'Download on the' },
  appAppleNote: {
    uz: 'App Store’da hali yo’q · iPhone’da saytdan o’rnatiladi',
    ru: 'В App Store пока нет · на iPhone ставится с сайта',
    en: 'Not on the App Store yet · installs from the site on iPhone',
  },
  appGoogleOver: { uz: 'Olish', ru: 'Доступно в', en: 'Get it on' },
  appGoogleNote: {
    uz: 'To’g’ridan-to’g’ri saytdan',
    ru: 'Напрямую с сайта',
    en: 'Straight from this site',
  },
  appGoogleNone: {
    uz: 'Android fayli hali nashr qilinmagan',
    ru: 'Файл для Android ещё не опубликован',
    en: 'The Android file is not published yet',
  },
  home: { uz: 'Bosh sahifa', ru: 'Главная', en: 'Home' },
  search: {
    uz: 'Restoran, taom yoki oshxona nomi',
    ru: 'Ресторан, блюдо или кухня',
    en: 'Restaurant, dish or cuisine',
  },
  deliverTo: { uz: 'Yetkazish manzili', ru: 'Адрес доставки', en: 'Deliver to' },

  filter_offers: { uz: 'Aksiyalar', ru: 'Акции', en: 'Offers' },
  filter_freeDelivery: { uz: 'Bepul yetkazish', ru: 'Бесплатная доставка', en: 'Free delivery' },
  filter_under30: { uz: '30 daqiqagacha', ru: 'До 30 минут', en: 'Under 30 min' },
  filter_rated: { uz: 'Reyting 4.5+', ru: 'Рейтинг 4.5+', en: 'Rating 4.5+' },
  filter_openNow: { uz: 'Hozir ochiq', ru: 'Сейчас открыто', en: 'Open now' },

  rail_offers: { uz: 'Bugungi aksiyalar', ru: 'Акции сегодня', en: "Today's offers" },
  rail_fast: { uz: 'Tez yetkazish', ru: 'Быстрая доставка', en: 'Fast delivery' },
  rail_top: {
    uz: 'Eng yuqori baholangan',
    ru: 'С самым высоким рейтингом',
    en: 'Highest rated',
  },
  seeAll: { uz: 'Hammasi', ru: 'Все', en: 'See all' },

  allStores: { uz: 'Barcha restoranlar', ru: 'Все рестораны', en: 'All restaurants' },
  found: { uz: '{n} ta restoran', ru: 'Ресторанов: {n}', en: '{n} restaurants' },
  none: {
    uz: 'Bu filtrga mos restoran yo‘q',
    ru: 'По этому фильтру ничего нет',
    en: 'Nothing matches this filter',
  },
  noneSub: {
    uz: 'Bitta filtrni olib tashlab ko‘ring.',
    ru: 'Попробуйте снять один фильтр.',
    en: 'Try removing one filter.',
  },

  closed: { uz: 'Yopiq', ru: 'Закрыто', en: 'Closed' },
  freeDelivery: { uz: 'Bepul', ru: 'Бесплатно', en: 'Free' },
  minutes: { uz: '{n} daq', ru: '{n} мин', en: '{n} min' },
  /* The design prints a window, not a point: `25–35 daq`. A single
     number reads as a promise and a range reads as an estimate, which
     is what a kitchen and a courier can actually honour. */
  window: { uz: '{from}–{to} daq', ru: '{from}–{to} мин', en: '{from}–{to} min' },
  km: { uz: '{n} km', ru: '{n} км', en: '{n} km' },
  reviews: { uz: '{n} baho', ru: '{n} оценок', en: '{n} reviews' },
  favourite: { uz: 'Sevimlilarga qo‘shish', ru: 'В избранное', en: 'Add to favourites' },

  soldOut: { uz: 'Tugadi', ru: 'Закончилось', en: 'Sold out' },
  add: { uz: 'Qo‘shish', ru: 'Добавить', en: 'Add' },
  cart: { uz: 'Savat', ru: 'Корзина', en: 'Cart' },
  viewCart: { uz: 'Savatni ko‘rish', ru: 'Открыть корзину', en: 'View the cart' },
  empty: { uz: 'Savat bo‘sh', ru: 'Корзина пуста', en: 'The cart is empty' },
  emptySub: {
    uz: 'Restoran tanlang va taom qo‘shing.',
    ru: 'Выберите ресторан и добавьте блюда.',
    en: 'Pick a restaurant and add some dishes.',
  },
  backHome: { uz: 'Restoranlarga', ru: 'К ресторанам', en: 'Back to restaurants' },

  stepAddress: { uz: 'Manzil', ru: 'Адрес', en: 'Address' },
  stepPayment: { uz: 'To‘lov', ru: 'Оплата', en: 'Payment' },
  stepPromo: { uz: 'Promokod', ru: 'Промокод', en: 'Promo code' },
  courierNote: { uz: 'Kuryerga izoh', ru: 'Комментарий курьеру', en: 'Note for the courier' },
  courierNotePh: {
    uz: 'Masalan: qo‘ng‘iroq qilmang, uxlab yotibdi',
    ru: 'Например: не звоните, ребёнок спит',
    en: 'e.g. do not ring the bell, the baby is asleep',
  },

  pay_click: { uz: 'Click', ru: 'Click', en: 'Click' },
  pay_payme: { uz: 'Payme', ru: 'Payme', en: 'Payme' },
  pay_uzum: {
    uz: 'Uzum Bank · bo‘lib to‘lash',
    ru: 'Uzum Bank · рассрочка',
    en: 'Uzum Bank · instalments',
  },
  pay_cash: { uz: 'Naqd · kuryerga', ru: 'Наличными курьеру', en: 'Cash on delivery' },

  summary: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order summary' },
  items: { uz: 'Taomlar', ru: 'Блюда', en: 'Items' },
  delivery: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
  service: {
    uz: 'Xizmat haqi {percent}%',
    ru: 'Сервисный сбор {percent}%',
    en: 'Service charge {percent}%',
  },
  serviceNote: {
    uz: 'Bu marketplace haqi. Restoranning zal xizmat haqi yetkazishda olinmaydi.',
    ru: 'Это сбор маркетплейса. Ресторанный сервисный сбор при доставке не берётся.',
    en: "This is the marketplace's fee. The restaurant's own dine-in service charge is never added to a delivery.",
  },
  total: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  place: { uz: 'Buyurtma berish', ru: 'Заказать', en: 'Place the order' },
  placed: { uz: 'Buyurtma yuborildi', ru: 'Заказ отправлен', en: 'The order is on its way' },
  track: { uz: 'Kuzatish', ru: 'Отслеживать', en: 'Track' },

  step_placed: { uz: 'Buyurtma berildi', ru: 'Заказ оформлен', en: 'Order placed' },
  step_accepted: {
    uz: 'Restoran qabul qildi',
    ru: 'Ресторан принял',
    en: 'The restaurant accepted',
  },
  step_cooking: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Cooking' },
  step_courier: { uz: 'Kuryer yo‘lda', ru: 'Курьер в пути', en: 'The courier is on the way' },
  step_delivered: { uz: 'Yetkazildi', ru: 'Доставлено', en: 'Delivered' },

  courier: { uz: 'Kuryer', ru: 'Курьер', en: 'Courier' },
  deliveries: { uz: '{n} ta yetkazish', ru: '{n} доставок', en: '{n} deliveries' },
  contents: { uz: 'Buyurtma tarkibi', ru: 'Состав заказа', en: 'What you ordered' },
  paidWith: { uz: 'To‘landi', ru: 'Оплачено', en: 'Paid with' },
  helpProblem: {
    uz: 'Buyurtmada muammo',
    ru: 'Проблема с заказом',
    en: 'A problem with the order',
  },
  helpReceipt: { uz: 'Chekni olish', ru: 'Получить чек', en: 'Get a receipt' },
  helpCancel: { uz: 'Bekor qilish', ru: 'Отменить', en: 'Cancel' },
  noOrder: { uz: 'Kuzatiladigan buyurtma yo‘q', ru: 'Нечего отслеживать', en: 'Nothing to track' },

  /**
   * What a screen says when it is drawing the sample rather than live data.
   *
   * Rewritten, because the sentence it held stopped being true: it said the
   * marketplace had no module, no schema and no endpoints, and by then it had
   * all three. A note that explains an absence has to be re-read the day the
   * absence ends — left alone it becomes the most confident wrong thing on the
   * screen, and a reader who checks it against reality stops believing the
   * other notes too.
   *
   * What it says now is what is actually true of a screen showing this: the
   * server did not answer, so these are sample figures. Whether that is because
   * nobody is signed in, because the API is restarting, or because there is
   * nothing to show is deliberately not distinguished — all three mean the same
   * thing to somebody reading a price.
   */
  notWired: {
    uz: 'Server javob bermadi — bu namunaviy ma’lumot. Narx va holat haqiqiy emas.',
    ru: 'Сервер не ответил — это демо-данные. Цены и статусы не настоящие.',
    en: 'The server did not answer, so these are sample figures. Prices and statuses are not real.',
  },

  /* ---- Orders and profile — `Ilova.dc.html:358-440` ---- */

  orders: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
  ordersH: { uz: 'Buyurtmalarim', ru: 'Мои заказы', en: 'My orders' },
  ordersActive: { uz: 'Faol', ru: 'Активные', en: 'Active' },
  ordersHistory: { uz: 'Tarix', ru: 'История', en: 'History' },
  ordersEmpty: {
    uz: 'Bu bo‘limda buyurtma yo‘q',
    ru: 'В этом разделе заказов нет',
    en: 'No orders here',
  },
  rateNote: { uz: 'Bahoni shu yerda qo‘ying', ru: 'Оцените прямо здесь', en: 'Rate it right here' },
  /* The stars write now, and a write can be refused — the order is not
     delivered yet, or it has already been rated once. */
  rateFailed: {
    uz: 'Baho hisobga olinmadi',
    ru: 'Оценка не засчитана',
    en: 'The rating was not counted',
  },
  rateThanks: {
    uz: 'Rahmat — baho yuborildi',
    ru: 'Спасибо — оценка отправлена',
    en: 'Thank you — rating sent',
  },
  state_live: { uz: 'Kuryer yo‘lda', ru: 'Курьер в пути', en: 'On the way' },
  state_delivered: { uz: 'Yetkazildi', ru: 'Доставлен', en: 'Delivered' },
  state_past: { uz: 'Yetkazildi', ru: 'Доставлен', en: 'Delivered' },
  state_cancelled: { uz: 'Bekor qilingan', ru: 'Отменён', en: 'Cancelled' },
  /*
   * How long a live order still has — "Kuryer yo'lda · 9 daqiqa".
   *
   * The design's history row is the state AND the minutes (`Ilova.dc.html`,
   * `status: P("Kuryer yo'lda · 9 daqiqa")`), and the row carried the state
   * alone. `MarketOrderResource` has published `eta_at` all along; the list
   * mapper dropped it, so the one thing a person opens this screen to find out
   * was the one thing it did not say.
   */
  minutesLeft: { uz: '{n} daqiqa', ru: '{n} мин', en: '{n} min' },

  profile: { uz: 'Profil', ru: 'Профиль', en: 'Profile' },
  profileName: { uz: 'Dilnoza Ahmedova', ru: 'Dilnoza Ahmedova', en: 'Dilnoza Ahmedova' },
  profilePhone: { uz: '+998 90 123 45 67', ru: '+998 90 123 45 67', en: '+998 90 123 45 67' },
  row_addresses: { uz: 'Manzillarim', ru: 'Мои адреса', en: 'My addresses' },
  rowNote_addresses: {
    uz: 'Uy, ish · 2 manzil',
    ru: 'Дом, работа · 2 адреса',
    en: 'Home, work · 2 addresses',
  },
  row_payment: { uz: 'To‘lov usullari', ru: 'Способы оплаты', en: 'Payment methods' },
  rowNote_payment: {
    uz: 'Click, Payme · ···4417',
    ru: 'Click, Payme · ···4417',
    en: 'Click, Payme · ···4417',
  },
  row_plus: { uz: 'MyPOS Plus', ru: 'MyPOS Plus', en: 'MyPOS Plus' },
  rowNote_plus: {
    uz: 'Yetkazish bepul · oyiga 39 000 so‘m',
    ru: 'Бесплатная доставка · 39 000 сум в месяц',
    en: 'Free delivery · 39 000 so’m a month',
  },
  row_notifications: { uz: 'Bildirishnomalar', ru: 'Уведомления', en: 'Notifications' },
  rowNote_notifications: {
    uz: 'Buyurtma holati, aksiyalar',
    ru: 'Статус заказа, акции',
    en: 'Order status, offers',
  },
  row_language: { uz: 'Til', ru: 'Язык', en: 'Language' },
  rowNote_language: { uz: 'O‘zbekcha', ru: 'Русский', en: 'English' },
  row_help: { uz: 'Yordam', ru: 'Помощь', en: 'Help' },
  rowNote_help: {
    uz: 'Operator ish vaqtida 2 daqiqada javob beradi',
    ru: 'Оператор отвечает за 2 минуты',
    en: 'An operator replies within 2 minutes',
  },
  profileNote: {
    uz: 'Bu sozlamalar hali serverga yozilmaydi — marketplace moduli yozilmagan.',
    ru: 'Эти настройки пока не сохраняются на сервере — модуль маркетплейса не написан.',
    en: 'These settings are not stored on the server yet — the marketplace module is not written.',
  },

  /* ---- Promo code — `Sayt.dc.html:1288-1296` ---- */

  promoPh: { uz: 'OSH2026', ru: 'OSH2026', en: 'OSH2026' },
  promoApply: { uz: 'Qo‘llash', ru: 'Применить', en: 'Apply' },
  promoApplied: { uz: 'Qo‘llanildi', ru: 'Применён', en: 'Applied' },
  promoEmpty: { uz: 'Promokodni kiriting', ru: 'Введите промокод', en: 'Enter a promo code' },
  promoUnknown: {
    uz: 'Bunday promokod yo‘q yoki muddati o‘tgan',
    ru: 'Промокод не найден или истёк',
    en: 'That code does not exist or has expired',
  },
  promoAlready: {
    uz: 'Promokod allaqachon qo‘llanilgan',
    ru: 'Промокод уже применён',
    en: 'The code is already applied',
  },
  promoOk: {
    uz: 'OSH2026 · 5 000 so‘m chegirma qo‘llanildi',
    ru: 'OSH2026 · скидка 5 000 сум применена',
    en: 'OSH2026 · 5 000 so’m discount applied',
  },
  promoNote: {
    uz: 'Bir buyurtmaga bitta promokod. Aksiya bilan birlashtirilmaydi.',
    ru: 'Один промокод на заказ. Не суммируется с акцией.',
    en: 'One promo code per order. It does not stack with an offer.',
  },
  /**
   * When the order does not go.
   *
   * A fallback only. The API answers every refusal with a code and the sentence
   * in all three languages — "that dish is sold out", "the shop is closed",
   * "your basket is below the minimum" — and the checkout shows THAT rather
   * than this, because a specific reason is what a person can act on. This is
   * what is left when the server could not be reached at all and there is no
   * sentence to show.
   */
  placeFailed: {
    uz: "Buyurtma yuborilmadi. Qayta urinib ko'ring.",
    ru: 'Заказ не отправлен. Попробуйте ещё раз.',
    en: 'The order did not go through. Please try again.',
  },
  placedFlash: {
    uz: 'Buyurtma qabul qilindi · #4471',
    ru: 'Заказ принят · #4471',
    en: 'Order accepted · #4471',
  },
  /*
   * `{store}`, not a name.
   *
   * The design's mock says "the Osh Xona kitchen" because a mock has one shop
   * in it. Printed verbatim on a live cart, that is the demo restaurant's name
   * on somebody else's order — the class of defect `CLAUDE.md` calls out under
   * "jonli ekranda «bo'sh» — bo'sh, fixture emas". `fill()` takes the shop the
   * basket actually belongs to.
   */
  placeNote: {
    uz: 'Buyurtma to‘g‘ridan-to‘g‘ri {store} oshxonasiga tushadi. Tasdiq Telegram orqali keladi.',
    ru: 'Заказ попадает прямо на кухню {store}. Подтверждение придёт в Telegram.',
    en: 'The order lands straight in the {store} kitchen. Confirmation arrives via Telegram.',
  },

  /* ---- Header — `Sayt.dc.html:88-113` ---- */

  pickup: { uz: 'Olib ketish', ru: 'Самовывоз', en: 'Pickup' },
  addrPick: {
    uz: 'Manzilni tanlang',
    ru: 'Выберите адрес',
    en: 'Choose an address',
  },
  whenNow: { uz: 'Hozir', ru: 'Сейчас', en: 'Now' },
  modeDeliv: {
    uz: 'Yetkazish · manzilga kuryer olib boradi',
    ru: 'Доставка · курьер привезёт по адресу',
    en: 'Delivery · a courier brings it to the address',
  },
  modePick: {
    uz: 'Olib ketish · yetkazish narxi olinmaydi',
    ru: 'Самовывоз · доставка не оплачивается',
    en: 'Pickup · no delivery fee is charged',
  },

  /* ---- Discovery: search, verticals, rails — `Sayt.dc.html:105-176, 234-240` ---- */

  filter_sort: {
    uz: 'Saralash: mashhur',
    ru: 'Сортировка: популярные',
    en: 'Sort: popular',
  },
  clearQ: { uz: 'Qidiruvni tozalash', ru: 'Очистить поиск', en: 'Clear the search' },
  noHitsH: { uz: 'Hech narsa topilmadi', ru: 'Ничего не найдено', en: 'Nothing found' },
  /*
   * A directory nobody has joined yet — which is not the same as a filter that
   * matched nothing, and must not borrow that sentence. "Try removing a filter"
   * on a marketplace with zero storefronts sends a guest hunting for a control
   * that would not change anything. Said plainly instead, because a new
   * platform is a normal thing to be.
   */
  emptyDirH: {
    uz: 'Bu yerda hali restoran yo‘q',
    ru: 'Здесь пока нет ресторанов',
    en: 'No restaurants here yet',
  },
  emptyDirP: {
    uz: 'Marketplace hozircha bo‘sh. Yaqin atrofdagi restoranlar qo‘shilishi bilan shu yerda ko‘rinadi.',
    ru: 'Маркетплейс пока пуст. Рестораны появятся здесь, как только подключатся.',
    en: 'The marketplace is empty for now. Restaurants will appear here as they join.',
  },
  noHitsP: {
    uz: 'Boshqa nom yoki oshxona turini kiriting. Yoki kategoriyalardan tanlang.',
    ru: 'Попробуйте другое название или тип кухни. Или выберите из категорий.',
    en: 'Try another name or cuisine. Or pick from the categories.',
  },
  gridHome: { uz: 'Toshkentda tanlanganlar', ru: 'Выбор в Ташкенте', en: 'Featured in Tashkent' },
  gridSearch: { uz: 'Qidiruv natijasi', ru: 'Результаты поиска', en: 'Search results' },
  gridSubHome: {
    uz: 'Toshkentda 412 restoran yetkazib beradi · komissiya 9%, agregatorlarda 18–20%',
    ru: 'В Ташкенте доставляют 412 ресторанов · комиссия 9%, у агрегаторов 18–20%',
    en: '412 restaurants deliver in Tashkent · 9% commission, 18–20% at the aggregators',
  },
  gridSubSearch: {
    uz: '{n} restoran topildi · “{q}”',
    ru: 'Ресторанов найдено: {n} · «{q}»',
    en: '{n} restaurants found · “{q}”',
  },
  seeAllFlash: {
    uz: 'Filtrlar tozalandi · 412 restoran',
    ru: 'Фильтры сброшены · 412 ресторанов',
    en: 'Filters cleared · 412 restaurants',
  },
  railSub_offers: {
    uz: 'Bugun 23:00 gacha · restoran hisobidan',
    ru: 'До 23:00 сегодня · за счёт ресторана',
    en: 'Until 23:00 today · funded by the restaurant',
  },
  railSub_fast: {
    uz: '25 daqiqadan tez · oshxona bandligi hisobga olingan',
    ru: 'Быстрее 25 минут · с учётом загрузки кухни',
    en: 'Under 25 minutes · kitchen load taken into account',
  },
  railSub_top: {
    uz: '100 dan ko‘p baho olgan restoranlar',
    ru: 'Рестораны с более чем 100 оценками',
    en: 'Restaurants with over 100 ratings',
  },

  prev: { uz: 'Orqaga', ru: 'Назад', en: 'Previous' },
  next: { uz: 'Keyingi', ru: 'Вперёд', en: 'Next' },
  closedAt: {
    uz: 'Yopiq · 17:00 da ochiladi',
    ru: 'Закрыто · откроется в 17:00',
    en: 'Closed · opens at 17:00',
  },
  closedFlash: {
    uz: '{name} · hozir yopiq',
    ru: '{name} · сейчас закрыто',
    en: '{name} · closed right now',
  },
  catsLbl: { uz: 'Kategoriyalar', ru: 'Категории', en: 'Categories' },
  soon: { uz: 'Tez orada', ru: 'Скоро', en: 'Soon' },
  offers: { uz: 'Aksiyalar', ru: 'Акции', en: 'Offers' },
  offersFlash: {
    uz: 'Aksiyasi bor do‘konlar ko‘rsatildi',
    ru: 'Показаны магазины с акциями',
    en: 'Showing stores with offers',
  },
  vertical_food: { uz: 'Ovqat', ru: 'Еда', en: 'Food' },
  verticalLive: {
    uz: '{name} · {n} do‘kon',
    ru: '{name} · магазинов: {n}',
    en: '{name} · {n} stores',
  },
  verticalSoon: {
    uz: '{name} · keyingi bosqichda ochiladi · arxitektura tayyor',
    ru: '{name} · откроется на следующем этапе · архитектура готова',
    en: '{name} · opens in the next phase · the architecture is ready',
  },

  /* ---- MyPOS Plus — `Sayt.dc.html:170-175, 757-786` ---- */

  plusH: { uz: 'MyPOS Plus', ru: 'MyPOS Plus', en: 'MyPOS Plus' },
  plusSideNote: {
    uz: 'Yetkazish bepul · oyiga 39 000 so‘m',
    ru: 'Бесплатная доставка · 39 000 сум в месяц',
    en: 'Free delivery · 39 000 so’m a month',
  },
  plusSideNoteOn: {
    uz: 'Yoqilgan · yetkazish bepul, oyiga 39 000 so‘m',
    ru: 'Включён · доставка бесплатно, 39 000 сум в месяц',
    en: 'Active · free delivery, 39 000 so’m a month',
  },
  plusCta: { uz: 'Birinchi oy bepul', ru: 'Первый месяц бесплатно', en: 'First month free' },
  plusSub: {
    uz: 'Oyiga 39 000 so‘m · birinchi oy bepul',
    ru: '39 000 сум в месяц · первый месяц бесплатно',
    en: '39 000 so’m a month · first month free',
  },
  plusStart: {
    uz: 'Birinchi oyni bepul boshlash',
    ru: 'Начать первый месяц бесплатно',
    en: 'Start the free first month',
  },
  plusStop: {
    uz: 'Obunani bekor qilish',
    ru: 'Отменить подписку',
    en: 'Cancel the subscription',
  },
  plusMathOff: {
    uz: 'Oyda 4 martadan ko‘p buyurtma bersangiz foydali. 3 marta bo‘lsa oddiy yetkazish arzonroq.',
    ru: 'Выгодно при более 4 заказов в месяц. При 3 обычная доставка дешевле.',
    en: 'Worth it above four orders a month. At three, paying per delivery is cheaper.',
  },
  plusMathOn: {
    uz: 'Oyda 4 marta buyurtma bersangiz 48 000 so‘m yetkazishga ketardi · 9 000 so‘m tejaldi',
    ru: 'При 4 заказах в месяц доставка стоила бы 48 000 сум · экономия 9 000 сум',
    en: 'Four orders a month would cost 48 000 so’m in delivery · you save 9 000 so’m',
  },
  plusOnFlash: {
    uz: 'MyPOS Plus yoqildi · yetkazish bepul',
    ru: 'MyPOS Plus включён · доставка бесплатно',
    en: 'MyPOS Plus is on · delivery is free',
  },
  plusOffFlash: {
    uz: 'Obuna bekor qilindi · oy oxirigacha ishlaydi',
    ru: 'Подписка отменена · действует до конца месяца',
    en: 'Subscription cancelled · it runs to the end of the month',
  },

  /* ---- Home, lower half — `Sayt.dc.html:214-231, 273-287, 415-448` ---- */

  promoTag_offer: { uz: 'Aksiya', ru: 'Акция', en: 'Offer' },
  promoH_offer: {
    uz: 'Ikkinchi osh 50% arzon',
    ru: 'Второй плов со скидкой 50%',
    en: 'Second plov at half price',
  },
  promoP_offer: {
    uz: 'Osh Xona va Milliy Taomlar · 20-avgustgacha',
    ru: 'Osh Xona и Milliy Taomlar · до 20 августа',
    en: 'Osh Xona and Milliy Taomlar · until 20 August',
  },
  promoCta_offer: { uz: 'Ko‘rish', ru: 'Смотреть', en: 'See it' },
  promoFlash_offer: {
    uz: 'Aksiya filtri yoqildi · 2 restoran',
    ru: 'Фильтр акций включён · 2 ресторана',
    en: 'Offer filter on · 2 restaurants',
  },
  promoTag_plus: { uz: 'MyPOS Plus', ru: 'MyPOS Plus', en: 'MyPOS Plus' },
  promoH_plus: {
    uz: 'Yetkazish bepul, oyiga 39 000 so‘m',
    ru: 'Бесплатная доставка за 39 000 сум в месяц',
    en: 'Free delivery for 39 000 so’m a month',
  },
  promoP_plus: {
    uz: 'Birinchi oy bepul · istalgan vaqt bekor qilinadi',
    ru: 'Первый месяц бесплатно · отмена в любой момент',
    en: 'First month free · cancel any time',
  },
  promoCta_plus: { uz: 'Sinab ko‘rish', ru: 'Попробовать', en: 'Try it' },

  nearH: { uz: 'Yaqin atrofda', ru: 'Рядом с вами', en: 'Near you' },
  nearP: {
    uz: '{address} atrofida 3 km radiusda',
    ru: 'В радиусе 3 км от {address}',
    en: 'Within 3 km of {address}',
  },
  nearPick: {
    uz: 'Manzilni tanlang — yaqin do‘konlar shu yerda ko‘rinadi',
    ru: 'Выберите адрес — ближайшие магазины появятся здесь',
    en: 'Choose an address — the stores near it appear here',
  },

  whyH: { uz: 'Nima uchun MyPOS', ru: 'Почему MyPOS', en: 'Why MyPOS' },
  why1H: {
    uz: 'Buyurtma to‘g‘ridan-to‘g‘ri oshxonaga tushadi',
    ru: 'Заказ попадает прямо на кухню',
    en: 'The order lands straight in the kitchen',
  },
  why1P: {
    uz: 'Restoran allaqachon MyPOS da ishlaydi. Planshet yo‘q, qo‘lda kiritish yo‘q, xato yo‘q.',
    ru: 'Ресторан уже работает в MyPOS. Никакого планшета, ручного ввода и ошибок.',
    en: 'The restaurant already runs MyPOS. No extra tablet, no retyping, no mistakes.',
  },
  why2H: {
    uz: 'Tugagan taom shu zahoti yo‘qoladi',
    ru: 'Закончившееся блюдо исчезает сразу',
    en: 'A sold-out dish disappears at once',
  },
  why2P: {
    uz: 'Stop-list oshxonadan keladi. «Buyurtma berdim, keyin yo‘q ekan» degan holat bo‘lmaydi.',
    ru: 'Стоп-лист приходит с кухни. Не будет «заказал, а его нет».',
    en: 'The stop list comes from the kitchen. No “I ordered it and then it was gone”.',
  },
  why3H: {
    uz: 'Komissiya 9%, 27% emas',
    ru: 'Комиссия 9%, а не 27%',
    en: 'Commission is 9%, not 27%',
  },
  why3P: {
    uz: 'POS obunasi allaqachon to‘langan, shuning uchun marketplace uchun ustama kam.',
    ru: 'Подписка на POS уже оплачена, поэтому наценка на маркетплейс ниже.',
    en: 'The POS subscription is already paid, so the marketplace markup is lower.',
  },
  why4H: {
    uz: 'Uch tilda, so‘mda, Click va Payme bilan',
    ru: 'На трёх языках, в сумах, с Click и Payme',
    en: 'Three languages, in so’m, with Click and Payme',
  },
  why4P: {
    uz: 'Toshkent uchun qilingan — chet el hamyoni va chet el manzil formati emas.',
    ru: 'Сделано для Ташкента — без иностранных кошельков и форматов адреса.',
    en: 'Built for Tashkent — not foreign wallets and foreign address formats.',
  },

  archH: {
    uz: 'Nima uchun 15 kategoriya, lekin ovqat bilan boshlanadi',
    ru: 'Почему 15 категорий, но старт с еды',
    en: 'Why fifteen verticals but a food-only launch',
  },
  archP: {
    uz: 'Dorixonaga litsenziya, alkogolga yosh va vaqt cheklovi, gulga vaqt oynasi kerak. Har biri boshqa qoida va boshqa kuryer. Zichlik yig‘ilgandan keyin kategoriya deyarli tekinga qo‘shiladi.',
    ru: 'Аптеке нужна лицензия, алкоголю — проверка возраста и часы, цветам — временное окно. У каждой свои правила и свой курьер. После набора плотности категория добавляется почти бесплатно.',
    en: 'A pharmacy needs a licence, alcohol needs age checks and hours, flowers need a delivery window. Each carries its own rules and its own courier. Once density is there, a new vertical costs almost nothing.',
  },
  phase_live: {
    uz: '1-bosqich · ovqat, oziq-ovqat, non, ichimlik',
    ru: 'Этап 1 · еда, продукты, выпечка, напитки',
    en: 'Phase 1 · food, grocery, bakery, drinks',
  },
  phaseNote_live: { uz: 'Ishga tushdi', ru: 'Запущено', en: 'Live' },
  phase_licence: {
    uz: '2-bosqich · dorixona, go‘zallik, bolalar',
    ru: 'Этап 2 · аптека, красота, детское',
    en: 'Phase 2 · pharmacy, beauty, baby',
  },
  phaseNote_licence: {
    uz: 'Litsenziya kutilmoqda',
    ru: 'Ожидается лицензия',
    en: 'Licence pending',
  },
  phase_density: {
    uz: '3-bosqich · alkogol, gul, elektronika, qolgani',
    ru: 'Этап 3 · алкоголь, цветы, электроника, остальное',
    en: 'Phase 3 · alcohol, flowers, electronics, the rest',
  },
  phaseNote_density: { uz: 'Zichlikdan keyin', ru: 'После набора плотности', en: 'After density' },

  /* ---- The five sheets — `Sayt.dc.html:724-866` ---- */

  close: { uz: 'Yopish', ru: 'Закрыть', en: 'Close' },
  addrTitle: { uz: 'Yetkazish manzili', ru: 'Адрес доставки', en: 'Delivery address' },
  addrSub: {
    uz: 'Saqlangan manzillar · yetkazish narxi masofaga qarab o‘zgaradi',
    ru: 'Сохранённые адреса · стоимость доставки зависит от расстояния',
    en: 'Saved addresses · the fee depends on the distance',
  },
  addrNewL: { uz: 'Yangi manzil qo‘shish', ru: 'Добавить новый адрес', en: 'Add a new address' },
  addrPh: {
    uz: 'Ko‘cha, uy, podyezd, xonadon',
    ru: 'Улица, дом, подъезд, квартира',
    en: 'Street, building, entrance, flat',
  },
  addrAdd: {
    uz: 'Qo‘shish va xaritada aniqlashtirish',
    ru: 'Добавить и уточнить на карте',
    en: 'Add and pin on the map',
  },
  addrAdded: {
    uz: 'Manzil qo‘shildi · xaritada aniqlashtirish tavsiya etiladi',
    ru: 'Адрес добавлен · уточните на карте',
    en: 'Address added · pin it on the map to be sure',
  },
  addrTypeIt: { uz: 'Manzilni yozing', ru: 'Введите адрес', en: 'Type the address' },
  /* Said when the platform refuses and has no sentence of its own — the sheet
     writes for real now, so a refusal has to be reportable. */
  addrFailed: {
    uz: 'Manzil saqlanmadi · qaytadan urinib ko‘ring',
    ru: 'Адрес не сохранён · попробуйте ещё раз',
    en: 'The address was not saved · try again',
  },
  /* The three order sheets write too, and each can be refused: the ladder has
     moved past cancelling, the order is not delivered yet, a complaint is
     already open. */
  orderActionFailed: {
    uz: 'Bajarilmadi · qaytadan urinib ko‘ring',
    ru: 'Не выполнено · попробуйте ещё раз',
    en: 'That did not go through · try again',
  },
  addrOutside: {
    uz: 'Bu manzil yetkazish zonasidan tashqarida · olib ketish mumkin',
    ru: 'Этот адрес вне зоны доставки · доступен самовывоз',
    en: 'That address is outside the delivery zone · pickup is available',
  },

  infoSub: {
    uz: 'Do‘kon haqida',
    ru: 'О магазине',
    en: 'About the store',
  },
  infoNote: {
    uz: 'Ma’lumot do‘konning POS tizimidan o‘qiladi · ish vaqti o‘zgarsa shu zahoti yangilanadi',
    ru: 'Данные читаются из POS магазина · при смене часов обновляется сразу',
    en: 'The data comes from the store’s POS · a change in hours shows at once',
  },
  shopInfo: { uz: 'Do‘kon haqida', ru: 'О магазине', en: 'Store info' },

  probTitle: { uz: 'Buyurtmada muammo', ru: 'Проблема с заказом', en: 'Something is wrong' },
  probSub: {
    uz: '#4471 · Osh Xona · bugun 11:24',
    ru: '#4471 · Osh Xona · сегодня 11:24',
    en: '#4471 · Osh Xona · today 11:24',
  },
  probGo: { uz: 'Yuborish', ru: 'Отправить', en: 'Send it' },
  probPick: { uz: 'Muammoni tanlang', ru: 'Выберите проблему', en: 'Pick the problem' },
  probNote: {
    uz: 'Kichik summalar avtomatik qaytariladi. Katta summada do‘kon javob beradi va operator kuzatib turadi.',
    ru: 'Небольшие суммы возвращаются автоматически. По крупным отвечает магазин, оператор контролирует.',
    en: 'Small amounts refund automatically. Larger ones go to the store with an operator watching.',
  },
  probAuto: {
    uz: 'Qaytarish tasdiqlandi · pul 1–3 kunda Click hisobiga qaytadi',
    ru: 'Возврат подтверждён · деньги вернутся на Click за 1–3 дня',
    en: 'Refund approved · the money returns to Click in 1–3 days',
  },
  probManual: {
    uz: 'So‘rov yuborildi · do‘kon 2 soatda javob beradi, operator kuzatadi',
    ru: 'Обращение отправлено · магазин ответит за 2 часа, оператор следит',
    en: 'Sent · the store answers within 2 hours and an operator watches it',
  },
  receiptFlash: {
    uz: 'Chek Telegram va pochtaga yuboriladi',
    ru: 'Чек отправляется в Telegram и на почту',
    en: 'The receipt goes to Telegram and email',
  },

  cxTitle: { uz: 'Buyurtmani bekor qilish', ru: 'Отменить заказ', en: 'Cancel the order' },
  cxSub: {
    uz: 'Kuryer yo‘lda · taomlar tayyorlangan',
    ru: 'Курьер в пути · блюда приготовлены',
    en: 'The courier is en route · the food is cooked',
  },
  cxGo: { uz: 'Operatorga yuborish', ru: 'Отправить оператору', en: 'Send to an operator' },
  cxKeep: { uz: 'Qoldirish', ru: 'Оставить', en: 'Keep it' },
  cxSent: {
    uz: 'So‘rov operatorga yuborildi · 2 daqiqada qo‘ng‘iroq qiladi',
    ru: 'Обращение отправлено оператору · позвонит через 2 минуты',
    en: 'Sent to an operator · they will call within 2 minutes',
  },

  call: { uz: 'Qo‘ng‘iroq', ru: 'Позвонить', en: 'Call' },
  msg: { uz: 'Xabar', ru: 'Сообщение', en: 'Message' },
  callFlash: {
    uz: 'Qo‘ng‘iroq · raqamingiz kuryerga ko‘rinmaydi',
    ru: 'Звонок · ваш номер курьеру не виден',
    en: 'Calling · the courier never sees your number',
  },
  msgFlash: {
    uz: 'Xabar yuborildi · kuryer to‘xtaganda o‘qiydi',
    ru: 'Сообщение отправлено · курьер прочитает на остановке',
    en: 'Message sent · the courier reads it when stopped',
  },
  helpH: { uz: 'Yordam', ru: 'Помощь', en: 'Help' },

  /* ---- Loyalty — `Ilova.dc.html:404-424` ---- */

  pointsLbl: { uz: 'Ball qoldig‘i', ru: 'Баланс баллов', en: 'Points balance' },
  tier: { uz: 'Kumush', ru: 'Серебро', en: 'Silver' },
  tierNote: {
    uz: 'Oltin darajaga 1 160 ball qoldi',
    ru: 'До золотого уровня осталось 1 160 баллов',
    en: '1 160 points to the gold tier',
  },
  stat_orders: { uz: 'Buyurtmalar', ru: 'Заказов', en: 'Orders' },
  stat_spent: { uz: 'Jami sarflangan', ru: 'Всего потрачено', en: 'Total spent' },
  stat_average: { uz: 'O‘rtacha chek', ru: 'Средний чек', en: 'Average order' },
  stat_saved: { uz: 'Tejalgan', ru: 'Сэкономлено', en: 'Saved' },

  /* ============================================================
     The native app — `MyPOS Marketplace - Ilova.dc.html`

     The website and the phone app are the same product and share every word
     above. These are the ones only the app says, because only the app has the
     shape that needs them: a header that is one line rather than a nav bar, a
     back button over a photograph, a quantity stepper, a five-star strip you
     press with a thumb.

     Every number inside them is a placeholder — `{window}`, `{time}`, `{n}` —
     rather than a figure typed into the sentence. The design writes "25–35" and
     "11:38" literally; a phrase with the number baked in is a phrase that goes
     stale the first time the kitchen gets slower, and three languages means
     three places it goes stale.
     ============================================================ */

  allChip: { uz: 'Hammasi', ru: 'Все', en: 'All' },
  /* `stepPayment` names a step of a wizard; this names a group of four radio
     rows, which is a different sentence in Russian and in English. */
  payLbl: { uz: 'To‘lov usuli', ru: 'Способ оплаты', en: 'Payment method' },
  addrNote: {
    uz: 'Toshkent · hozir yetkazish {window}',
    ru: 'Ташкент · доставка сейчас {window}',
    en: 'Tashkent · delivery now {window}',
  },
  storeCount: { uz: '{n} do‘kon', ru: 'магазинов: {n}', en: '{n} stores' },
  openUntil: {
    uz: 'Ochiq · 23:00 gacha',
    ru: 'Открыто · до 23:00',
    en: 'Open · until 23:00',
  },
  /* `prev` says "Previous" in English, which a back arrow does not mean. */
  back: { uz: 'Orqaga', ru: 'Назад', en: 'Back' },
  less: { uz: 'Bittaga kamaytirish', ru: 'Убрать одну', en: 'One fewer' },
  more: { uz: 'Bittaga oshirish', ru: 'Добавить одну', en: 'One more' },
  star: { uz: '{n} yulduz', ru: '{n} звёзд', en: '{n} stars' },

  payNote_click: {
    uz: 'Ilova ichida to‘lanadi',
    ru: 'Оплата внутри приложения',
    en: 'Paid inside the app',
  },
  payNote_payme: {
    uz: 'Saqlangan karta · ···4417',
    ru: 'Сохранённая карта · ···4417',
    en: 'Saved card · ···4417',
  },
  payNote_uzum: {
    uz: 'Bo‘lib to‘lash mumkin',
    ru: 'Можно в рассрочку',
    en: 'Instalments available',
  },
  payNote_cash: {
    uz: 'Chaqa tayyorlab turing',
    ru: 'Подготовьте сдачу',
    en: 'Have change ready',
  },

  /* VAT is *inside* the price and this sentence is what says so. A guest who
     reads "VAT 12%" as a line to be added checks the arithmetic and finds it
     wrong — `money/pricing.ts` extracts it, never adds it. */
  vatIn: {
    uz: 'Narx ichida QQS {percent}% bor',
    ru: 'В цене уже есть НДС {percent}%',
    en: 'VAT {percent}% is already in the price',
  },

  orderNo: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order' },
  etaH: { uz: '{time} ga yetkaziladi', ru: 'Доставим к {time}', en: 'Arriving by {time}' },
  etaP: {
    uz: 'Kuryer {km} masofada · taxminan {n} daqiqa',
    ru: 'Курьер в {km} · примерно {n} минут',
    en: 'The courier is {km} away · about {n} minutes',
  },
  mapSlot: {
    uz: 'Xarita · kuryer yo‘li',
    ru: 'Карта · маршрут курьера',
    en: 'Map · the courier’s route',
  },
} as const satisfies Section;

export const t = (key: keyof typeof MP, lang: Lang): string => MP[key][lang];

export const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

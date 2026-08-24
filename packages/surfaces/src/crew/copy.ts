/**
 * Everything the staff app says, in three languages.
 *
 * **This file is a staging post, not its final home.** Catalogues live in
 * `apps/web/src/i18n`, which this session does not own, so the copy is written
 * here in the shape that file wants and handed over as one group. When it
 * lands, every section below becomes a namespace under `crew` and this module
 * collapses to a re-export — no call site changes, because they already read
 * through `copy()` rather than reaching into the object.
 *
 * Two rules decide what is allowed in here.
 *
 * **Copy, never data.** A dish name, a branch name, a supplier and the currency
 * word are content a restaurant owns; they are in `crew-data.ts` as `{uz, ru,
 * en}` columns. What is here is interface text — the things the product says,
 * which no restaurant edits.
 *
 * **No key whose three languages are identical.** `i18n.test.ts` rejects those
 * and it is right to: a row that reads the same in all three is data wearing a
 * catalogue key, and it will be edited in the wrong place by whoever finds it
 * first. "ZAL", "POS-3" and "so'm" are the ones that catch people out here —
 * all three are in `crew-data.ts`.
 *
 * The Uzbek is the authoring language and the other two are written, not
 * machine-translated: Russian is neutral-professional, English is the most
 * concise of the three, per START-HERE §6. Where a line exists in the design
 * file it is taken verbatim, so a reviewer can diff it against the prototype.
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
 * keeps the keys, so a typo in a key name is a compile error — which is the
 * whole benefit a catalogue has over inline strings.
 */
/**
 * Fill the `{placeholders}` a catalogue line carries.
 *
 * The catalogue is written with them — `'{minutes} daqiqadan keyin'` — because
 * a sentence with a number in the middle cannot be assembled by concatenation
 * in three languages: Russian puts the count before a genitive plural, Uzbek
 * after a bare noun, English before a plural. One template per language, filled
 * here.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce<string>(
    (line, [key, value]) => line.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

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
  /* The dock's search pill — `Xodimlar:1021` draws it between the second and
     third slot and calls it `mf.searchLbl`. */
  /* Day and night, in the same words the customer app uses — `customer/copy.ts`
     says Kun · Tun · Tizim, and two surfaces of one product calling the same
     control two things is how a person learns to distrust both. */
  appearance: { uz: "Ko'rinish", ru: 'Оформление', en: 'Appearance' },
  themeLight: { uz: 'Kun', ru: 'День', en: 'Light' },
  themeDark: { uz: 'Tun', ru: 'Ночь', en: 'Dark' },
  themeSystem: { uz: 'Tizim', ru: 'Система', en: 'System' },
  /* Why it is offered at all, said once. A waiter's phone is held in a dim
     dining room at nine and under a service-pass light at noon. */
  appearanceNote: {
    uz: "Zal qorong'i bo'lsa — tun rejimi",
    ru: 'В тёмном зале — ночной режим',
    en: 'A dark room reads better at night',
  },
  search: { uz: 'Qidirish', ru: 'Поиск', en: 'Search' },
  searchPlaceholder: {
    uz: 'Taom yoki stol',
    ru: 'Блюдо или стол',
    en: 'A dish or a table',
  },
  /* What it can reach, said out loud. A field that silently searches two of
     the four things somebody expects is a field they stop trusting. */
  searchScope: {
    uz: 'Menyu va stollar bo‘yicha',
    ru: 'По меню и столам',
    en: 'Across the menu and the tables',
  },
  searchNothing: {
    uz: 'Hech narsa topilmadi',
    ru: 'Ничего не найдено',
    en: 'Nothing found',
  },
  /* When neither read answered. Not `notWired` — that sentence is about a
     queued write ("your answer stays on this phone"), and a search writes
     nothing; a person reading it would wait for a sync that is never coming. */
  searchOffline: {
    uz: 'Server javob bermadi — qidiruv hozircha ishlamaydi',
    ru: 'Сервер не ответил — поиск пока недоступен',
    en: 'The server did not answer — search is unavailable for now',
  },
  searchDishes: { uz: 'Taomlar', ru: 'Блюда', en: 'Dishes' },
  searchTables: { uz: 'Stollar', ru: 'Столы', en: 'Tables' },
  back: { uz: 'Orqaga', ru: 'Назад', en: 'Back' },
  total: { uz: 'Jami', ru: 'Итого', en: 'Total' },
  open: { uz: 'Ochish', ru: 'Открыть', en: 'Open' },
  soldOut: { uz: 'Tugadi', ru: 'Закончилось', en: 'Sold out' },
  appName: {
    uz: 'Xodimlar ilovasi',
    ru: 'Приложение для сотрудников',
    en: 'Staff app',
  },
  mainMenu: { uz: 'Asosiy menyu', ru: 'Главное меню', en: 'Main menu' },
  account: { uz: 'Akkaunt', ru: 'Аккаунт', en: 'Account' },
  /**
   * The disclosure that goes on any screen whose buttons change something.
   *
   * There is no staff-app API yet, so an approval marked here never reaches the
   * waiter who asked for it. Saying so above the buttons rather than after them
   * is the whole point: a manager who declines a discount and walks away
   * believing the waiter was told is worse off than one who never opened the
   * screen.
   */
  notWired: {
    uz: 'Bu ekran hali serverga ulanmagan — javobingiz shu telefonda qoladi.',
    ru: 'Экран ещё не подключён к серверу — ваш ответ останется на этом телефоне.',
    en: 'This screen is not wired to the server yet — your answer stays on this phone.',
  },
  /**
   * What replaces `notWired` on a screen that does reach the server.
   *
   * The two are not interchangeable and putting the wrong one up is worse than
   * putting up neither. `notWired` promises nothing left the phone; this one
   * promises it will, and the difference is what a person decides on — whether
   * to walk to a tablet and do the thing again. So a screen shows this only
   * once its buttons actually queue something `POST /staff/actions` accepts.
   */
  queued: {
    uz: 'Amal navbatga tushdi — aloqa tiklanganda o‘zi ketadi.',
    ru: 'Действие в очереди — уйдёт само, когда вернётся связь.',
    en: 'Queued — it sends itself as soon as the connection is back.',
  },
  /**
   * The row a fixture screen cannot send, said where the button is.
   *
   * A demo row carries no database id, and an entry with an invented one is
   * worse than one that waits: the server would refuse it, and the person would
   * be told their work did not land when in fact it was never theirs to send.
   */
  demoRow: {
    uz: 'Namunaviy qator — serverga yuborilmaydi.',
    ru: 'Демонстрационная строка — на сервер не уходит.',
    en: 'Sample row — nothing is sent to the server.',
  },

  /*
   * The four sentences a live form needs and a fixture one never did.
   *
   * `emptyShelf` and the two beside it are honest-empty states, not errors: a
   * restaurant that has registered no ingredients, a rota with nothing
   * published, a rider with no drops. Before these existed the forms had one
   * answer for "the server said nothing" and "the server said none", and the
   * second is the one somebody acts on.
   */
  emptyShelf: {
    uz: "Omborda hech narsa yo'q — avval ingredient qo'shing.",
    ru: 'На складе ничего нет — сначала добавьте ингредиенты.',
    en: 'Nothing is on the shelf yet — add ingredients first.',
  },
  emptyShifts: {
    uz: "E'lon qilingan yaqin smenangiz yo'q.",
    ru: 'У вас нет опубликованных ближайших смен.',
    en: 'You have no published shifts coming up.',
  },
  emptyDrops: {
    uz: "Sizda ochiq yetkazish yo'q.",
    ru: 'У вас нет открытых доставок.',
    en: 'You have no open deliveries.',
  },
  sendFailed: {
    uz: "Yuborilmadi — qayta urinib ko'ring.",
    ru: 'Не отправлено — попробуйте ещё раз.',
    en: 'Not sent — try again.',
  },
} as const satisfies Section;

/* ============================================================
   What the app says back — the design's `flash()`, transcribed

   The prototype calls `flash()` forty-five times in this file alone, and it is
   not a garnish: it is the only place several of these screens say *the thing
   you pressed happened*. A stepper that moves and a button that dims are both
   ambiguous on a phone held at arm's length in a service corridor.

   Every line below is the design's own sentence, verbatim, including the ones
   that name what happens next — "scan the lines", "the cashier has been
   notified", "awaiting approval". That is deliberate on the design's part: a
   confirmation that only says "saved" leaves the reader to guess whether
   anybody else knows.

   `{n}` is filled with `fill()`. Nothing here is composed from fragments — a
   sentence assembled out of three catalogue keys reads like one in exactly one
   of the three languages.
   ============================================================ */

export const FLASH = {
  /* Shift and session */
  shiftStarted: { uz: 'Smena ochildi · ', ru: 'Смена открыта · ', en: 'Shift started · ' },
  signedOut: {
    uz: 'Chiqildi · smena yopilmadi',
    ru: 'Выход · смена не закрыта',
    en: 'Signed out · the shift is still open',
  },

  /* Manager — the approval queue */
  approved: {
    uz: 'Tasdiqlandi · xodimga xabar yuborildi',
    ru: 'Согласовано · сотрудник уведомлён',
    en: 'Approved · the employee has been notified',
  },
  declined: {
    uz: "Rad etildi · sabab so'raladi",
    ru: 'Отклонено · будет запрошена причина',
    en: 'Declined · a reason will be requested',
  },

  /* Waiter — calls, the floor and a table */
  callMarked: { uz: 'Belgilandi', ru: 'Отмечено', en: 'Marked done' },
  amountsShown: {
    uz: "Summalar ochildi · boshqa xodim ko'rmasin",
    ru: 'Суммы открыты · не показывайте другим',
    en: "Amounts shown · keep them off other people's screens",
  },
  billPrinted: {
    uz: 'Hisob chop etildi · kassirga xabar ketdi',
    ru: 'Счёт напечатан · кассир уведомлён',
    en: 'Bill printed · the cashier has been notified',
  },
  discountAsked: {
    uz: "So'rov menejerga yuborildi · tasdiq kutilmoqda",
    ru: 'Запрос отправлен менеджеру · ожидается согласование',
    en: 'Sent to the manager · awaiting approval',
  },
  transferElsewhere: {
    uz: "Ko'chirish planshet POS da bajariladi",
    ru: 'Перенос выполняется на планшете POS',
    en: 'Transfers are done on the tablet POS',
  },
  orderSent: {
    uz: 'Oshxonaga yuborildi · {n} pozitsiya',
    ru: 'Отправлено на кухню · {n} позиций',
    en: 'Sent to kitchen · {n} items',
  },

  /* Storekeeper — receiving, counting, the scanner */
  receivingStarted: {
    uz: 'Qabul boshlandi · pozitsiyalarni skanerlang',
    ru: 'Приёмка начата · сканируйте позиции',
    en: 'Receiving started · scan the lines',
  },
  countSaved: {
    uz: 'Sanoq saqlandi · farq menejerga yuborildi',
    ru: 'Пересчёт сохранён · расхождение отправлено менеджеру',
    en: 'Count saved · the variance has been sent to the manager',
  },
  scanFound: { uz: 'Topildi: ', ru: 'Найдено: ', en: 'Found: ' },
  scanSaved: {
    uz: '{n} pozitsiya qabul qilindi',
    ru: '{n} позиций принято',
    en: '{n} lines received',
  },
  wasteRecorded: {
    uz: 'Chiqindi qayd etildi · ombordan yechildi',
    ru: 'Списание оформлено · снято со склада',
    en: 'Waste recorded · deducted from stock',
  },
  needsQuantity: {
    uz: 'Avval miqdorni kiriting',
    ru: 'Сначала укажите количество',
    en: 'Enter a quantity first',
  },
  purchaseSent: {
    uz: "Buyurtma Farg'ona Meat ga yuborildi",
    ru: 'Заказ отправлен Farg’ona Meat',
    en: "Order sent to Farg'ona Meat",
  },
  /*
   * The live twin of the line above, and it names nobody.
   *
   * `purchaseSent` carries the design's supplier — "Farg'ona Meat" — which is
   * the right sentence for the demo sheet and a lie on a real one: the order
   * goes to whichever supplier the storekeeper picked. It also says *sent*, and
   * a phone raises a **draft**; the person who decides this restaurant buys
   * twenty-five kilos of lamb is a manager looking at a bank balance.
   */
  purchaseRaised: {
    uz: 'Xarid arizasi tuzildi — menejer tasdiqlaydi',
    ru: 'Заявка на закупку создана — подтверждает менеджер',
    en: 'Purchase request raised — a manager confirms it',
  },

  /* Courier */
  dropPicked: {
    uz: "Olindi · yo'nalish yangilandi",
    ru: 'Забрано · маршрут обновлён',
    en: 'Picked up · the route has been updated',
  },
  dropDelivered: {
    uz: "Yetkazildi · mijozga baho so'rovi yuborildi",
    ru: 'Доставлено · гостю отправлен запрос оценки',
    en: 'Delivered · a rating request has been sent to the guest',
  },
  cashHandedIn: {
    uz: 'Kassirga topshirildi · tasdiq kutilmoqda',
    ru: 'Сдано кассиру · ожидается подтверждение',
    en: 'Handed to the cashier · awaiting confirmation',
  },
  handbackSent: {
    uz: 'Operatorga yuborildi · buyurtma navbatga qaytdi',
    ru: 'Отправлено оператору · заказ вернулся в очередь',
    en: 'Sent to the operator · the order is back in the queue',
  },
  /*
   * Said by the four More forms that cannot yet reach the server.
   *
   * Waste, a purchase request, a shift swap and a hand-back all draw the
   * design's own rows — `w1`, `p1`, a shift with no id — so there is no
   * `ingredient_id`, `purchase_order_id` or `shift_id` to put in a payload, and
   * an invented one would write against somebody else's row. The native build
   * used to queue them anyway with no verb: `drain()` counted them
   * `unsendable`, the phone showed them "pending sync" for ever, and the work
   * disappeared when the app was killed because that queue is in memory only.
   *
   * So nothing is queued and nothing claims to have been sent. What the forms
   * do is real as far as it goes — the reason and the quantities are on screen
   * for whoever is standing there — and the sentence says exactly that.
   */
  notRecorded: {
    uz: 'Bu telefonda belgilandi — serverga hali yuborilmaydi',
    ru: 'Отмечено на этом телефоне — на сервер пока не уходит',
    en: 'Noted on this phone — not sent to the server yet',
  },
  handbackNeedsReason: {
    uz: 'Avval sababni tanlang',
    ru: 'Сначала выберите причину',
    en: 'Pick a reason first',
  },
  /* Both figures parameterised. It reported eight deliveries and 96 000 so'm to
     every courier — the last thing a rider reads before handing money over. */
  courierShiftClosed: {
    uz: "Smena yopildi · {n} yetkazish · {amount} so'm",
    ru: 'Смена закрыта · {n} доставок · {amount} сум',
    en: "Shift closed · {n} deliveries · {amount} so'm",
  },
  dropsStillOpen: {
    uz: '{n} ta buyurtma hali yopilmagan',
    ru: '{n} заказов ещё не закрыто',
    en: '{n} orders are still open',
  },
  cashFirst: {
    uz: 'Avval naqd topshirilishi kerak',
    ru: 'Сначала нужно сдать наличные',
    en: 'The cash must be handed in first',
  },

  /* Manager — closing the shift */
  stepDone: { uz: 'Bajarildi', ru: 'Выполнено', en: 'Done' },
  shiftClosed: {
    uz: 'Smena yopildi · Z-hisobot chop etildi',
    ru: 'Смена закрыта · Z-отчёт напечатан',
    en: 'Shift closed · Z report printed',
  },
  conditionsFirst: {
    uz: 'Avval barcha shartlar bajarilishi kerak',
    ru: 'Сначала нужно выполнить все условия',
    en: 'All conditions must be met first',
  },

  /* Waiter — the shift swap */
  swapSent: {
    uz: "So'rov yuborildi · hamkasb va menejer tasdig'i kerak",
    ru: 'Запрос отправлен · нужно согласие коллеги и менеджера',
    en: 'Request sent · the colleague and the manager must both agree',
  },
  swapNeedsBoth: {
    uz: 'Smenani va hamkasbni tanlang',
    ru: 'Выберите смену и коллегу',
    en: 'Pick a shift and a colleague',
  },

  /* More — the row that is deliberately not on a phone */
  desktopOnly: {
    uz: 'Kompyuterdagi tizimda ochiladi',
    ru: 'Откроется в системе на компьютере',
    en: 'Opens in the desktop system',
  },

  /* The offline queue */
  queueSent: {
    uz: '{n} amal yuborildi',
    ru: '{n} действий отправлено',
    en: '{n} actions sent',
  },
} as const satisfies Section;

/* ============================================================
   The state ladder, in the words a waiter reads

   One row, three audiences — the kitchen, the waiter and the guest each read a
   different word for the same stored key. These are the waiter's words. The
   guest's live on the guest surface and the kitchen's on the KDS; storing the
   word instead of the key is what let an earlier version of this design grow
   two ladders that drifted inside a week.
   ============================================================ */

export const TABLE_STATE = {
  occupied: { uz: 'Band', ru: 'Занят', en: 'Occupied' },
  'awaiting-payment': { uz: "To'lov kutmoqda", ru: 'Ждёт оплаты', en: 'Awaiting payment' },
  free: { uz: "Bo'sh", ru: 'Свободен', en: 'Available' },
  reserved: { uz: 'Bandlangan', ru: 'Забронирован', en: 'Reserved' },
} as const satisfies Section;

export const LINE_STATE = {
  served: { uz: 'Berildi', ru: 'Подано', en: 'Served' },
  cooking: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Cooking' },
  /*
   * The only line state that asks for something. A plate under the lamp is
   * losing quality by the second, so the label says what to do rather than what
   * happened — this is the single most valuable push in the whole ecosystem and
   * a neutral "Ready" wastes it.
   */
  ready: {
    uz: 'Tayyor · olib borish kerak',
    ru: 'Готово · нужно забрать',
    en: 'Ready · collect it',
  },
} as const satisfies Section;

/* ============================================================
   PIN entry
   ============================================================ */

export const PIN = {
  heading: { uz: 'Smena boshlanishi', ru: 'Начало смены', en: 'Start of shift' },
  /** The four cells are one field to a screen reader, and this names it. */
  fieldLabel: { uz: 'To‘rt raqamli PIN', ru: 'PIN из четырёх цифр', en: 'Four-digit PIN' },
  clear: { uz: 'Tozalash', ru: 'Очистить', en: 'Clear' },
  backspace: { uz: "O'chirish", ru: 'Стереть', en: 'Delete' },
  submitting: { uz: 'Tekshirilmoqda…', ru: 'Проверяем…', en: 'Checking…' },
  /*
   * What a person is told when the phone itself is the problem.
   *
   * `missing*` used to say the sign-in service was unwritten, which was true
   * and is not any more. What replaced it is the state that actually happens:
   * a handset nobody has enrolled, or one whose enrolment a manager replaced
   * because it was lost. Both need a manager and neither is a wrong PIN, so
   * neither may burn one of the three attempts.
   */
  notEnrolledTitle: {
    uz: 'Bu telefon ro‘yxatdan o‘tmagan',
    ru: 'Этот телефон не зарегистрирован',
    en: 'This phone has not been enrolled',
  },
  notEnrolledBody: {
    uz: 'Menejerdan sakkiz belgili kod so‘rang va uni quyida kiriting.',
    ru: 'Попросите у менеджера код из восьми символов и введите его ниже.',
    en: 'Ask a manager for an eight-character code and type it below.',
  },
  /*
   * The line above the keypad when the handset cannot name itself.
   *
   * It replaced a fixture that named the demo's branch and till — "Chilonzor
   * filiali · POS-3" — on every phone in the country. The line exists so a
   * person can check they are in the right back office before typing; a line
   * that is right for one restaurant and wrong for all the others is the one
   * place on this screen where saying nothing would have been better.
   */
  terminalUnknown: {
    uz: 'Bu telefon hali ulanmagan',
    ru: 'Этот телефон ещё не привязан',
    en: 'This phone is not enrolled yet',
  },
  enrolLabel: { uz: 'Ulash kodi', ru: 'Код привязки', en: 'Pairing code' },
  enrolSubmit: { uz: 'Telefonni ulash', ru: 'Привязать телефон', en: 'Enrol this phone' },
  enrolWorking: { uz: 'Ulanmoqda…', ru: 'Привязываем…', en: 'Enrolling…' },
  enrolFailed: {
    uz: 'Kod noto‘g‘ri yoki muddati tugagan. Menejerdan yangisini so‘rang.',
    ru: 'Код неверен или истёк. Попросите у менеджера новый.',
    en: 'That code is wrong or has expired. Ask a manager for a new one.',
  },
  /*
   * The server's own lockout, which is not the same as this screen's three
   * attempts. This one counts wrong entries on this handset; that one counts
   * them across every surface the person's PIN opens — the till included — and
   * it is the number that actually shuts the door. The wait comes back in
   * minutes so it can be said in the reader's own language.
   */
  lockedServer: {
    uz: 'PIN vaqtincha bloklandi · {minutes} daqiqadan keyin urinib ko‘ring',
    ru: 'PIN временно заблокирован · попробуйте через {minutes} мин',
    en: 'The PIN is locked · try again in {minutes} min',
  },
  rejected: { uz: 'PIN to‘g‘ri kelmadi', ru: 'Неверный PIN', en: 'That PIN did not match' },
  /*
   * A role this app has no workspace for — a cashier, a cook.
   *
   * Their surface is the till or the kitchen screen, and dropping them onto a
   * waiter's tables would show them somebody else's section. Said plainly
   * rather than defaulted; `roles.ts` makes the same call for the console.
   */
  noSurface: {
    uz: 'Bu lavozim uchun ilovada ekran yo‘q · kassadan foydalaning',
    ru: 'Для этой должности в приложении нет экрана · работайте на кассе',
    en: 'This role has no screen in the app · use the till',
  },
  unreachable: {
    uz: 'Tarmoq javob bermadi. Qayta urinib ko‘ring.',
    ru: 'Сеть не ответила. Попробуйте ещё раз.',
    en: 'The network did not answer. Try again.',
  },
  /*
   * Three wrong attempts and the person has to find a manager. The lockout is
   * what does the work a four-digit secret cannot: a PIN typed on a screen a
   * whole dining room can see is weak by design, and the count is the only
   * thing standing between that and someone else's discount authority.
   */
  lockedOut: {
    uz: 'Uch marta xato · menejer PIN ni tiklashi kerak',
    ru: 'Три ошибки · менеджер должен сбросить PIN',
    en: 'Three failures · the manager must reset the PIN',
  },
} as const satisfies Section;

/* ============================================================
   The lock screen
   ============================================================ */

export const LOCK = {
  title: { uz: 'Qulflangan', ru: 'Заблокировано', en: 'Locked' },
  /*
   * The date under the clock, as each language writes it.
   *
   * A template rather than a formatted string, because `Intl.DateTimeFormat`
   * cannot be trusted for this one: several runtimes carry no Uzbek Latin month
   * names and quietly answer in English, and a lock screen exists to be glanced
   * at — a language change there is one nobody reports. The words come from
   * `MONTHS` and `WEEKDAYS` in `crew/data.ts`; only the joining differs, and it
   * differs enough to need saying: Uzbek hyphenates the day to the month.
   */
  date: {
    uz: '{weekday}, {day}-{month}',
    ru: '{weekday}, {day} {month}',
    en: '{weekday}, {day} {month}',
  },
  unlock: { uz: 'PIN bilan ochish', ru: 'Открыть по PIN', en: 'Unlock with a PIN' },
  note: {
    uz: 'Bildirishnoma turi rolga qarab o‘zgaradi. Tugmani bosish ilovani o‘sha ekranda ochadi.',
    ru: 'Тип уведомления зависит от роли. Кнопка открывает приложение на нужном экране.',
    en: 'The notification type follows the role. A button opens the app at that screen.',
  },
  /*
   * A web page cannot complete a notification action the way a phone's own
   * lock screen does — there is no notification service behind this, and no
   * session to act with. So each button navigates to the screen where the
   * answer is actually given, and says so once, here, rather than lying four
   * times on four cards.
   */
  actionNote: {
    uz: 'Javob ilovada beriladi — tugma o‘sha joyga olib boradi.',
    ru: 'Ответ даётся в приложении — кнопка ведёт туда.',
    en: 'The answer is given in the app — the button takes you there.',
  },
} as const satisfies Section;

/* ============================================================
   Today
   ============================================================ */

export const TODAY = {
  /* What is not real, named. A reader told only that something is a sample
     does not know which half of the screen to trust. */
  demoFigures: {
    uz: 'Namunaviy raqamlar — server javob bermadi',
    ru: 'Демо-цифры — сервер не ответил',
    en: 'Demo figures — the server did not answer',
  },
  /*
   * The hero line, said about the place the reader actually has.
   *
   * The fixture's own label reads "Bugungi tushum · 5 filial" — a branch count
   * belonging to the demo restaurant — and it was rendered on every owner's
   * phone. `{place}` is the pinned venue, or the restaurant for somebody
   * reading the whole business.
   */
  revenueAt: {
    uz: 'Bugungi tushum · {place}',
    ru: 'Выручка за сегодня · {place}',
    en: 'Revenue today · {place}',
  },
  /* The fixture said "11:24 holatiga" — a frozen clock. Live renders carry no
     time at all rather than a wrong one; the figure is as of this render. */
  inclVat: {
    uz: 'QQS bilan',
    ru: 'с НДС',
    en: 'incl. VAT',
  },
  branches: { uz: 'Filiallar', ru: 'Филиалы', en: 'Branches' },
  waiters: { uz: 'Ofitsiantlar', ru: 'Официанты', en: 'Waiters' },
  /* The KPI row's own headings — the five `GET /dashboard` answers, named here
     rather than taken from the fixture's cards, which carry the demo's own
     figures inside their labels. */
  kOrders: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
  kAverage: { uz: "O'rtacha chek", ru: 'Средний чек', en: 'Average ticket' },
  kGross: { uz: 'Yalpi foyda', ru: 'Валовая прибыль', en: 'Gross profit' },
  kExpenses: { uz: 'Xarajat', ru: 'Расходы', en: 'Expenses' },
  kFoodCost: { uz: 'Food-cost', ru: 'Фудкост', en: 'Food cost' },
  kCovers: { uz: 'Mehmonlar', ru: 'Гости', en: 'Covers' },
  kOpen: { uz: 'Ochiq buyurtma', ru: 'Открытые заказы', en: 'Open orders' },
  /*
   * Shown when the dashboard did not answer and the whole board is the
   * design's. Same rule as `TABLES_COPY.demoFloor` and for a sharper reason:
   * an owner reading somebody else's trading day as their own makes decisions
   * on it.
   */
  demoBoard: {
    uz: 'Namunaviy kun — server javob bermadi',
    ru: 'Демо-день — сервер не ответил',
    en: 'Demo day — the server did not answer',
  },
  vatNote: {
    uz: 'Narx ichida QQS 12% bor. Tushum QQS‘siz hisoblanadi, kassa aylanmasi — QQS bilan.',
    ru: 'В цене уже есть НДС 12%. Выручка считается без НДС, оборот кассы — с НДС.',
    en: 'VAT 12% is already in the price. Revenue is ex-VAT; till turnover is not.',
  },
} as const satisfies Section;

/* ============================================================
   Branches
   ============================================================ */

export const BRANCHES_COPY = {
  /* What is not real, named. A reader told only that something is a sample
     does not know which half of the screen to trust. */
  demoBranches: {
    uz: 'Namunaviy filiallar — server javob bermadi',
    ru: 'Демо-филиалы — сервер не ответил',
    en: 'Demo branches — the server did not answer',
  },
  intro: {
    uz: 'Kunlik rejaga nisbatan bajarilish chizig‘i bilan. Yashil — reja bajarilgan, ko‘k — 85% dan yuqori, sariq — orqada.',
    ru: 'С полосой выполнения дневного плана. Зелёный — план выполнен, синий — выше 85%, жёлтый — отстаёт.',
    en: 'With a bar showing attainment against the daily target. Green — met, blue — above 85%, amber — behind.',
  },
  orders: { uz: 'Buyurtma', ru: 'Заказы', en: 'Orders' },
  margin: { uz: 'Marja', ru: 'Маржа', en: 'Margin' },
  staff: { uz: 'Xodim', ru: 'Смена', en: 'On shift' },
  ofTarget: { uz: 'kunlik rejadan', ru: 'от плана на день', en: 'of the daily target' },
} as const satisfies Section;

/* ============================================================
   Approvals
   ============================================================ */

export const APPROVALS_COPY = {
  /*
   * Same rule as `TABLES_COPY.demoFloor`: a manager approving a demo refund is
   * a manager who thinks they have approved a real one. Said above the list,
   * not after it.
   */
  demoQueue: {
    uz: 'Namunaviy navbat — server javob bermadi',
    ru: 'Демо-очередь — сервер не ответил',
    en: 'Demo queue — the server did not answer',
  },
  intro: {
    uz: 'Xodim so‘rov yuborganda telefoningizga bildirishnoma keladi. Restoranda bo‘lishingiz shart emas.',
    ru: 'Когда сотрудник отправляет запрос, вы получаете уведомление. Быть в ресторане не нужно.',
    en: 'When an employee sends a request you get a notification. You do not need to be in the restaurant.',
  },
  approve: { uz: 'Tasdiqlash', ru: 'Согласовать', en: 'Approve' },
  decline: { uz: 'Rad etish', ru: 'Отклонить', en: 'Decline' },
  approved: { uz: 'Tasdiqlandi', ru: 'Согласовано', en: 'Approved' },
  declined: { uz: 'Rad etildi', ru: 'Отклонено', en: 'Declined' },
  reason: { uz: 'Sabab', ru: 'Причина', en: 'Reason' },
  empty: {
    uz: 'Kutayotgan so‘rov yo‘q',
    ru: 'Нет запросов в ожидании',
    en: 'Nothing waiting for you',
  },
  kindDiscount: { uz: 'Chegirma so‘rovi', ru: 'Запрос скидки', en: 'Discount request' },
  kindVoid: {
    uz: 'Yuborilgandan keyin o‘chirish',
    ru: 'Удаление после отправки',
    en: 'Delete after firing',
  },
  kindRefund: { uz: 'Qaytarish', ru: 'Возврат', en: 'Refund' },
} as const satisfies Section;

/* ============================================================
   Alerts
   ============================================================ */

export const ALERTS_COPY = {
  /* What is not real, named. A reader told only that something is a sample
     does not know which half of the screen to trust. */
  demoAlerts: {
    uz: 'Namunaviy xabarlar — server javob bermadi',
    ru: 'Демо-уведомления — сервер не ответил',
    en: 'Demo alerts — the server did not answer',
  },
  empty: { uz: 'Signal yo‘q', ru: 'Сигналов нет', en: 'No alerts' },
  note: {
    uz: 'Signal — ayblov emas, qarash uchun ishora. Har birini odam ko‘rib chiqishi kerak.',
    ru: 'Сигнал — не обвинение, а повод посмотреть. Каждый должен смотреть человек.',
    en: 'An alert is not an accusation — it is a prompt to look. Every one needs a human.',
  },
} as const satisfies Section;

/* ============================================================
   Waiter — my tables
   ============================================================ */

export const TABLES_COPY = {
  showAmounts: { uz: 'Summani ko‘rsatish', ru: 'Показать суммы', en: 'Show amounts' },
  hideAmounts: { uz: 'Summani yashirish', ru: 'Скрыть суммы', en: 'Hide amounts' },
  /*
   * Totals are masked until asked for, which the design does and which is
   * right: a waiter holds this phone at a table with four guests looking at it,
   * and the running total of the next table along is nobody's business.
   */
  hiddenHint: {
    uz: 'Summalar yopiq — stol yonida ochmang.',
    ru: 'Суммы скрыты — не открывайте у стола.',
    en: 'Amounts are masked — do not reveal them at the table.',
  },
  tables: { uz: 'stol', ru: 'столов', en: 'tables' },
  allZones: { uz: 'Barcha zonalar', ru: 'Все залы', en: 'All zones' },
  seats: { uz: "o'rin", ru: 'мест', en: 'seats' },
  freeFor: { uz: "Bo'sh", ru: 'Свободен', en: 'Free for' },
  empty: {
    uz: 'Bu zalda sizga biriktirilgan stol yo‘q',
    ru: 'В этом зале за вами не закреплён ни один стол',
    en: 'No table in this zone is assigned to you',
  },
  takeOrder: { uz: 'Buyurtma qabul qilish', ru: 'Принять заказ', en: 'Take an order' },
  /*
   * Shown when the API did not answer and the grid is fixtures.
   *
   * Not a footnote anybody can skip: a waiter walking to table 12 because a
   * demo said somebody is sitting there is worse than a screen that admits it
   * knows nothing. `crew-server.ts` returns `live: false` and this is how the
   * screen says it out loud.
   */
  demoFloor: {
    uz: 'Namunaviy stollar — server javob bermadi',
    ru: 'Демо-столы — сервер не ответил',
    en: 'Demo tables — the server did not answer',
  },
  newOrder: { uz: 'Buyurtma qabul qilish', ru: 'Принять заказ', en: 'Take an order' },
  noFreeTable: {
    uz: 'Bo‘sh stol yo‘q — buyurtma qo‘shish uchun stolni tanlang.',
    ru: 'Свободных столов нет — выберите стол, чтобы добавить блюда.',
    en: 'No free table — pick one to add items to it.',
  },
  table: { uz: 'Stol', ru: 'Стол', en: 'Table' },
  guests: { uz: 'Mehmon', ru: 'Гостей', en: 'Guests' },
  elapsed: { uz: 'Vaqt', ru: 'Время', en: 'Elapsed' },
  lines: { uz: 'Pozitsiya', ru: 'Позиций', en: 'Lines' },
  orderLines: { uz: 'Buyurtma tarkibi', ru: 'Состав заказа', en: 'Order lines' },
  noLines: {
    uz: 'Bu stolda hali buyurtma yo‘q',
    ru: 'На этом столе ещё нет заказа',
    en: 'Nothing has been ordered at this table yet',
  },
  /* The five the design puts under a table. */
  actBills: { uz: 'Hisoblar', ru: 'Счета', en: 'Bills' },
  actAdd: { uz: "Taom qo'shish", ru: 'Добавить блюда', en: 'Add items' },
  actBill: { uz: 'Hisobni olib borish', ru: 'Отнести счёт', en: 'Bring the bill' },
  actDiscount: { uz: "Chegirma so'rash", ru: 'Запросить скидку', en: 'Request a discount' },
  actTransfer: { uz: "Stolni ko'chirish", ru: 'Перенести стол', en: 'Transfer the table' },
  actDone: { uz: 'Bajarildi', ru: 'Готово', en: 'Done' },
  actionsPending: {
    uz: 'Har bir amal shu telefonda qoladi — xodimlar ilovasi uchun server endpointi hali yo‘q.',
    ru: 'Каждое действие остаётся на этом телефоне — серверного эндпоинта для приложения ещё нет.',
    en: 'Every action stays on this phone — the staff app has no server endpoint yet.',
  },
} as const satisfies Section;

/* ============================================================
   The offline queue, which flow F13 needs and nothing drew
   ============================================================ */

export const QUEUE_COPY = {
  title: { uz: 'Yuborilmagan amallar', ru: 'Неотправленные действия', en: 'Pending actions' },
  sub: {
    uz: 'Aloqa yo‘q bo‘lganda bu yerga yoziladi va ulanish tiklanganda o‘zi ketadi.',
    ru: 'Пока нет связи, действия копятся здесь и уходят сами, когда связь вернётся.',
    en: 'While there is no connection these queue up here and send themselves when it returns.',
  },
  empty: { uz: 'Navbat bo‘sh', ru: 'Очередь пуста', en: 'The queue is empty' },
  emptySub: {
    uz: 'Hamma narsa yuborilgan. Aloqa uzilsa, amallaringiz shu yerda ko‘rinadi.',
    ru: 'Всё отправлено. Если связь прервётся, действия появятся здесь.',
    en: 'Everything has been sent. If the connection drops, your actions appear here.',
  },
  waiting: { uz: 'Kutmoqda', ru: 'Ожидает', en: 'Waiting' },
  sending: { uz: 'Yuborilmoqda', ru: 'Отправляется', en: 'Sending' },
  failed: { uz: 'O‘tmadi', ru: 'Не прошло', en: 'Failed' },
  retry: { uz: 'Qayta urinish', ru: 'Повторить', en: 'Retry' },
  order: {
    uz: 'Tartib saqlanadi: birinchi yozilgan birinchi ketadi, aks holda oshxona taomni bekor qilingandan keyin ko‘rardi.',
    ru: 'Порядок сохраняется: что записано первым, уходит первым — иначе кухня увидит блюдо уже после отмены.',
    en: 'Order is kept: first queued is first sent, or the kitchen would see a dish after it was cancelled.',
  },
} as const satisfies Section;

/* ============================================================
   Waiter — calls
   ============================================================ */

export const CALLS_COPY = {
  intro: {
    uz: 'Eng tepada — tayyor taom. U sovuydi, qolganlari kutadi.',
    ru: 'Сверху — готовое блюдо. Оно стынет, остальное подождёт.',
    en: 'The ready dish is first. It is going cold; the rest can wait.',
  },
  waiting: { uz: 'kutmoqda', ru: 'ожидает', en: 'waiting' },
  done: { uz: 'Bajarildi', ru: 'Выполнено', en: 'Done' },
  empty: { uz: 'Chaqiruv yo‘q', ru: 'Вызовов нет', en: 'No calls' },
  /*
   * The words the live cards are built from — `callsFrom()` composes them with
   * the table label the server sent. One title, one canned body and one action
   * per kind: the fixture wrote each card's sentence by hand, which is fine for
   * three drawings and impossible for a room.
   */
  table: { uz: 'Stol', ru: 'Стол', en: 'Table' },
  seat: { uz: "O'rin", ru: 'Место', en: 'Seat' },
  titleReady: { uz: 'taom tayyor', ru: 'блюдо готово', en: 'dish ready' },
  titleGuest: { uz: 'mijoz chaqirdi', ru: 'гость вызвал', en: 'guest called' },
  titleBill: { uz: 'hisob so‘radi', ru: 'просят счёт', en: 'asked for the bill' },
  bodyReady: {
    uz: 'Issiq stolda kutmoqda',
    ru: 'Ждёт на раздаче',
    en: 'Waiting on the pass',
  },
  bodyGuest: {
    uz: 'Mijoz tugmani bosdi',
    ru: 'Гость нажал кнопку вызова',
    en: 'The guest pressed the call button',
  },
  bodyBill: {
    uz: 'Hisobni olib boring',
    ru: 'Отнесите счёт',
    en: 'Take the bill over',
  },
  actionReady: { uz: 'Oldim', ru: 'Забрал', en: 'Picked up' },
  actionGuest: { uz: 'Bordim', ru: 'Подошёл', en: 'Went over' },
  actionBill: { uz: 'Olib bordim', ru: 'Отнёс', en: 'Taken over' },
  /* Shown when the API did not answer and the three cards are the design's —
     a waiter walking to a table because a demo said somebody called is the
     same defect `TABLES_COPY.demoFloor` names. */
  demoCalls: {
    uz: 'Namunaviy chaqiruvlar — server javob bermadi',
    ru: 'Демо-вызовы — сервер не ответил',
    en: 'Demo calls — the server did not answer',
  },
  failed: {
    uz: 'Chaqiruv yopilmadi — qaytadan urinib ko‘ring',
    ru: 'Вызов не закрыт — попробуйте ещё раз',
    en: 'The call was not closed — try again',
  },
} as const satisfies Section;

/* ============================================================
   Waiter — menu
   ============================================================ */

export const MENU_COPY = {
  /* What is not real, named. A reader told only that something is a sample
     does not know which half of the screen to trust. */
  demoMenu: {
    uz: 'Namunaviy menyu — server javob bermadi',
    ru: 'Демо-меню — сервер не ответил',
    en: 'Demo menu — the server did not answer',
  },
  intro: {
    uz: 'Tugagan taomlar xira ko‘rsatilgan — mijozga taklif qilmang.',
    ru: 'Закончившиеся блюда показаны бледным — не предлагайте их гостю.',
    en: 'Sold-out dishes are dimmed — do not offer them to the guest.',
  },
} as const satisfies Section;

/* ============================================================
   Taking an order at the table

   Four steps in one screen rather than four routes: a waiter with a guest
   waiting must be able to go back a step without losing what they have picked,
   and a wizard on a phone loses it every time.
   ============================================================ */

export const ORDER_COPY = {
  title: { uz: 'Buyurtma olish', ru: 'Принять заказ', en: 'Take the order' },
  forTable: { uz: '{table} uchun', ru: 'для {table}', en: 'for {table}' },
  pick: { uz: 'Taom tanlang', ru: 'Выберите блюда', en: 'Pick the dishes' },
  review: { uz: 'Tekshirish', ru: 'Проверка', en: 'Review' },
  empty: { uz: 'Hech narsa tanlanmadi', ru: 'Ничего не выбрано', en: 'Nothing picked yet' },
  emptySub: {
    uz: 'Yuqoridagi ro‘yxatdan taom qo‘shing — bu yerda ko‘rinadi.',
    ru: 'Добавьте блюда из списка выше — они появятся здесь.',
    en: 'Add dishes from the list above and they appear here.',
  },
  seat: { uz: 'O‘rin', ru: 'Место', en: 'Seat' },
  /*
   * The three-row ladder the design puts under the basket — `mfOrdTotals`.
   *
   * It was missing entirely, which made the send button the first place a
   * waiter saw a number, and the number it showed was the food alone. Reading
   * a subtotal to a guest as the total is a ten percent apology at the table.
   *
   * The percentage is written into the label because it is written into the
   * label in the design and because it is the answer to the only question the
   * row provokes. `lib/pricing.ts` owns the arithmetic — the figure and the
   * word come from the same constant.
   */
  items: { uz: 'Taomlar', ru: 'Блюда', en: 'Items' },
  service: {
    uz: 'Xizmat haqi {percent}%',
    ru: 'Сервисный сбор {percent}%',
    en: 'Service charge {percent}%',
  },
  vatNote: {
    uz: 'Narx ichida QQS {vat}% bor. Xizmat haqi olib ketish va yetkazishda olinmaydi.',
    ru: 'В цене уже есть НДС {vat}%. Сервисный сбор не берётся при самовывозе и доставке.',
    en: 'VAT {vat}% is already in the price. No service charge on takeaway or delivery.',
  },
  send: { uz: 'Oshxonaga yuborish', ru: 'Отправить на кухню', en: 'Send to the kitchen' },
  sent: { uz: 'Yuborildi', ru: 'Отправлено', en: 'Sent' },
  sendNote: {
    uz: 'Yuborilgandan keyin oshpaz tayyorlashni boshlaydi. Bekor qilish menejer tasdig‘ini talab qiladi.',
    ru: 'После отправки повар начинает готовить. Отмена потребует подтверждения менеджера.',
    en: "Once sent, the cook starts cooking. Cancelling needs a manager's approval.",
  },
} as const satisfies Section;

/* ============================================================
   More
   ============================================================ */

export const MORE_COPY = {
  note: {
    uz: 'Bu ilova kompyuterdagi tizimning o‘rnini bosmaydi. U faqat restoranda bo‘lmaganda kerak bo‘ladigan ishlarni bajaradi.',
    ru: 'Это приложение не заменяет систему на компьютере. Оно делает только то, что нужно, когда вас нет в ресторане.',
    en: 'This app does not replace the desktop system. It does only what you need when you are not in the restaurant.',
  },
  notBuilt: { uz: 'hali yo‘q', ru: 'пока нет', en: 'not built' },
  desktop: { uz: 'kompyuterda', ru: 'на компьютере', en: 'on desktop' },
  /*
   * The sheet that ends a turn.
   *
   * It names what is kept as well as what ends, because that is the question a
   * waiter has when they press it mid-service: the open orders stay theirs, the
   * handset stays enrolled, and only the person signs out.
   */
  endConfirm: { uz: 'Ha, chiqaman', ru: 'Да, выйти', en: 'Yes, sign out' },
  endCancel: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  endWorking: { uz: 'Chiqilmoqda…', ru: 'Выходим…', en: 'Signing out…' },
  /*
   * The desktop row is a control in the design, not a dimmed line: it presses
   * and says where the work lives. That is a better answer than a chip, because
   * the question a manager has is "then where do I do it", and a chip does not
   * answer it.
   */
  desktopOpen: {
    uz: 'Kompyuterdagi tizimda ochish',
    ru: 'Открыть в системе на компьютере',
    en: 'Open in the desktop system',
  },
} as const satisfies Section;

/* ============================================================
   A screen that is named but not built
   ============================================================ */

/* ============================================================
   The line under every sub-screen title — the design's `mfSubNote`

   Sixteen screens, sixteen sentences, and none of them is decoration: each says
   what the reader is looking at before they read a figure. "This month · 5
   branches · ex-VAT" is the difference between a P&L somebody trusts and one
   they argue with, and "today · my 6 tables" is what stops a waiter reading
   somebody else's bookings as their own.

   Keyed by the route's own `Screen` union, so a screen added to `SCREENS`
   without a sentence here is a compile error rather than a blank line.
   ============================================================ */

export const SUB_NOTES = {
  /*
   * Six of these captions carried the demo restaurant's own figures — five
   * branches, fourteen on shift, six tables, a shift starting at twelve — and
   * they were printed on every employee's phone. The screens under them have
   * nothing that counts those numbers, so the honest caption is the one that
   * says what the reader is looking at and leaves the counting to the list.
   */
  finance: {
    uz: "Bu oy · QQS'siz",
    ru: 'Этот месяц · без НДС',
    en: 'This month · ex-VAT',
  },
  people: {
    uz: 'Bugun smenada turganlar',
    ru: 'Кто сегодня на смене',
    en: 'Who is on shift today',
  },
  control: {
    uz: 'Bu hafta · barcha filiallar',
    ru: 'Эта неделя · все филиалы',
    en: 'This week · all branches',
  },
  closing: {
    uz: 'Beshta shart bajarilgandan keyin smena yopiladi',
    ru: 'Смена закроется после пяти условий',
    en: 'The shift closes once five conditions are met',
  },
  rota: {
    uz: 'Bugungi jadval',
    ru: 'График на сегодня',
    en: "Today's rota",
  },
  kitchen: {
    uz: 'Bugun · buyurtmadan berishgacha',
    ru: 'Сегодня · от заказа до подачи',
    en: 'Today · order to pass',
  },
  waste: {
    uz: 'Sababni tanlang, keyin miqdorni kiriting',
    ru: 'Выберите причину, затем количество',
    en: 'Pick the reason, then the quantity',
  },
  expiry: {
    uz: 'Eng yaqin muddat yuqorida',
    ru: 'Ближайший срок сверху',
    en: 'Nearest date first',
  },
  porder: {
    uz: 'Miqdor qoldiqqa qarab taklif qilingan',
    ru: 'Количество предложено по остаткам',
    en: 'Quantities suggested from stock cover',
  },
  swap: {
    uz: "Avval o'z smenangizni, keyin hamkasbni tanlang",
    ru: 'Сначала свою смену, затем коллегу',
    en: 'Your shift first, then the colleague',
  },
  handback: {
    uz: 'Sababni tanlang — operator buyurtmani boshqa kuryerga beradi',
    ru: 'Выберите причину — оператор передаст заказ другому курьеру',
    en: 'Pick a reason — the operator reassigns the order',
  },
  endshift: {
    uz: "To'rtta shart bajarilgandan keyin smena yopiladi",
    ru: 'Смена закроется после четырёх условий',
    en: 'The shift closes once four conditions are met',
  },
  myshift: { uz: 'Bugungi smenangiz', ru: 'Ваша смена сегодня', en: 'Your shift today' },
  bookings: {
    uz: 'Bugun · mening stollarim',
    ru: 'Сегодня · мои столы',
    en: 'Today · my tables',
  },
  myday: { uz: 'Bugungi kuningiz', ru: 'Ваш день сегодня', en: 'Your day today' },
  /* The branch's own city, filled at render — the only one that varies. */
  branch: { uz: '{city} · bugun', ru: '{city} · сегодня', en: '{city} · today' },
  scan: {
    uz: 'Kamerani mahsulot kodiga tutib turing',
    ru: 'Наведите камеру на код товара',
    en: 'Point the camera at the product code',
  },
} as const satisfies Section;

/* ============================================================
   The storekeeper's three screens

   They used to say "not built, waiting on a barcode scanner". A scanner makes
   receiving faster; typing the quantity off the invoice is what makes it
   possible, and that is what a storekeeper has always done.
   ============================================================ */

export const STORE_COPY = {
  /* What is not real, named. A reader told only that something is a sample
     does not know which half of the screen to trust. */
  demoShelf: {
    uz: 'Server javob bermadi — javon ko‘rsatilmadi',
    ru: 'Сервер не ответил — полка не показана',
    en: 'The server did not answer — no shelf shown',
  },
  today: { uz: 'Bugungi yetkazishlar', ru: 'Поставки на сегодня', en: 'Deliveries today' },
  /**
   * The hero card's caption, counted rather than written down.
   *
   * `STORE_TODAY.label` says "· 3 deliveries" because the design drew three.
   * The list is read from `suppliers/purchase-orders` now, so the number is
   * whatever is actually coming — and a card that announced three while five
   * vans were listed under it would be the first thing a storekeeper stopped
   * believing.
   */
  todayCard: {
    uz: 'Bugun qabul qilinadi · {n} yetkazish',
    ru: 'К приёмке сегодня · {n} поставки',
    en: 'To receive today · {n} deliveries',
  },
  /** Nothing behind the digits that were read — see `crew/barcode/route.ts`. */
  scanUnknown: {
    uz: 'Bu kod omborda topilmadi',
    ru: 'Этот код не найден на складе',
    en: 'That code is not in the store',
  },
  noDeliveries: {
    uz: "Bugun yetkazma yo'q",
    ru: 'Сегодня поставок нет',
    en: 'No deliveries today',
  },
  enRoute: { uz: "Yo'lda", ru: 'В пути', en: 'En route' },
  arrived: { uz: 'Yetib keldi', ru: 'Прибыло', en: 'Arrived' },
  tomorrow: { uz: 'Ertaga', ru: 'Завтра', en: 'Tomorrow' },
  lines: { uz: '{n} pozitsiya', ru: '{n} позиций', en: '{n} lines' },
  receive: { uz: 'Qabul qilishni boshlash', ru: 'Начать приёмку', en: 'Start receiving' },
  receiveStarted: { uz: 'Qabul boshlandi', ru: 'Приёмка начата', en: 'Receiving started' },
  receivingNote: {
    uz: "Kam chiqqan yoki sifatsiz mahsulotni shu yerda belgilang — hujjatga imzo qo'yishdan oldin.",
    ru: 'Недостачу и брак отмечайте здесь — до подписи в накладной.',
    en: 'Record a shortfall or a bad batch here — before signing the document.',
  },
  hidden: {
    uz: "Tizimdagi son ataylab ko'rsatilmaydi — avval sanang, farqni tizim o'zi hisoblaydi.",
    ru: 'Системное количество намеренно скрыто — сначала посчитайте, разницу система посчитает сама.',
    en: 'The system quantity is deliberately hidden — count first, and the system works out the variance.',
  },
  progress: {
    uz: '{done} / {total} sanaldi',
    ru: 'Пересчитано {done} / {total}',
    en: '{done} of {total} counted',
  },
  finish: { uz: 'Sanoqni saqlash', ru: 'Сохранить пересчёт', en: 'Save the count' },
  countNote: {
    uz: "Saqlangandan keyin o'zgartirib bo'lmaydi. Farq 5% dan oshsa, menejer tasdig'i so'raladi.",
    ru: 'После сохранения изменить нельзя. При расхождении свыше 5% потребуется согласование менеджера.',
    en: 'Once saved it cannot be changed. A variance above 5% needs manager approval.',
  },
  countSaved: { uz: 'Sanoq saqlandi', ru: 'Пересчёт сохранён', en: 'Count saved' },

  /* ---------------------------------------------------------------- scanner */

  /**
   * The barcode screen — the design's `mfSub.scan`.
   *
   * Its own screen rather than a mode on the receiving list, because it is the
   * one place in this app where the phone is held like a tool rather than read
   * like a page: the frame fills the screen, the list grows under it, and
   * nothing else competes for the thumb.
   */
  scan: { uz: 'Shtrix-kodni skanerlash', ru: 'Сканировать штрих-код', en: 'Scan a barcode' },
  scanTitle: { uz: 'Shtrix-kod', ru: 'Штрих-код', en: 'Barcode' },
  scanHint: {
    uz: "Kod avtomatik o'qiladi. Qo'lda kiritish uchun ekranni bosib turing.",
    ru: 'Код считывается автоматически. Для ручного ввода удерживайте экран.',
    en: 'The code reads automatically. Hold the screen to type it in.',
  },
  /*
   * Named a demo on the button itself, in the design's own words.
   *
   * A web page cannot open the camera without a permission prompt and has no
   * decoder behind it, so the honest control is one that says what it is. A
   * button labelled "Scan" that cycled a fixture would teach a storekeeper the
   * reader works, and the first real delivery would be booked from four lines
   * nobody scanned.
   */
  scanSim: {
    uz: "Namoyish: keyingi kodni o'qish",
    ru: 'Демо: считать следующий код',
    en: 'Demo: read the next code',
  },
  scanFound: { uz: "O'qilgan pozitsiyalar", ru: 'Считанные позиции', en: 'Scanned lines' },
  scanSave: { uz: 'Qabulni yakunlash', ru: 'Завершить приёмку', en: 'Finish receiving' },
  /*
   * What this screen is, now that it no longer claims to finish a receipt.
   *
   * The "save" button reported "{n} lines received" and raised no stock
   * anywhere — no request, and unlike the count sheet beside it, not even a
   * queue entry. `receive_confirm` is keyed on `purchase_order_id` and the
   * scanner holds barcodes, not a delivery, so there was nothing it could
   * honestly have sent. Confirming the delivery is the receiving screen's job
   * and that one does write.
   */
  scanNote: {
    uz: 'Quti kodlari hujjatga solishtiriladi. Qabulni yakunlash uchun avval yuqoridan yetkazmani tanlang — kodlar o‘sha hujjat jurnaliga yoziladi.',
    ru: 'Коды коробок сверяются с накладной. Чтобы завершить приёмку, сначала выберите поставку сверху — коды запишутся в журнал этого документа.',
    en: 'Box codes are checked against the document. To finish, pick the delivery at the top first — the codes are journalled against it.',
  },
  /*
   * Said when Save is pressed with no van chosen.
   *
   * A refusal rather than a dimmed button: the control is the last thing on a
   * screen somebody has scrolled to the bottom of, and "which delivery" is not
   * a question a greyed-out rectangle asks.
   */
  scanPickVan: {
    uz: 'Avval yetkazmani tanlang',
    ru: 'Сначала выберите поставку',
    en: 'Pick the delivery first',
  },
  cover: { uz: 'Necha kunga yetadi', ru: 'На сколько дней хватит', en: 'Days of cover' },
  days: { uz: '{n} kun', ru: '{n} дн.', en: '{n} d' },
  stockNote: {
    uz: "Kunlar joriy sarf tezligidan hisoblanadi — miqdordan emas. 48 kg guruch yetarli, 12 kg go'sht esa yo'q.",
    ru: 'Дни считаются от текущей скорости расхода, а не от количества. 48 кг риса — норма, 12 кг говядины — нет.',
    en: 'Days are computed from the current rate of use, not from the quantity. Forty-eight kilos of rice is fine; twelve of beef is not.',
  },
} as const satisfies Section;

/* ============================================================
   The courier's three screens
   ============================================================ */

export const COURIER_COPY = {
  drops: { uz: 'Yetkazishlar', ru: 'Доставки', en: 'Deliveries' },
  noDrops: { uz: "Hozircha yetkazish yo'q", ru: 'Доставок пока нет', en: 'Nothing to deliver yet' },
  stateNew: { uz: 'Yangi', ru: 'Новый', en: 'New' },
  statePicked: { uz: 'Olindi', ru: 'Забран', en: 'Picked up' },
  stateDelivered: { uz: 'Yetkazildi', ru: 'Доставлено', en: 'Delivered' },
  collect: { uz: 'Naqd olish', ru: 'Взять наличные', en: 'Collect cash' },
  paid: { uz: "To'langan", ru: 'Оплачено', en: 'Paid' },
  pick: { uz: 'Oldim', ru: 'Забрал', en: 'Picked it up' },
  deliver: { uz: 'Yetkazdim', ru: 'Доставил', en: 'Delivered it' },
  call: { uz: "Qo'ng'iroq", ru: 'Позвонить', en: 'Call' },
  route: { uz: 'Marshrut', ru: 'Маршрут', en: 'Route' },
  next: { uz: 'Keyingi', ru: 'Следующая', en: 'Next' },
  routeLeft: { uz: 'Qolgan masofa', ru: 'Осталось пути', en: 'Distance left' },
  routeTime: { uz: 'Taxminiy vaqt', ru: 'Примерное время', en: 'Estimated time' },
  routeNote: {
    uz: "Tartib eng qisqa yo'l bo'yicha tuzilgan. Yangi buyurtma qo'shilsa, yo'nalish o'zi qayta tuziladi.",
    ru: 'Порядок построен по кратчайшему маршруту. При новом заказе маршрут перестраивается сам.',
    en: 'The order is built along the shortest route. When a new order arrives the route rebuilds itself.',
  },
  onHand: { uz: "Qo'lingizdagi naqd", ru: 'Наличные у вас', en: 'Cash on you' },
  /* `{n}` is the courier's own delivered count for the shift. It read "2
     buyurtma" for everybody, under the figure a rider hands to a cashier. */
  onHandNote: {
    uz: "so'm · {n} buyurtma · smena boshidan",
    ru: 'сум · {n} заказа · с начала смены',
    en: "so'm · {n} orders · since the shift began",
  },
  collected: { uz: "Yig'ilgan naqd", ru: 'Собранные наличные', en: 'Cash collected' },
  handIn: { uz: 'Kassirga topshirish', ru: 'Сдать кассиру', en: 'Hand in to the cashier' },
  handedIn: { uz: 'Topshirildi', ru: 'Сдано', en: 'Handed in' },
  /*
   * The design's own sentence, and it is the one that decides how a courier
   * thinks about the notes in their pocket for the rest of the shift: the money
   * stays against their name until somebody else has counted it.
   */
  cashNote: {
    uz: 'Topshirgandan keyin kassir sanaydi va tasdiqlaydi. Tasdiqlanmaguncha summa sizning hisobingizda qoladi.',
    ru: 'После сдачи кассир пересчитывает и подтверждает. До подтверждения сумма остаётся за вами.',
    en: 'Once handed in the cashier counts and confirms it. Until then the amount stays against your name.',
  },
  endShift: { uz: 'Smenani yakunlash', ru: 'Завершить смену', en: 'End the shift' },
} as const satisfies Section;

export const PENDING = {
  title: {
    uz: 'Bu ekran hali qurilmagan',
    ru: 'Этот экран ещё не построен',
    en: 'This screen is not built yet',
  },
  /*
   * Naming what is missing, not apologising. CLAUDE.md rule 10: an error — and
   * an absence is one — says what failed and what to do, never "Oops". A reader
   * who knows the receiving screen needs a camera stops waiting for it to
   * appear next week.
   */
  scanner: {
    uz: 'Qabul kamerani va shtrix-kod o‘qishni talab qiladi — ikkalasi ham hali ulanmagan.',
    ru: 'Приёмке нужны камера и сканирование штрих-кодов — ни того, ни другого пока нет.',
    en: 'Receiving needs the camera and barcode reading — neither is wired up yet.',
  },
  counting: {
    uz: 'Sanoq tizimdagi sonni yashirgan holda yoziladi va farqni serverda hisoblaydi — endpoint hali yo‘q.',
    ru: 'Пересчёт пишется со скрытым системным количеством, а расхождение считает сервер — эндпоинта пока нет.',
    en: 'A count is recorded with the system quantity hidden and the variance computed server-side — no endpoint yet.',
  },
  stock: {
    uz: 'Qoldiq ombor xizmatidan real vaqtda olinadi — bu ilova uchun hali ochilmagan.',
    ru: 'Остатки берутся из складской службы в реальном времени — для этого приложения она ещё не открыта.',
    en: 'Stock cover comes live from the inventory service — it is not exposed to this app yet.',
  },
  deliveries: {
    uz: 'Yetkazish ro‘yxati kuryer navbatiga bog‘lanadi — u hali yozilmagan.',
    ru: 'Список доставок связан с очередью курьера — она ещё не написана.',
    en: 'The delivery list hangs off the courier queue, which is not written yet.',
  },
  route: {
    uz: 'Yo‘nalish joylashuvni va xarita xizmatini talab qiladi — ikkalasi ham hali yo‘q.',
    ru: 'Маршруту нужны геолокация и картографический сервис — ни того, ни другого пока нет.',
    en: 'The route needs location and a mapping service — neither exists yet.',
  },
  cash: {
    uz: 'Naqd topshirish kassa daftariga yoziladi — bu yozuv hali ochilmagan.',
    ru: 'Сдача наличных пишется в кассовую книгу — эта запись ещё не открыта.',
    en: 'Handing cash in writes to the till ledger, and that write is not open yet.',
  },
  generic: {
    uz: 'Ma’lumot tayyor, ekran esa hali chizilmagan.',
    ru: 'Данные готовы, экран ещё не нарисован.',
    en: 'The data is ready; the screen is not drawn yet.',
  },
} as const satisfies Section;

/* ============================================================
   Offline
   ============================================================ */

export const OFFLINE = {
  /*
   * What is true, and only what is true.
   *
   * The design's strip promises "keep working, everything is saved" because the
   * prototype has an offline queue behind it. This build does not, so the strip
   * says what a reader can act on: the figures on screen have stopped moving.
   * Promising a queue that does not exist is how a waiter loses an order and
   * blames themselves.
   */
  title: { uz: 'Tarmoq yo‘q', ru: 'Нет сети', en: 'No network' },
  body: {
    uz: 'Ekrandagi ma’lumot eskirgan bo‘lishi mumkin.',
    ru: 'Данные на экране могут быть устаревшими.',
    en: 'What you see may be out of date.',
  },
} as const satisfies Section;

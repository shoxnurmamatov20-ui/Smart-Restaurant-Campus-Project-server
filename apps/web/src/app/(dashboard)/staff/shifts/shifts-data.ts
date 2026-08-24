/**
 * Everything the rota screen says, and the four blocks it was missing.
 *
 * The design's Schedule screen (`Smart Restaurant OS.dc.html:3581-3871`) is not
 * a grid on its own. It is a grid *plus* an hours column that flags anyone over
 * 48, a cover row that flags any day under four people, the swap queue a
 * manager answers, today's bookings, and the opening checklist. The console had
 * the grid and nothing else — which reads as a published rota with no way to
 * tell whether it is legal, staffed, or agreed.
 *
 * Copy is trilingual and verbatim from the file's `P("uz","ru","en")` calls. It
 * lives here rather than in `src/i18n` because it is one screen's vocabulary
 * and the catalogue is loaded by every other one.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/* ------------------------------------------------------------------- rota */

/**
 * The three states a cell can hold, as the design cycles them: day, evening,
 * off. Tapping a cell steps to the next one.
 *
 * The hours are not stored on the cell — they are read back out of the range,
 * so a shift that came from the API (`08–20`) counts as truthfully as one typed
 * here. A stored hour count and a printed time range are two numbers that
 * disagree the first time somebody edits one of them.
 */
export const SHIFT_CYCLE: readonly (string | null)[] = ['12–22', '16–24', null];

/** Where a shift is over the week's limit, in hours. */
export const WEEKLY_HOUR_LIMIT = 48;

/** Below this many people on a day, the cover figure turns red. */
export const MINIMUM_COVER = 4;

/**
 * How long a cell is, in hours.
 *
 * The dash is the design's en dash, and `24` is midnight rather than an
 * impossible hour: `16–24` is an eight-hour evening, and treating the 24 as
 * out of range would silently drop eight hours off somebody's week.
 */
export function hoursOf(cell: string | null): number {
  if (cell === null) return 0;

  const [from, to] = cell.split(/[–-]/).map((part) => Number.parseInt(part, 10));

  if (from === undefined || to === undefined || Number.isNaN(from) || Number.isNaN(to)) return 0;

  return to > from ? to - from : 24 - from + to;
}

/* ---------------------------------------------------------------- swaps */

export type SwapRequest = {
  id: string;
  from: string;
  to: string;
  /** Which day, as the heading writes it. */
  day: string;
  reason: Trilingual;
};

export const SWAP_REQUESTS: readonly SwapRequest[] = [
  {
    id: 's0',
    from: 'Jasur Toshev',
    to: 'Malika Rahimova',
    day: 'Pa 14',
    reason: {
      uz: 'Shifokorga borishim kerak',
      ru: 'Нужно к врачу',
      en: 'I have a doctor’s appointment',
    },
  },
  {
    id: 's1',
    from: 'Nilufar Ahmedova',
    to: 'Dilshod Karimov',
    day: 'Sha 16',
    reason: { uz: "Oilaviy to'y", ru: 'Семейная свадьба', en: 'A family wedding' },
  },
];

/* --------------------------------------------------------- reservations */

export type BookingState = 'confirmed' | 'prepaid' | 'pending' | 'moved';

export type Booking = {
  id: string;
  /** `HH:MM`. Sorted as a string, which is why it is zero-padded. */
  time: string;
  who: Trilingual;
  detail: Trilingual;
  state: BookingState;
};

export const BOOKINGS: readonly Booking[] = [
  {
    id: 'b0',
    time: '18:00',
    who: { uz: 'Rustam aka · 6 kishi', ru: 'Рустам ака · 6 человек', en: 'Rustam · 6 guests' },
    detail: {
      uz: "Stol 14 · tug'ilgan kun · tort olib kelishadi",
      ru: 'Стол 14 · день рождения · привезут торт',
      en: 'Table 14 · birthday · bringing a cake',
    },
    state: 'confirmed',
  },
  {
    id: 'b1',
    time: '18:30',
    who: {
      uz: 'Kamola Yusupova · 4 kishi',
      ru: 'Камола Юсупова · 4 человека',
      en: 'Kamola Yusupova · 4 guests',
    },
    detail: {
      uz: 'Stol 7 · doimiy mijoz',
      ru: 'Стол 7 · постоянный гость',
      en: 'Table 7 · regular',
    },
    state: 'confirmed',
  },
  {
    id: 'b2',
    time: '19:00',
    who: {
      uz: 'Uzbektelecom · 12 kishi',
      ru: 'Uzbektelecom · 12 человек',
      en: 'Uzbektelecom · 12 guests',
    },
    detail: {
      uz: "Yopiq zal · oldindan to'lov 500 000",
      ru: 'Отдельный зал · предоплата 500 000',
      en: 'Private room · 500 000 deposit',
    },
    state: 'prepaid',
  },
  {
    id: 'b3',
    time: '20:00',
    who: {
      uz: 'Doston Rahimov · 2 kishi',
      ru: 'Достон Рахимов · 2 человека',
      en: 'Doston Rahimov · 2 guests',
    },
    detail: {
      uz: "Stol 3 · deraza oldida so'ragan",
      ru: 'Стол 3 · просил у окна',
      en: 'Table 3 · asked for a window',
    },
    state: 'pending',
  },
  {
    id: 'b4',
    time: '20:30',
    who: {
      uz: 'Farrux Turgunov · 2 kishi',
      ru: 'Фаррух Тургунов · 2 человека',
      en: 'Farrux Turgunov · 2 guests',
    },
    detail: {
      uz: 'Telefon orqali · tasdiqlanmagan',
      ru: 'По телефону · не подтверждена',
      en: 'By phone · not confirmed',
    },
    state: 'pending',
  },
];

/* ------------------------------------------------------------- checklist */

/**
 * One line of the opening checklist.
 *
 * `id` is the SERVER's key — `Modules\Staff\Models\OpeningChecklistTick::ITEMS`
 * — and not the design file's `c1`..`c7`. The server owns which items exist,
 * because a checklist whose items are defined in a browser silently orphans
 * every tick recorded against the old wording; what lives here is the wording,
 * in three languages, which is the half a server has no business holding.
 *
 * `by` is the design's "12:10 · Malika" and belongs to the fixture alone. A
 * live tick carries the name of whoever actually pressed it.
 */
export type CheckItem = { id: string; label: Trilingual; by: string };

/** Seven items; the first three arrive already ticked, as the design has them. */
export const OPENING_CHECKLIST: readonly CheckItem[] = [
  {
    id: 'float_counted',
    label: {
      uz: "Kassani ochish va boshlang'ich naqd sanash",
      ru: 'Открыть кассу и пересчитать начальные наличные',
      en: 'Open the register and count the float',
    },
    by: '12:02 · Dilshod',
  },
  {
    id: 'fridge_temps',
    label: {
      uz: 'Muzlatkich haroratini yozib olish',
      ru: 'Записать температуру холодильников',
      en: 'Log the fridge temperatures',
    },
    by: '12:05 · Sardor',
  },
  {
    id: 'dining_room',
    label: {
      uz: 'Zal tozaligini tekshirish',
      ru: 'Проверить чистоту зала',
      en: 'Check the dining room',
    },
    by: '12:10 · Malika',
  },
  {
    id: 'sold_out_marked',
    label: {
      uz: "Menyudan tugagan taomlarni o'chirish",
      ru: 'Убрать из меню закончившиеся блюда',
      en: 'Mark sold-out dishes in the menu',
    },
    by: '',
  },
  {
    id: 'terminals_tested',
    label: {
      uz: 'POS va printerlarni sinash',
      ru: 'Проверить POS и принтеры',
      en: 'Test POS terminals and printers',
    },
    by: '',
  },
  {
    id: 'uniform_checked',
    label: {
      uz: 'Xodimlar formasi va gigiyenasi',
      ru: 'Форма и гигиена персонала',
      en: 'Staff uniform and hygiene',
    },
    by: '',
  },
  {
    id: 'target_briefed',
    label: {
      uz: 'Kunlik maqsadni jamoaga aytish',
      ru: 'Озвучить цель дня команде',
      en: 'Brief the team on today’s target',
    },
    by: '',
  },
];

export const CHECKED_ON_ARRIVAL: readonly string[] = [
  'float_counted',
  'fridge_temps',
  'dining_room',
];

/* ------------------------------------------------------------------ copy */

export const ROTA_COPY = {
  hours: { uz: 'Soat', ru: 'Часы', en: 'Hours' },
  hoursShort: { uz: 's', ru: 'ч', en: 'h' },
  cover: { uz: 'Kunlik qamrov', ru: 'Покрытие по дням', en: 'Cover per day' },
  over: { uz: '48 soatdan oshdi', ru: 'Больше 48 часов', en: 'Over 48 hours' },
  noRest: { uz: "Dam kuni yo'q", ru: 'Нет выходного', en: 'No day off' },
  hint: {
    uz: 'Katakni bosing — kunduzgi, kechki, dam',
    ru: 'Нажмите на ячейку — день, вечер, выходной',
    en: 'Tap a cell — day, evening, off',
  },
  publish: { uz: 'Jadvalni nashr etish', ru: 'Опубликовать график', en: 'Publish the rota' },
  published: { uz: 'Nashr etilgan', ru: 'Опубликовано', en: 'Published' },
  draft: { uz: 'Qoralama', ru: 'Черновик', en: 'Draft' },
  publishedFlash: {
    uz: 'Jadval nashr etildi · xodimlarga xabar yuborildi',
    ru: 'График опубликован · сотрудники уведомлены',
    en: 'Rota published · staff notified',
  },

  swapHead: { uz: 'Almashtirish so‘rovlari', ru: 'Заявки на подмену', en: 'Swap requests' },
  swapSub: {
    uz: 'Xodim smenani almashtirmoqchi — menejer tasdiqlaydi',
    ru: 'Сотрудник хочет поменяться сменой — менеджер подтверждает',
    en: 'A staff member wants to swap a shift; the manager approves',
  },
  swapEmpty: { uz: "Ochiq so'rov yo'q", ru: 'Открытых заявок нет', en: 'No open requests' },
  swapNew: { uz: "Almashtirish so'rovi", ru: 'Заявка на подмену', en: 'Swap request' },
  swapBody: {
    uz: "So'rov menejerga boradi. Tasdiqlangandan keyin jadval o'zgaradi va ikkala xodimga xabar yuboriladi.",
    ru: 'Заявка уходит менеджеру. После подтверждения график меняется и оба сотрудника получают уведомление.',
    en: 'The request goes to the manager. Once approved the rota changes and both staff are notified.',
  },
  swapFrom: { uz: "Kim so'rayapti", ru: 'Кто просит', en: 'Requested by' },
  swapTo: { uz: 'Kim bilan', ru: 'С кем', en: 'Swap with' },
  swapDay: { uz: 'Qaysi kun', ru: 'Какой день', en: 'Which day' },
  swapReason: { uz: 'Sabab', ru: 'Причина', en: 'Reason' },
  swapReasonPlaceholder: {
    uz: 'Masalan: shifokorga borishim kerak',
    ru: 'Например: нужно к врачу',
    en: 'e.g. I have a doctor’s appointment',
  },
  swapSend: { uz: "So'rov yuborish", ru: 'Отправить заявку', en: 'Send request' },
  swapApprove: { uz: 'Tasdiqlash', ru: 'Подтвердить', en: 'Approve' },
  swapReject: { uz: 'Rad etish', ru: 'Отклонить', en: 'Reject' },
  swapPending: { uz: 'Kutilmoqda', ru: 'Ожидание', en: 'Pending' },
  swapApproved: { uz: 'Tasdiqlandi', ru: 'Подтверждена', en: 'Approved' },
  swapRejected: { uz: 'Rad etildi', ru: 'Отклонена', en: 'Rejected' },
  swapPendingCount: { uz: 'ta kutilmoqda', ru: 'в ожидании', en: 'pending' },
  swapSamePerson: {
    uz: 'Bir xil xodim tanlangan',
    ru: 'Выбран один и тот же сотрудник',
    en: 'The same person is selected twice',
  },
  swapNeedReason: { uz: 'Sababni yozing', ru: 'Укажите причину', en: 'State the reason' },
  swapSent: {
    uz: "So'rov menejerga yuborildi",
    ru: 'Заявка отправлена менеджеру',
    en: 'Request sent to the manager',
  },
  swapApprovedFlash: {
    uz: 'Almashtirish tasdiqlandi · ikkala xodimga xabar yuborildi',
    ru: 'Подмена подтверждена · оба сотрудника уведомлены',
    en: 'Swap approved · both staff notified',
  },
  swapRejectedFlash: { uz: "So'rov rad etildi", ru: 'Заявка отклонена', en: 'Request rejected' },

  bookings: { uz: 'Bugungi bandlovlar', ru: 'Брони на сегодня', en: 'Today’s reservations' },
  bookingsCount: { uz: 'ta bandlov', ru: 'броней', en: 'bookings' },
  bookingAdd: { uz: "Bandlov qo'shish", ru: 'Добавить бронь', en: 'Add booking' },
  bookingSave: { uz: 'Saqlash', ru: 'Сохранить', en: 'Save' },
  bookingCancelBtn: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  bookingDrop: { uz: 'Bandlovni bekor qilish', ru: 'Отменить бронь', en: 'Cancel booking' },
  bookingMove: { uz: 'Vaqtini ko‘chirish', ru: 'Перенести время', en: 'Move the booking' },
  bookingMoveDo: { uz: 'Ko‘chirish va SMS', ru: 'Перенести и SMS', en: 'Move and notify' },
  bookingNewTime: { uz: 'Yangi vaqt', ru: 'Новое время', en: 'New time' },
  bookingNewTable: { uz: 'Yangi stol', ru: 'Новый стол', en: 'New table' },
  bookingSms: {
    uz: 'Mijozga yangi vaqt bilan SMS yuboriladi. Bandlov holati «Ko‘chirildi» bo‘ladi.',
    ru: 'Гостю уйдёт SMS с новым временем. Статус брони станет «Перенесена».',
    en: 'The guest gets an SMS with the new time and the booking is marked as moved.',
  },
  phName: { uz: 'Mijoz ismi', ru: 'Имя гостя', en: 'Guest name' },
  phTable: { uz: 'Stol', ru: 'Стол', en: 'Table' },
  phNote: {
    uz: "Izoh: deraza oldida, tug'ilgan kun...",
    ru: 'Примечание: у окна, день рождения...',
    en: 'Note: window seat, birthday...',
  },
  guests: { uz: 'kishi', ru: 'чел.', en: 'guests' },
  table: { uz: 'Stol', ru: 'Стол', en: 'Table' },
  needGuestName: {
    uz: 'Mijoz ismini kiriting',
    ru: 'Введите имя гостя',
    en: 'Enter a guest name',
  },
  needPhone: {
    uz: 'Telefon raqamini kiriting — tasdiqlash uchun kerak',
    ru: 'Введите телефон — нужен для подтверждения',
    en: 'Enter a phone number — it is needed to confirm',
  },
  needTime: {
    uz: "Vaqtni 19:30 ko'rinishida kiriting",
    ru: 'Введите время в формате 19:30',
    en: 'Enter the time as 19:30',
  },
  bookingAdded: {
    // No SMS: `POST /tables/reservations` records the booking and nothing
    // else. Saying a message went when none did is the one thing this line
    // must not do — the guest would then not be called.
    uz: 'Bandlov qo‘shildi',
    ru: 'Бронь добавлена',
    en: 'Booking added',
  },
  bookingDropped: {
    uz: 'Bandlov bekor qilindi · mijozga SMS yuborildi',
    ru: 'Бронь отменена · гостю отправлено SMS',
    en: 'Booking cancelled · the guest was notified by SMS',
  },
  bookingMovedTo: {
    uz: 'ga ko‘chirildi · mijozga SMS yuborildi',
    ru: '· бронь перенесена, гостю отправлено SMS',
    en: '· the guest was notified by SMS',
  },
  stateConfirmed: { uz: 'Tasdiqlangan', ru: 'Подтверждена', en: 'Confirmed' },
  statePrepaid: { uz: 'Oldindan to‘langan', ru: 'Предоплата', en: 'Prepaid' },
  statePending: { uz: 'Kutilmoqda', ru: 'Ожидание', en: 'Pending' },
  stateMoved: { uz: 'Ko‘chirildi', ru: 'Перенесена', en: 'Moved' },

  checklist: { uz: 'Ochilish checklisti', ru: 'Чеклист открытия', en: 'Opening checklist' },
  checklistDone: { uz: 'bajarildi', ru: 'выполнено', en: 'done' },
  /** Said out loud, because a tick that is not recorded is worse than no tick. */
  checklistTemplate: {
    uz: "Namunaviy ro'yxat — belgilar hech qayerda saqlanmaydi.",
    ru: 'Шаблонный список — отметки нигде не сохраняются.',
    en: 'A template list — the ticks are not recorded anywhere.',
  },
  checklistFailed: {
    uz: 'Server javob bermadi — belgi saqlanmadi',
    ru: 'Сервер не ответил — отметка не сохранена',
    en: 'The server did not answer — the tick was not recorded',
  },

  /* ---- The swap request form ---- */
  swapAsk: { uz: "Almashish so'rash", ru: 'Попросить замену', en: 'Request a swap' },
  swapAskClose: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  swapShift: { uz: 'Qaysi smena', ru: 'Какая смена', en: 'Which shift' },
  swapSending: { uz: 'Yuborilmoqda…', ru: 'Отправляем…', en: 'Sending…' },
  swapNeedShift: {
    uz: 'Avval smenani tanlang',
    ru: 'Сначала выберите смену',
    en: 'Choose a shift first',
  },
  swapNoShifts: {
    uz: "Kelgusi hafta uchun e'lon qilingan smena yo'q",
    ru: 'На ближайшие дни нет опубликованных смен',
    en: 'There are no published shifts to ask about',
  },
  swapFailed: {
    uz: "Server javob bermadi — so'rov yuborilmadi",
    ru: 'Сервер не ответил — запрос не отправлен',
    en: 'The server did not answer — nothing was sent',
  },
  cancel: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
} as const satisfies Record<string, Trilingual>;

/**
 * One row of the swap queue, as the screen draws it.
 *
 * Here rather than in `shifts-server.ts` because the convention this console
 * follows is that types and fixtures live in `*-data.ts` and only server calls
 * live in the `*-server.ts` beside it — `SwapQueue` is a client island, and a
 * client island importing anything from a module that reads `next/headers` is
 * how that file ends up in the browser bundle.
 */
export type SwapRow = {
  id: string;
  /** Whose shift it is. */
  from: string;
  /** Who is being asked, or an em dash for a request open to anyone. */
  to: string;
  /** The weekday heading the shift falls on, already resolved. */
  day: string;
  reason: string;
};

/**
 * The week the rota is showing, in the reader's words.
 *
 * `console.shifts.rotaSub` held "11–17 avgust" as a literal, above a grid whose
 * week is computed from today — so the caption and the columns it labelled
 * disagreed in every week but one, and a manager reading the caption schedules
 * against the wrong dates.
 *
 * `formatRange` rather than two formats joined with a dash: it is the one that
 * knows a range in Uzbek reads "10–16 avgust" and in English "August 10 – 16",
 * and hand-joining produced "10–August 16" for half the readers.
 *
 * The `T00:00:00` on both ends is load-bearing. `new Date('2026-08-10')` is
 * midnight UTC, which is the ninth anywhere west of Greenwich — a caption a day
 * out for a third of the world.
 */
export function weekLabel(week: { from: string; to: string }, locale: string): string {
  const from = new Date(`${week.from}T00:00:00`);
  const to = new Date(`${week.to}T00:00:00`);

  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).formatRange(from, to);
}

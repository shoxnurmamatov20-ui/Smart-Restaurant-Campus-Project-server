/**
 * Everything this surface says, in three languages.
 *
 * **A staging post, not the final home.** Catalogues belong in
 * `apps/web/src/i18n`, which this session does not own, so the copy is written
 * here in the shape that file wants and handed over as one group. When it
 * lands, each section below becomes a namespace under `setup` and this module
 * collapses to a re-export — call sites do not change, because they already
 * read through `copy()` rather than reaching into the object.
 *
 * Two rules decide what may live in here.
 *
 * **Copy, never data.** A dish name, a zone name, a payment rail and the word
 * "so'm" are content a restaurant owns; they are in `setup-data.ts`. What is
 * here is what the product says about itself, which no restaurant edits.
 *
 * **No key whose three languages are identical.** `i18n.test.ts` rejects those,
 * and it is right to — a row that reads the same in all three is data wearing a
 * catalogue key, and whoever finds it first will edit it in the wrong place.
 * 'PIN' is the case that bites on this screen: it is the same word in Uzbek,
 * Russian and English, so it is written literally in the markup rather than
 * given a key here.
 *
 * Uzbek is the authoring language; Russian is neutral-professional and English
 * is the most concise of the three (START-HERE §6). All three came out of the
 * design file verbatim wherever the design had a sentence for it, so a reviewer
 * can diff them against the prototype.
 */

import type { Lang, StepId, Trilingual } from './setup-data';

type Section = Readonly<Record<string, Trilingual>>;

export type Resolved<S extends Section> = { readonly [K in keyof S]: string };

/**
 * Pick one language out of a section.
 *
 * Returns a plain object rather than a lookup function so a component
 * destructures once at the top and the rest of it reads as prose. The generic
 * keeps the keys, so a mistyped key is a compile error — which is the whole
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

/**
 * Substitute `{name}` placeholders.
 *
 * Uzbek, Russian and English put a number in different places in a sentence —
 * '3-qadam', 'Шаг 3', 'Step 3' — so the number cannot be concatenated onto a
 * translated fragment. Each language carries the whole sentence with a hole in
 * it, and this fills the hole.
 */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/* ============================================================
   The shell — the header, the rail, the footer buttons
   ============================================================ */

export const SHELL = {
  wizard: { uz: "Boshlang'ich sozlash", ru: 'Первоначальная настройка', en: 'First-run setup' },
  saveExit: { uz: 'Saqlab chiqish', ru: 'Сохранить и выйти', en: 'Save and exit' },
  steps: { uz: 'Qadamlar', ru: 'Шаги', en: 'Steps' },
  optional: { uz: 'ixtiyoriy', ru: 'необязательно', en: 'optional' },
  canSkip: { uz: 'Keyinroq qilish mumkin', ru: 'Можно сделать позже', en: 'Can be done later' },
  required: { uz: 'Majburiy', ru: 'Обязательно', en: 'Required' },
  doneShort: { uz: 'bajarildi', ru: 'выполнено', en: 'done' },
  progress: {
    uz: '{done}/{total} bajarildi',
    ru: '{done}/{total} выполнено',
    en: '{done}/{total} done',
  },
  timeLeft: {
    uz: 'taxminan {n} daqiqa qoldi',
    ru: 'осталось примерно {n} минут',
    en: 'about {n} minutes left',
  },
  allDone: { uz: 'hammasi bajarildi', ru: 'всё выполнено', en: 'all done' },
  stepOf: { uz: 'Qadam {n} / {total}', ru: 'Шаг {n} / {total}', en: 'Step {n} / {total}' },
  minToOpen: { uz: 'Ochilish uchun eng kami', ru: 'Минимум для открытия', en: 'Minimum to open' },
  minToOpenP: {
    uz: 'Filial, bitta stol, bitta taom va kassa. Qolgan hammasi keyinroq — mijoz kutmaydi.',
    ru: 'Филиал, один стол, одно блюдо и касса. Всё остальное позже — гость не ждёт.',
    en: 'A branch, one table, one dish and a till. Everything else can wait — the guest will not.',
  },
  back: { uz: 'Orqaga', ru: 'Назад', en: 'Back' },
  later: { uz: 'Keyinroq', ru: 'Позже', en: 'Later' },
  continue: { uz: 'Davom etish', ru: 'Продолжить', en: 'Continue' },
  language: { uz: 'Interfeys tili', ru: 'Язык интерфейса', en: 'Interface language' },
  saved: {
    uz: 'Shu brauzerda saqlandi — qaytganingizda shu qadamdan davom etasiz',
    ru: 'Сохранено в этом браузере — вернётесь на этот же шаг',
    en: 'Saved in this browser — you will come back to this step',
  },
} as const;

/* ============================================================
   Words said on more than one step
   ============================================================ */

export const SHARED = {
  saving: { uz: 'Saqlanmoqda…', ru: 'Сохранение…', en: 'Saving…' },
  retry: { uz: 'Qayta urinish', ru: 'Повторить', en: 'Try again' },
  /*
   * The design's own rule for an error message, FOUNDATIONS §5: say what failed
   * and what to do. Never 'Oops'. A restaurant owner half-way through setting
   * up their business needs to know whether to wait or to change something.
   */
  offline: {
    uz: "Server javob bermadi. Internetni tekshiring va qayta urinib ko'ring.",
    ru: 'Сервер не ответил. Проверьте интернет и повторите.',
    en: 'The server did not answer. Check the connection and try again.',
  },
  refused: {
    uz: "Server rad etdi. Quyidagini o'zgartiring va qayta yuboring.",
    ru: 'Сервер отклонил запрос. Измените указанное ниже и отправьте снова.',
    en: 'The server refused this. Change what it names below and send again.',
  },
  noSession: {
    uz: 'Sessiya tugagan — qayta kiring, keyin shu qadamdan davom etasiz.',
    ru: 'Сессия истекла — войдите снова, потом продолжите с этого шага.',
    en: 'The session has expired — sign in again and carry on from this step.',
  },
  created: { uz: 'yaratildi', ru: 'создано', en: 'created' },
  /*
   * The honesty block. Steps whose endpoint does not exist still render, still
   * validate and then say this, rather than collecting a restaurant's tax
   * details into nothing and reporting success.
   */
  notWiredH: {
    uz: 'Bu qadam hali serverga ulanmagan',
    ru: 'Этот шаг ещё не подключён к серверу',
    en: 'This step is not connected yet',
  },
} as const;

/* ============================================================
   The rail — one title and one line of meta per step
   ============================================================ */

export const STEP_TITLES: Readonly<Record<StepId, Trilingual>> = {
  restaurant: { uz: 'Restoran', ru: 'Ресторан', en: 'Restaurant' },
  branch: { uz: 'Filial', ru: 'Филиал', en: 'Branch' },
  floor: { uz: 'Zal va stollar', ru: 'Зал и столы', en: 'Floor and tables' },
  menu: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
  tax: { uz: "Soliq va to'lov", ru: 'Налоги и оплата', en: 'Tax and payment' },
  crew: { uz: 'Xodimlar', ru: 'Сотрудники', en: 'People' },
  devices: { uz: 'Qurilmalar', ru: 'Устройства', en: 'Devices' },
  ready: { uz: 'Tayyor', ru: 'Готово', en: 'Ready' },
};

export const STEP_META: Readonly<Record<StepId, Trilingual>> = {
  restaurant: {
    uz: 'Nom, STIR, oshxona turi',
    ru: 'Название, ИНН, тип кухни',
    en: 'Name, tax ID, kitchen',
  },
  branch: {
    uz: 'Manzil, ish vaqti, ish kuni',
    ru: 'Адрес, часы, рабочий день',
    en: 'Address, hours, business day',
  },
  floor: {
    uz: 'Zonalar, stollar, QR kodlar',
    ru: 'Зоны, столы, QR-коды',
    en: 'Zones, tables, QR codes',
  },
  menu: {
    uz: "Andoza, import yoki qo'lda",
    ru: 'Шаблон, импорт или вручную',
    en: 'Template, import or by hand',
  },
  tax: {
    uz: 'QQS, xizmat haqi, fiskal modul',
    ru: 'НДС, сервис, фискальный модуль',
    en: 'VAT, service, fiscal module',
  },
  crew: { uz: 'Rollar va PIN kodlar', ru: 'Роли и PIN-коды', en: 'Roles and PIN codes' },
  devices: {
    uz: 'Planshet, ekran, printerlar',
    ru: 'Планшет, экран, принтеры',
    en: 'Tablet, screen, printers',
  },
  ready: { uz: 'Tekshirish va ochish', ru: 'Проверка и открытие', en: 'Review and open' },
};

/**
 * Why each step is being asked for.
 *
 * Every one of these says what the value is *for* and what happens if it is
 * changed later. That is the difference between a form and a briefing, and on
 * a screen that collects the numbers a whole business will rest on, the
 * briefing is the product.
 */
export const STEP_INTRO: Readonly<Record<StepId, Trilingual>> = {
  restaurant: {
    uz: "Bu ma'lumotlar chekda, hisob-fakturada va soliq hisobotida chiqadi. Keyinchalik o'zgartirish mumkin, lekin STIR o'zgarsa eski cheklar qayta chiqarilmaydi.",
    ru: 'Эти данные печатаются на чеке, в счёте-фактуре и в налоговой отчётности. Изменить можно позже, но при смене ИНН старые чеки не перевыпускаются.',
    en: 'These details print on receipts, invoices and tax filings. They stay editable, but changing the tax ID does not reissue old receipts.',
  },
  branch: {
    uz: "Birinchi filialni qo'shamiz. Qolganlarini keyin qo'shasiz — har biri o'z stollari, xodimlari va omboriga ega bo'ladi.",
    ru: 'Добавим первый филиал. Остальные добавите позже — у каждого свои столы, сотрудники и склад.',
    en: 'We will add the first branch. The rest come later, each with its own tables, staff and stock.',
  },
  floor: {
    uz: "Zonalarni ajratish ofitsiantga stolni tezroq topishga yordam beradi. Stol raqamlari avtomatik beriladi va keyin o'zgartirilishi mumkin.",
    ru: 'Разделение на зоны помогает официанту быстрее находить стол. Номера столов присваиваются автоматически и потом меняются.',
    en: 'Zones help a waiter find a table faster. Table numbers are assigned automatically and can be renamed later.',
  },
  menu: {
    uz: "Menyusiz buyurtma qabul qilib bo'lmaydi — bu eng muhim qadam. Uchta yo'ldan bittasini tanlaysiz, keyin baribir tahrirlaysiz.",
    ru: 'Без меню заказ принять нельзя — это самый важный шаг. Выберите один из трёх путей, править всё равно будете потом.',
    en: 'No menu means no orders — this is the step that matters most. Pick one of three routes; you will edit it either way.',
  },
  tax: {
    uz: "Bu sozlamalar har bir chekka ta'sir qiladi, shuning uchun ular birinchi smenadan oldin to'g'ri bo'lishi kerak. Keyin o'zgartirilsa, eski cheklar qayta hisoblanmaydi.",
    ru: 'Эти настройки влияют на каждый чек, поэтому должны быть верными до первой смены. При изменении позже старые чеки не пересчитываются.',
    en: 'These settings touch every receipt, so they must be right before the first shift. Changing them later does not recalculate old receipts.',
  },
  crew: {
    uz: "Bitta odam bir nechta rolga ega bo'lishi mumkin — kichik restoranda ofitsiant ham kassir bo'ladi. Hozir o'tkazib yuborsangiz, o'zingiz hamma rolda ishlaysiz.",
    ru: 'Один человек может иметь несколько ролей — в маленьком ресторане официант же и кассир. Если пропустить, вы будете работать во всех ролях сами.',
    en: 'One person can hold several roles — in a small restaurant the waiter is also the cashier. Skip this and you work every role yourself.',
  },
  devices: {
    uz: "Kompyuterdan ham ishlash mumkin, lekin planshet va oshxona printeri bo'lmasa buyurtmani oshxonaga og'zaki aytish kerak bo'ladi.",
    ru: 'Работать можно и с компьютера, но без планшета и кухонного принтера заказ придётся передавать на словах.',
    en: 'A computer alone works, but without a tablet and a kitchen printer the order has to be passed on by voice.',
  },
  ready: {
    uz: "Ochilish uchun kerak bo'lgan narsalarni tekshirib chiqing. Yetishmayotgani bo'lsa, o'sha qadamga qaytish mumkin.",
    ru: 'Проверьте, что нужно для открытия. Если чего-то не хватает, можно вернуться к нужному шагу.',
    en: 'Check what opening requires. If something is missing, step back to it.',
  },
};

/* ============================================================
   Step 1 — the restaurant
   ============================================================ */

export const STEP_RESTAURANT = {
  name: { uz: 'Restoran nomi', ru: 'Название ресторана', en: 'Restaurant name' },
  taxId: { uz: 'STIR', ru: 'ИНН', en: 'Tax ID' },
  taxIdNote: {
    uz: 'Chekda va hisob-fakturada chiqadi',
    ru: 'Печатается на чеке и в счёте-фактуре',
    en: 'Printed on receipts and invoices',
  },
  taxIdInvalid: {
    uz: "STIR to'qqiz raqamdan iborat",
    ru: 'ИНН состоит из девяти цифр',
    en: 'A tax ID is nine digits',
  },
  nameRequired: {
    uz: "Restoran nomisiz chek chiqarib bo'lmaydi",
    ru: 'Без названия ресторана чек не напечатать',
    en: 'A receipt cannot print without the restaurant name',
  },
  cuisine: { uz: 'Oshxona turi', ru: 'Тип кухни', en: 'Kind of kitchen' },
  cuisineNote: {
    uz: "Bu menyu andozasini va oshxona bo'limlarini tanlashga yordam beradi.",
    ru: 'Это помогает подобрать шаблон меню и цеха кухни.',
    en: 'This picks the menu template and the kitchen stations for you.',
  },
  langs: { uz: 'Ish tillari', ru: 'Рабочие языки', en: 'Working languages' },
  langsNote: {
    uz: "Menyu va cheklar shu tillarda bo'ladi",
    ru: 'Меню и чеки будут на этих языках',
    en: 'Menus and receipts use these languages',
  },
  currency: { uz: 'Valyuta', ru: 'Валюта', en: 'Currency' },
  currencyNote: {
    uz: "O'zbekiston uchun o'zgartirilmaydi",
    ru: 'Для Узбекистана не меняется',
    en: 'Fixed for Uzbekistan',
  },
  notWired: {
    uz: "Restoran profili uchun API'da endpoint yo'q: nom, STIR va oshxona turi shu brauzerda saqlanadi va yakuniy ro'yxatda ko'rsatiladi, lekin serverga yozilmaydi. Ularni hozircha konsolning Sozlamalar bo'limidan kiritish kerak.",
    ru: 'В API нет эндпоинта профиля ресторана: название, ИНН и тип кухни сохраняются в этом браузере и показываются в итоговом списке, но на сервер не записываются. Пока их нужно вносить в разделе «Настройки».',
    en: 'The API has no restaurant-profile endpoint: the name, tax ID and kitchen kind are kept in this browser and shown in the summary, but never written to the server. Enter them in Settings for now.',
  },
} as const;

/* ============================================================
   Step 2 — the branch
   ============================================================ */

export const STEP_BRANCH = {
  name: { uz: 'Filial nomi', ru: 'Название филиала', en: 'Branch name' },
  city: { uz: 'Shahar', ru: 'Город', en: 'City' },
  address: { uz: 'Manzil', ru: 'Адрес', en: 'Address' },
  phone: { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
  hours: { uz: 'Ish vaqti', ru: 'Часы работы', en: 'Opening hours' },
  hoursNote: {
    uz: "Yopilish yarim kechadan keyin bo'lishi mumkin",
    ru: 'Закрытие может быть после полуночи',
    en: 'Closing may fall after midnight',
  },
  hoursInvalid: {
    uz: "Vaqt SS:DD ko'rinishida bo'lsin — masalan 10:00",
    ru: 'Время в формате ЧЧ:ММ — например 10:00',
    en: 'Time as HH:MM — 10:00, for instance',
  },
  nameRequired: {
    uz: 'Filial nomi kerak — kassada va chekda shu nom chiqadi',
    ru: 'Нужно название филиала — оно на кассе и на чеке',
    en: 'The branch needs a name — it shows at the till and on the receipt',
  },
  addressRequired: {
    uz: "Manzilsiz yetkazib berish va chek manzili bo'sh qoladi",
    ru: 'Без адреса доставка и адрес на чеке остаются пустыми',
    en: 'Without an address, delivery and the receipt footer stay blank',
  },
  bizDay: {
    uz: 'Ish kuni qachon boshlanadi',
    ru: 'Когда начинается рабочий день',
    en: 'When the business day starts',
  },
  bizDayP: {
    uz: "Restoran yarim kechadan keyin ishlaydi, shuning uchun kechqurungi tushum kalendar kunga bo'linib ketmasligi kerak. Ish kuni shu vaqtdan boshlanadi va ertasi kun shu vaqtda tugaydi.",
    ru: 'Ресторан работает после полуночи, поэтому вечерняя выручка не должна делиться по календарным дням. Рабочий день начинается в это время и заканчивается в это же время на следующий день.',
    en: "The restaurant works past midnight, so the evening's takings must not split across calendar days. The business day starts at this time and ends at the same time the next day.",
  },
  bizDayEx: {
    uz: "01:30 dagi buyurtma o'tgan kunga yoziladi. Barcha hisobotlar shu qoidaga bo'ysunadi.",
    ru: 'Заказ в 01:30 относится к предыдущему дню. Все отчёты подчиняются этому правилу.',
    en: 'An order at 01:30 belongs to the previous day. Every report follows this rule.',
  },
  bizDayNotWired: {
    uz: "Ish kuni chegarasini server o'z konfiguratsiyasidan oladi — bu yerdagi qiymat filialning settings ustuniga yoziladi, lekin hisobotlarni hali o'zgartirmaydi.",
    ru: 'Границу рабочего дня сервер берёт из своей конфигурации — значение отсюда пишется в settings филиала, но пока не меняет отчёты.',
    en: 'The server takes the business-day boundary from its own configuration. What is set here is stored on the branch, but does not yet move the reports.',
  },
  created: { uz: 'Filial yaratildi', ru: 'Филиал создан', en: 'Branch created' },
} as const;

/* ============================================================
   Step 3 — the floor
   ============================================================ */

export const STEP_FLOOR = {
  tables: { uz: 'stol', ru: 'столов', en: 'tables' },
  seats: { uz: "o'rin", ru: 'мест', en: 'seats' },
  zones: { uz: 'zona', ru: 'зоны', en: 'zones' },
  addZone: { uz: "Zona qo'shish", ru: 'Добавить зону', en: 'Add a zone' },
  removeZone: { uz: 'Zonani olib tashlash', ru: 'Убрать зону', en: 'Remove the zone' },
  willCreate: { uz: 'stol yaratiladi', ru: 'столов будет создано', en: 'tables will be created' },
  qrH: { uz: 'QR kodlar', ru: 'QR-коды', en: 'QR codes' },
  qrP: {
    uz: "Har bir stol uchun QR yaratiladi. Mehmon skanerlaganda menyu ochiladi va buyurtma shu stolga bog'lanadi.",
    ru: 'Для каждого стола создаётся QR. Гость сканирует — открывается меню, заказ привязан к этому столу.',
    en: 'Each table gets a QR. The guest scans it, the menu opens, and the order binds to that table.',
  },
  qrBtn: { uz: "PDF bo'lib yuklab olish", ru: 'Скачать в PDF', en: 'Download as PDF' },
  qrNotWired: {
    uz: "QR to'plamini tayyorlaydigan endpoint hali yo'q — stollar yaratilgach, har bir stolning QR havolasi /qr/<restoran>/<stol> ko'rinishida ishlaydi.",
    ru: 'Эндпоинта для пакета QR пока нет — после создания столов ссылка каждого стола работает как /qr/<ресторан>/<стол>.',
    en: 'There is no endpoint for the QR pack yet. Once the tables exist, each one answers at /qr/<restaurant>/<table>.',
  },
  needOne: {
    uz: "Kamida bitta stol kerak — aks holda buyurtmani hech qayerga bog'lab bo'lmaydi",
    ru: 'Нужен хотя бы один стол — иначе заказ не к чему привязать',
    en: 'At least one table is needed, or an order has nothing to attach to',
  },
  created: {
    uz: 'Zonalar va stollar yaratildi',
    ru: 'Зоны и столы созданы',
    en: 'Zones and tables created',
  },
} as const;

/* ============================================================
   Step 4 — the menu
   ============================================================ */

export const STEP_MENU = {
  routeExcel: { uz: 'Excel fayldan yuklash', ru: 'Загрузить из Excel', en: 'Import from Excel' },
  routeExcelP: {
    uz: "Menyungiz allaqachon jadvalda bo'lsa, eng tez yo'l. Ustunlarni moslashtirasiz, tizim tekshiradi.",
    ru: 'Если меню уже в таблице — самый быстрый путь. Сопоставите столбцы, система проверит.',
    en: 'Fastest if your menu is already a spreadsheet. Map the columns and the system validates.',
  },
  routeExcelMeta: {
    uz: 'Taxminan 6 daqiqa · 40–200 pozitsiya',
    ru: 'Примерно 6 минут · 40–200 позиций',
    en: 'About 6 minutes · 40–200 items',
  },
  routeTemplate: { uz: 'Andozadan boshlash', ru: 'Начать с шаблона', en: 'Start from a template' },
  routeTemplateP: {
    uz: "O'zbek restorani uchun tayyor menyu: {n} taom, kategoriyalar, oshxona bo'limlari bilan.",
    ru: 'Готовое меню для узбекского ресторана: {n} блюд с категориями и цехами.',
    en: 'A ready menu for an Uzbek restaurant: {n} dishes with categories and stations.',
  },
  routeTemplateMeta: {
    uz: 'Taxminan 4 daqiqa · keyin tahrirlash mumkin',
    ru: 'Примерно 4 минуты · потом можно править',
    en: 'About 4 minutes · editable afterwards',
  },
  routeManual: { uz: "Qo'lda kiritish", ru: 'Ввести вручную', en: 'Enter by hand' },
  routeManualP: {
    uz: "Kichik menyu bo'lsa yoki hozir faqat bir nechta taom kerak bo'lsa.",
    ru: 'Если меню небольшое или сейчас нужно всего несколько блюд.',
    en: 'For a short menu, or when only a few dishes are needed now.',
  },
  routeManualMeta: {
    uz: "Bitta taom ham yetarli — qolganini keyin qo'shasiz",
    ru: 'Достаточно одного блюда — остальное потом',
    en: 'One dish is enough — add the rest later',
  },
  recommended: { uz: 'TAVSIYA ETILADI', ru: 'РЕКОМЕНДУЕМ', en: 'RECOMMENDED' },
  presetIncl: {
    uz: 'Andozada nima bor',
    ru: 'Что входит в шаблон',
    en: 'What the template includes',
  },
  presetCount: { uz: '{n} taom', ru: '{n} блюд', en: '{n} dishes' },
  presetNote: {
    uz: "Narxlar namuna uchun qo'yilgan — birinchi smenadan oldin o'zingizning narxlaringizni kiriting.",
    ru: 'Цены проставлены для примера — до первой смены введите свои.',
    en: 'Prices are placeholders — put your own in before the first shift.',
  },
  excelNotWired: {
    uz: "Import endpointi hali yo'q: fayl o'qiladigan joy ham, ustunlarni moslashtirish ekrani ham yozilmagan. Hozircha andozani oling yoki bir nechta taomni qo'lda kiriting.",
    ru: 'Эндпоинта импорта пока нет: ни разбора файла, ни экрана сопоставления столбцов. Возьмите шаблон или введите несколько блюд вручную.',
    en: 'There is no import endpoint yet — neither the file parse nor the column-mapping screen exists. Take the template, or type a few dishes by hand.',
  },
  dishName: { uz: 'Taom nomi', ru: 'Название блюда', en: 'Dish name' },
  dishPrice: { uz: 'Narxi', ru: 'Цена', en: 'Price' },
  addDish: { uz: "Taom qo'shish", ru: 'Добавить блюдо', en: 'Add a dish' },
  removeDish: { uz: 'Qatorini olib tashlash', ru: 'Убрать строку', en: 'Remove the row' },
  manualCategory: {
    uz: "Qo'lda kiritilgan taomlar «Menyu» degan bitta kategoriyaga tushadi — keyin bo'lasiz.",
    ru: 'Введённые вручную блюда попадут в одну категорию «Меню» — разделите потом.',
    en: 'Dishes typed here land in a single category called Menu; split it later.',
  },
  manualNameRequired: {
    uz: "Nomsiz taomni kassada bosib bo'lmaydi",
    ru: 'Блюдо без названия на кассе не нажать',
    en: 'A dish with no name cannot be pressed at the till',
  },
  manualPriceRequired: {
    uz: "Narxi butun so'mda bo'lsin",
    ru: 'Цена — целое число сумов',
    en: 'The price is a whole number of som',
  },
  needOne: {
    uz: 'Kamida bitta taom kerak',
    ru: 'Нужно хотя бы одно блюдо',
    en: 'At least one dish is needed',
  },
  created: { uz: 'Menyu yaratildi', ru: 'Меню создано', en: 'Menu created' },
} as const;

/* ============================================================
   Step 5 — tax, rounding, payment, the fiscal module
   ============================================================ */

export const STEP_TAX = {
  vat: { uz: 'QQS', ru: 'НДС', en: 'VAT' },
  vatIn: { uz: 'Narx ichida', ru: 'В цене', en: 'In the price' },
  vatOn: { uz: 'Narx ustiga', ru: 'Сверху цены', en: 'On top' },
  vatNote: {
    uz: "Menyudagi narx — mijoz to'laydigan narx. Kassada summa oshmaydi.",
    ru: 'Цена в меню — цена к оплате. На кассе сумма не вырастет.',
    en: 'The menu price is the price paid. Nothing is added at the till.',
  },
  service: { uz: 'Xizmat haqi', ru: 'Сервисный сбор', en: 'Service charge' },
  rounding: { uz: 'Naqd yaxlitlash', ru: 'Округление наличных', en: 'Cash rounding' },
  roundingP: {
    uz: "Naqd to'lovda jami summa shu qadamga yaxlitlanadi. Karta va Click yaxlitlanmaydi.",
    ru: 'При оплате наличными сумма округляется до этого шага. Карта и Click не округляются.',
    en: 'Cash totals round to this step. Card and Click are taken exactly.',
  },
  payMethods: { uz: "To'lov turlari", ru: 'Способы оплаты', en: 'Payment methods' },
  fiscal: {
    uz: 'Onlayn-kassa (fiskal modul)',
    ru: 'Онлайн-касса (фискальный модуль)',
    en: 'Fiscal module',
  },
  mandatory: { uz: 'QONUNIY TALAB', ru: 'ТРЕБОВАНИЕ ЗАКОНА', en: 'REQUIRED BY LAW' },
  fiscalP: {
    uz: 'Fiskal modulsiz chek qonuniy hisoblanmaydi. Modul raqamini kiriting.',
    ru: 'Без фискального модуля чек не имеет юридической силы. Введите номер модуля.',
    en: 'Without the fiscal module a receipt has no legal standing. Enter the module number.',
  },
  fiscalNo: { uz: 'Modul raqami', ru: 'Номер модуля', en: 'Module number' },
  fiscalInvalid: {
    uz: 'Modul raqami kamida sakkiz raqam',
    ru: 'Номер модуля — минимум восемь цифр',
    en: 'The module number is at least eight digits',
  },
  testConn: { uz: 'Ulanishni tekshirish', ru: 'Проверить связь', en: 'Test the connection' },
  fiscalTesting: { uz: 'Tekshirilmoqda…', ru: 'Проверяем…', en: 'Testing…' },
  fiscalOn: {
    uz: 'Ulangan · modul javob bermoqda',
    ru: 'Подключено · модуль отвечает',
    en: 'Connected · the module answers',
  },
  fiscalOff: {
    uz: "Modul o'chirilgan — sotuv to'xtamaydi, cheklar navbatga tushadi",
    ru: 'Модуль выключен — продажи не остановятся, чеки встанут в очередь',
    en: 'The module is switched off — sales continue and receipts queue',
  },
  fiscalFailed: {
    uz: "Javob yo'q — serverga ulanib bo'lmadi",
    ru: 'Нет ответа — сервер недоступен',
    en: 'No answer — the server could not be reached',
  },
  fiscalUntested: { uz: 'Tekshirilmagan', ru: 'Не проверено', en: 'Not tested' },
  fiscalNotWired: {
    uz: "Ulanishni tekshirish ishlaydi — u modul yoqilganmi va javob beradimi, shuni aytadi. Raqamning o'zini saqlaydigan endpoint hali yo'q, haqiqiy OFD drayveri ham. Sertifikatlash tashqi jarayon va sekin — uni birinchi haftadayoq boshlash kerak.",
    ru: 'Проверка связи работает — она говорит, включён ли модуль и отвечает ли он. Эндпоинта, который сохранит сам номер, ещё нет, как и настоящего драйвера ОФД. Сертификация — внешний и медленный процесс, начинать его надо в первую неделю.',
    en: 'The connection test works — it reports whether the module is switched on and answering. What does not exist yet is an endpoint that stores the number itself, and the real OFD driver. Certification is externally gated and slow — start it in week one.',
  },
  taxNotWired: {
    uz: "QQS, xizmat haqi va to'lov turlari uchun tenant darajasida endpoint yo'q. Yaxlitlash qadamini API faqat bitta joyda biladi — kassa terminalining settings.cash_rounding_tiyin maydoni.",
    ru: 'Для НДС, сервисного сбора и способов оплаты нет эндпоинта на уровне ресторана. Шаг округления API знает лишь в одном месте — settings.cash_rounding_tiyin терминала.',
    en: "There is no tenant-level endpoint for VAT, the service charge or the payment rails. The only place the API stores a rounding step today is a terminal's settings.cash_rounding_tiyin.",
  },
} as const;

/* ============================================================
   Step 6 — people and PINs
   ============================================================ */

export const STEP_CREW = {
  person: { uz: 'Xodim', ru: 'Сотрудник', en: 'Person' },
  role: { uz: 'Rol', ru: 'Роль', en: 'Role' },
  access: { uz: 'Kirish', ru: 'Доступ', en: 'Signs in' },
  accessEmail: { uz: 'Pochta va parol', ru: 'Почта и пароль', en: 'Email and password' },
  firstName: { uz: 'Ism', ru: 'Имя', en: 'First name' },
  lastName: { uz: 'Familiya', ru: 'Фамилия', en: 'Last name' },
  contact: { uz: 'Telefon yoki pochta', ru: 'Телефон или почта', en: 'Phone or email' },
  addCrew: { uz: "Xodim qo'shish", ru: 'Добавить сотрудника', en: 'Add a person' },
  inviteManager: {
    uz: 'Menejerni pochta orqali taklif qilish',
    ru: 'Пригласить менеджера по почте',
    en: 'Invite a manager by email',
  },
  removeCrew: { uz: 'Qatorini olib tashlash', ru: 'Убрать строку', en: 'Remove the row' },
  nameRequired: {
    uz: 'Ism va familiya kerak — chek va smena hisobotida shu chiqadi',
    ru: 'Нужны имя и фамилия — они в чеке и в отчёте смены',
    en: 'A first and last name are needed — both appear on receipts and shift reports',
  },
  pinInvalid: {
    uz: "PIN to'rt raqamdan iborat",
    ru: 'PIN состоит из четырёх цифр',
    en: 'A PIN is four digits',
  },
  pinWarnH: {
    uz: "PIN kodlar bir marta ko'rsatiladi",
    ru: 'PIN-коды показываются один раз',
    en: 'PIN codes are shown once',
  },
  pinWarnP: {
    uz: "Sozlash tugagandan keyin kodni ko'rish mumkin bo'lmaydi — faqat yangisini yaratish. Xodimlarga hozir yozib bering.",
    ru: 'После завершения настройки код увидеть нельзя — только создать новый. Раздайте их сотрудникам сейчас.',
    en: 'Once setup finishes the code cannot be read again, only replaced. Hand them out now.',
  },
  pinNotWired: {
    uz: "PIN hali serverga yozilmaydi: POS'da faqat o'z PIN'ini almashtirish endpointi bor (pos/auth/pin/rotate), boshqa odamga PIN qo'yadigan yo'q. Xodimlar yaratiladi, PIN'ni keyin kassada berish kerak.",
    ru: 'PIN пока не пишется на сервер: в POS есть только смена собственного PIN (pos/auth/pin/rotate), а назначить PIN другому человеку нечем. Сотрудники создаются, PIN выдаётся потом на кассе.',
    en: 'A PIN is not written to the server yet: POS exposes only pos/auth/pin/rotate, which changes your own. The people are created; their PINs have to be issued at the till afterwards.',
  },
  created: { uz: 'Xodimlar yaratildi', ru: 'Сотрудники созданы', en: 'People created' },
} as const;

/* ============================================================
   Step 7 — devices
   ============================================================ */

export const STEP_DEVICES = {
  pairH: { uz: 'Planshetni ulash', ru: 'Подключить планшет', en: 'Pair a tablet' },
  pairP: {
    uz: "Planshetda ilovani ochib, shu kodni kiriting. Har bir qurilma bir marta ulanadi va keyin o'zi eslab qoladi.",
    ru: 'Откройте приложение на планшете и введите этот код. Каждое устройство подключается один раз и запоминается.',
    en: 'Open the app on the tablet and enter this code. Each device pairs once and remembers itself.',
  },
  pairExp: {
    uz: 'Kod eskirgach yangisini olish mumkin.',
    ru: 'Когда код истечёт, можно получить новый.',
    en: 'When the code expires, a new one can be issued.',
  },
  issueCode: { uz: 'Kod olish', ru: 'Получить код', en: 'Issue a code' },
  noTerminals: {
    uz: "Hali birorta kassa yaratilmagan. Konsolning Sozlamalar bo'limida kassa qo'shing, keyin shu yerdan kod oling.",
    ru: 'Кассы ещё не созданы. Добавьте кассу в «Настройках», затем получите здесь код.',
    en: 'No till exists yet. Add one in Settings, then issue a code here.',
  },
  paired: { uz: 'Ulangan', ru: 'Подключён', en: 'Paired' },
  unpaired: { uz: 'Ulanmagan', ru: 'Не подключён', en: 'Not paired' },
  online: { uz: 'Ishlayapti', ru: 'На связи', en: 'Online' },
  printers: { uz: 'Printerlar', ru: 'Принтеры', en: 'Printers' },
  noPrinters: {
    uz: "Printer ro'yxatga olinmagan. Oshxona chiptalari faqat ekranda qoladi.",
    ru: 'Принтеры не зарегистрированы. Кухонные чеки останутся только на экране.',
    en: 'No printer is registered. Kitchen tickets will stay on screen only.',
  },
  testPrint: { uz: 'Sinov cheki', ru: 'Тестовый чек', en: 'Test print' },
  /* `Printer::STATES` on the server: ready, busy, offline, error. */
  stateReady: { uz: 'Tayyor', ru: 'Готов', en: 'Ready' },
  stateBusy: { uz: 'Band', ru: 'Занят', en: 'Busy' },
  stateOffline: { uz: 'Ulanmagan', ru: 'Не на связи', en: 'Offline' },
  stateError: { uz: 'Xato', ru: 'Ошибка', en: 'Error' },
  testQueued: {
    uz: "Sinov cheki navbatga qo'yildi",
    ru: 'Тестовый чек поставлен в очередь',
    en: 'Test ticket queued',
  },
  printerNote: {
    uz: "Oshxona printeri har bir bo'limga alohida bo'lishi kerak: grill cheki grillda, salat cheki salatda chiqsin. Bitta printerdan hamma bo'lim ishlasa, cheklar aralashadi.",
    ru: 'Кухонный принтер нужен на каждый цех: чек гриля — на гриле, чек салатов — на салатах. С одним принтером чеки перемешиваются.',
    en: 'Each station needs its own kitchen printer: the grill ticket prints at the grill, the salad ticket at the salads. One shared printer mixes them up.',
  },
} as const;

/* ============================================================
   Step 8 — the summary
   ============================================================ */

export const STEP_READY = {
  readyReq: {
    uz: "Ochilish uchun kerak bo'lgan narsalar",
    ru: 'Что нужно для открытия',
    en: 'What opening requires',
  },
  readyLater: {
    uz: 'Keyinroq qilinadigan narsalar',
    ru: 'Что можно сделать позже',
    en: 'What can wait',
  },
  openH: {
    uz: 'Birinchi smenani ochishga tayyor',
    ru: 'Готово к открытию первой смены',
    en: 'Ready to open the first shift',
  },
  openP: {
    uz: "Kassa smenasi ochiladi va shu paytdan boshlab har bir to'lov shu smenaga tushadi. Sozlamalarni keyin ham o'zgartirish mumkin.",
    ru: 'Откроется кассовая смена, и с этого момента каждый платёж попадает в неё. Настройки можно менять и потом.',
    en: 'A cash shift opens, and from that moment every payment lands in it. Settings stay editable afterwards.',
  },
  openFloat: {
    uz: 'Smena nol qoldiq bilan ochiladi. Kassadagi pulni «Kassa» ekranida kupyura-kupyura sanaysiz — bu yerdan taxmin qilib yozilsa, kechqurun kamomad chiqadi.',
    ru: 'Смена открывается с нулевым остатком. Наличные пересчитаете по купюрам на экране «Касса» — записанное здесь наугад к вечеру даст недостачу.',
    en: 'The shift opens with a zero float. The drawer is counted note by note on the Till screen — a figure guessed here shows up as a shortfall by the evening.',
  },
  openBtn: {
    uz: 'Birinchi smenani ochish',
    ru: 'Открыть первую смену',
    en: 'Open the first shift',
  },
  opened: {
    uz: 'Kassa smenasi ochildi',
    ru: 'Кассовая смена открыта',
    en: 'The cash shift is open',
  },
  toTill: { uz: "Kassaga o'tish", ru: 'Перейти к кассе', en: 'Go to the till' },
  blocked: {
    uz: "Yetishmayotgan qadamga qaytib to'ldiring — keyin smena ochiladi",
    ru: 'Вернитесь к незаполненному шагу — потом смена откроется',
    en: 'Go back and fill the missing step, then the shift can open',
  },
  missing: { uz: 'kiritilmagan', ru: 'не указано', en: 'not given' },
  notSaved: {
    uz: 'serverga yozilmadi',
    ru: 'на сервер не записано',
    en: 'not written to the server',
  },
  rowRestaurant: { uz: "Restoran ma'lumotlari", ru: 'Данные ресторана', en: 'Restaurant details' },
  rowBranch: { uz: 'Filial', ru: 'Филиал', en: 'Branch' },
  rowTables: { uz: 'Stollar', ru: 'Столы', en: 'Tables' },
  rowMenu: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
  rowTax: { uz: "Soliq va to'lov", ru: 'Налоги и оплата', en: 'Tax and payment' },
  rowFiscal: { uz: 'Fiskal modul', ru: 'Фискальный модуль', en: 'Fiscal module' },
  laterStock: {
    uz: 'Ombor va texnologik kartalar',
    ru: 'Склад и техкарты',
    en: 'Inventory and recipe cards',
  },
  laterStockWhy: {
    uz: "tannarx aniq bo'lishi uchun",
    ru: 'чтобы себестоимость была точной',
    en: 'so food cost becomes accurate',
  },
  laterSuppliers: { uz: 'Yetkazib beruvchilar', ru: 'Поставщики', en: 'Suppliers' },
  laterSuppliersWhy: {
    uz: 'birinchi xariddan oldin',
    ru: 'до первой закупки',
    en: 'before the first purchase',
  },
  laterCrm: { uz: 'Mijozlar va sodiqlik', ru: 'Клиенты и лояльность', en: 'Customers and loyalty' },
  laterCrmWhy: {
    uz: 'birinchi haftadan keyin',
    ru: 'после первой недели',
    en: 'after the first week',
  },
  laterBooks: {
    uz: 'Buxgalteriya va byudjet',
    ru: 'Бухгалтерия и бюджет',
    en: 'Bookkeeping and budget',
  },
  laterBooksWhy: { uz: 'oy oxiriga qadar', ru: 'до конца месяца', en: 'before month end' },
} as const;

/**
 * The till's own words — the ones the shared catalogue does not carry.
 *
 * `console.pos` in `src/i18n` is the catalogue for everything the till already
 * drew. What is here is the copy the *design file* writes and the build had
 * nowhere to put: the three ways a bill splits (`Smart Restaurant OS.dc.html`
 * :17294–17330), and the sentences `flash()` says after an action — 445 calls
 * across the prototypes, none of which had a key.
 *
 * Kept beside the screens rather than merged into the catalogue because the
 * catalogue is shared with the console and the staff app, and this is till
 * vocabulary: "the ticket is empty", "on the stop list, disabled by the
 * kitchen". Same house rule as `(dashboard)/calls/calls-data.ts` — a trilingual
 * record, three languages filled by hand, copied from the design file verbatim.
 *
 * Every string below is the design's own `P("uz","ru","en")` triple. Nothing
 * here is a translation of anything; where the design wrote three sentences,
 * all three are here.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

/** The reader's language, defaulting the way the rest of the till does. */
export function say(locale: string, phrase: Trilingual): string {
  return phrase[(locale as Lang) in phrase ? (locale as Lang) : 'uz'];
}

/**
 * `{sum}`, `{n}`, `{name}` — the same placeholder shape the catalogue uses, so
 * a reader moving between this file and `i18n/uz.ts` is not learning a second
 * convention.
 */
export function fill(text: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(value),
    text,
  );
}

export const POS_COPY = {
  /* ---- the three ways a bill splits — dc.html:17294 ---- */

  splitByGuest: {
    uz: "Mehmon bo'yicha",
    ru: 'По гостям',
    en: 'By guest',
  },
  splitByItem: {
    uz: "Pozitsiya bo'yicha",
    ru: 'По позициям',
    en: 'By item',
  },
  splitByAmount: {
    uz: "Summa bo'yicha",
    ru: 'По сумме',
    en: 'By amount',
  },

  /** dc.html:9982 */
  splitAmountLabel: {
    uz: 'Birinchi chek summasi',
    ru: 'Сумма первого счёта',
    en: 'First bill amount',
  },
  /** dc.html:9997 */
  splitConfirm: {
    uz: 'Cheklarni yaratish',
    ru: 'Создать счета',
    en: 'Create the bills',
  },
  /** dc.html:9998 */
  splitFootnote: {
    uz: "Cheklar kassaga yuboriladi va alohida to'lanadi. Bo'lingandan keyin pozitsiya qo'shish menejer tasdig'ini talab qiladi.",
    ru: 'Счета уйдут на кассу и оплачиваются отдельно. После разделения добавление позиций требует согласования менеджера.',
    en: 'The bills go to the till and are paid separately. Adding lines after a split needs manager approval.',
  },

  /** dc.html:17264 — the guest-mode note, with the per-head figure in it. */
  splitGuestNote: {
    uz: "Har bir mehmon {sum} · oxirgi chekka yaxlitlash farqi qo'shiladi",
    ru: 'На каждого гостя {sum} · разница округления идёт в последний счёт',
    en: 'Each guest pays {sum} · the rounding difference goes on the last bill',
  },
  /** dc.html:17269 — item mode, after at least one line is ticked. */
  splitItemNote: {
    uz: "Belgilangan pozitsiyalar birinchi chekka o'tadi",
    ru: 'Отмеченные позиции идут в первый счёт',
    en: 'The ticked lines go on the first bill',
  },
  /** dc.html:17270 — item mode, nothing ticked yet. */
  splitItemEmptyNote: {
    uz: "Pozitsiyalarni belgilang — belgilanganlari birinchi chekka o'tadi",
    ru: 'Отметьте позиции — они пойдут в первый счёт',
    en: 'Tick the lines that go on the first bill',
  },
  /** dc.html:17274 */
  splitAmountNote: {
    uz: 'Birinchi chek uchun summani kiriting, qolgani ikkinchi chekda qoladi',
    ru: 'Введите сумму первого счёта, остаток уйдёт во второй',
    en: "Enter the first bill's amount; the rest stays on the second",
  },

  /** dc.html:17318–17319 — the two preview cards. */
  splitGuestOne: { uz: 'Mehmon 1', ru: 'Гость 1', en: 'Guest 1' },
  splitGuestRest: { uz: 'Qolgan {n} mehmon', ru: 'Остальные {n} гостя', en: 'Other {n} guests' },
  splitBillOne: { uz: '1-chek', ru: 'Счёт 1', en: 'Bill 1' },
  splitBillTwo: { uz: '2-chek', ru: 'Счёт 2', en: 'Bill 2' },

  /** dc.html:17300 — one row per head in guest mode. */
  splitGuestN: { uz: 'Mehmon {n}', ru: 'Гость {n}', en: 'Guest {n}' },
  /** dc.html:17307 — a line nobody claimed sits on the table, not on a seat. */
  splitShared: { uz: 'umumiy', ru: 'общее', en: 'shared' },

  /** How many ways. The stepper's floor and ceiling — see SPLIT_WAYS. */
  splitWays: { uz: 'mehmon', ru: 'гостей', en: 'guests' },

  /* ---- what the confirm refuses, and why — dc.html:17324 ---- */
  splitPickALine: {
    uz: 'Kamida bitta pozitsiyani belgilang',
    ru: 'Отметьте хотя бы одну позицию',
    en: 'Tick at least one line',
  },
  splitAmountRange: {
    uz: "Summa 0 dan katta va jamidan kichik bo'lishi kerak",
    ru: 'Сумма должна быть больше 0 и меньше итога',
    en: 'The amount must be above 0 and below the total',
  },
  splitOneGuest: {
    uz: "Bitta mehmonli stolni bo'lib bo'lmaydi",
    ru: 'Стол с одним гостем разделить нельзя',
    en: 'A single-guest table cannot be split',
  },
  /** dc.html:17331 — what the split says when it lands. */
  splitDone: {
    uz: "{n} chekka bo'lindi · kassaga yuborildi",
    ru: '{n} счёта создано · отправлено на кассу',
    en: '{n} bills created · sent to the till',
  },

  /* ---- the till's flashes — dc.html:17419, :17445, :13209 ---- */

  /** dc.html:17441 */
  sendDone: {
    uz: '{n} pozitsiya oshxonaga yuborildi',
    ru: '{n} позиций отправлено на кухню',
    en: '{n} items sent to the kitchen',
  },
  /** dc.html:17440 */
  sendQueued: {
    uz: 'Oflayn saqlandi · tarmoq qaytganda yuboriladi',
    ru: 'Сохранено офлайн · отправится при появлении сети',
    en: 'Saved offline · will send when the network returns',
  },
  /** dc.html:17445 */
  payNothing: {
    uz: "Hozircha to'laydigan narsa yo'q",
    ru: 'Пока нечего оплачивать',
    en: 'Nothing to pay for yet',
  },
  /** dc.html:13209 */
  dishStopped: {
    uz: "{name} · stop-listda, oshxona o'chirgan",
    ru: '{name} · в стоп-листе, отключено кухней',
    en: '{name} · on the stop list, disabled by the kitchen',
  },
  /** dc.html:11064 — the `+` key with an empty ticket. */
  ticketEmpty: {
    uz: "Savat bo'sh",
    ru: 'Корзина пуста',
    en: 'The ticket is empty',
  },
  /* ---- the two shortcuts inside the payment drawer — dc.html:8305 ---- */

  /** dc.html:10090 */
  paySplitByGuest: {
    uz: "Mehmonlar bo'yicha bo'lish",
    ru: 'Разделить по гостям',
    en: 'Split by guest',
  },
  /** dc.html:10091 */
  payApplyDiscount: {
    uz: "Chegirma qo'llash",
    ru: 'Применить скидку',
    en: 'Apply discount',
  },

  /**
   * The payment drawer's second exit — dc.html:10092.
   *
   * The catalogue called it «Bekor qilish» / Cancel, which is the one thing it
   * does not do: closing this drawer cancels nothing — the bill, the lines and
   * the table are all exactly where they were. A cashier who has opened it by
   * mistake mid-service reads *Cancel* and hesitates, because the guest is
   * standing there and the word suggests the order is about to go away.
   */
  payKeepOpen: {
    uz: 'Stolni ochiq qoldirish',
    ru: 'Оставить стол открытым',
    en: 'Keep the table open',
  },

  /* ---- the modifier sheet — dc.html:8221–8250 ---- */

  /**
   * dc.html:10080.
   *
   * The catalogue's eyebrow read «Qo'shimchalar» — *extras* — which names half
   * the sheet: a portion size and a note to the kitchen are not extras. The
   * design's word covers all three, and it is the word on the button a waiter
   * long-pressed to get here.
   */
  mCustomise: { uz: 'Moslashtirish', ru: 'Настроить', en: 'Customise' },

  /** dc.html:10083–10084 */
  mNote: {
    uz: 'Oshxona uchun izoh',
    ru: 'Примечание для кухни',
    en: 'Note for the kitchen',
  },
  mNotePh: {
    uz: 'masalan, asosiy taomdan keyin bering',
    ru: 'например, подать после основного блюда',
    en: 'e.g. serve after the main course',
  },

  /* ---- the header's network button, three states — dc.html:17061–17073 ---- */

  netOffline: { uz: 'Oflayn', ru: 'Офлайн', en: 'Offline' },
  netQueued: { uz: '{n} ta kutmoqda', ru: '{n} в очереди', en: '{n} queued' },
  netSyncing: { uz: 'Sinxronlanmoqda', ru: 'Синхронизация', en: 'Syncing' },
  netLeft: { uz: '{n} ta qoldi', ru: '{n} осталось', en: '{n} left' },
  netOnline: { uz: 'Onlayn', ru: 'Онлайн', en: 'Online' },
  netAllSent: { uz: 'hammasi yuborilgan', ru: 'всё отправлено', en: 'all sent' },
  /**
   * dc.html:17081 — the design's word for a queue entry the server could not
   * decide alone. It is a row status there and a header state here, because a
   * question nobody has answered outranks a count of writes nobody has sent:
   * the writes go by themselves when the link returns, and the questions never
   * do.
   */
  netConflict: { uz: 'Ziddiyat', ru: 'Конфликт', en: 'Conflict' },

  /* ---- the offline banner under the till's header — dc.html:6421 ---- */

  /** dc.html:9938 */
  offT: {
    uz: "Tarmoq yo'q — buyurtmalar planshetda saqlanmoqda",
    ru: 'Нет сети — заказы сохраняются на планшете',
    en: 'No network — orders are being saved on the tablet',
  },
  /** dc.html:9939 — what still works, which is most of it. */
  offSub: {
    uz: "Menyu, stollar va chek chop etish ishlaydi. To'lov tasdig'i va oshxona ekrani kutadi.",
    ru: 'Меню, столы и печать чека работают. Подтверждение оплаты и кухонный экран ждут.',
    en: 'Menu, tables and receipt printing work. Payment confirmation and the kitchen screen wait.',
  },
  /** dc.html:9940 */
  offSee: { uz: "Navbatni ko'rish", ru: 'Показать очередь', en: 'Show queue' },

  /* ---- the ticket panel's own words — dc.html:6559–6637 ---- */

  /**
   * dc.html:10072–10073.
   *
   * The catalogue carried a different pair — «Savat bo'sh» / «Chapdan taom
   * tanlang» — which describes the screen rather than the job. The design's
   * says what to do *and* names the gesture that opens the modifier sheet,
   * which is the one thing on this surface nobody discovers by looking.
   */
  cartEmptyT: {
    uz: "Hali hech narsa qo'shilmagan",
    ru: 'Пока ничего не добавлено',
    en: 'Nothing added yet',
  },
  cartEmptyB: {
    uz: 'Buyurtmani boshlash uchun taomga bosing. Modifikator uchun uzoq bosing.',
    ru: 'Нажмите на блюдо, чтобы начать. Долгое нажатие — модификатор.',
    en: 'Tap a dish to start the order. Long-press to add a modifier.',
  },

  /** dc.html:10071 — the link back to the floor, from the ticket's own header. */
  cartChange: { uz: "O'zgartirish", ru: 'Изменить', en: 'Change' },

  /** dc.html:17411 — how many lines, and whether the kitchen has them. */
  cartMetaDraft: {
    uz: '{n} ta · yuborilmagan',
    ru: '{n} поз. · не отправлено',
    en: '{n} items · not sent',
  },
  cartMetaSent: {
    uz: '{n} ta · oshxonaga yuborilgan',
    ru: '{n} поз. · отправлено на кухню',
    en: '{n} items · sent to kitchen',
  },

  /** dc.html:17415 — the send button, once the kitchen already has a docket. */
  sendAgain: {
    uz: 'Yuborildi · yangilarini yuborish',
    ru: 'Отправлено · отправить новые',
    en: 'Sent · send new items',
  },

  /** dc.html:17405 — the pay button names which of the four bills it settles. */
  payBill: {
    uz: "To'lov · Hisob {n}",
    ru: 'Оплата · Счёт {n}',
    en: 'Payment · Bill {n}',
  },

  /** dc.html:10052 — shown under Pay while this table has more than one bill. */
  multiBillNote: {
    uz: "Har bir hisob alohida to'lanadi. Bu stolda yana boshqa hisoblar ochiq.",
    ru: 'Каждый счёт оплачивается отдельно. За этим столом открыты и другие счета.',
    en: 'Each bill is paid separately. This table still has other bills open.',
  },

  /* ---- the header's own two controls — dc.html:6386, :6411 ---- */

  /** dc.html:8825 (`aria7`) — the chevron back to the floor. */
  posBack: { uz: 'Orqaga', ru: 'Назад', en: 'Back' },

  /* ---- the health strip's diagnosis panel — dc.html:12520–12574, :7916 ---- */

  /** dc.html:9330 — the heading over the "what to do" box. */
  hzWhat: { uz: 'Nima qilish kerak', ru: 'Что делать', en: 'What to do' },
  /** dc.html:9331 */
  hzClose: { uz: 'Yopish', ru: 'Закрыть', en: 'Close' },

  /** dc.html:12564 — the title when the thing is fine. */
  hzUp: { uz: '{name} · ishlayapti', ru: '{name} · работает', en: '{name} · up' },
  /** dc.html:12566 — and what to do about a thing that is fine. */
  hzNothing: {
    uz: 'Hech narsa qilish kerak emas.',
    ru: 'Ничего делать не нужно.',
    en: 'Nothing to do.',
  },

  /** dc.html:12574 — the one action every non-printer chip offers. */
  hzSeeQueue: {
    uz: "Navbatni ko'rish",
    ru: 'Открыть очередь',
    en: 'See the queue',
  },
  /** dc.html:12572 */
  hzOpenSettings: {
    uz: "Sozlamalarga o'tish",
    ru: 'Открыть настройки',
    en: 'Open settings',
  },

  /* ---- and the printer's own first action — dc.html:12568 ---- */

  /** dc.html:12568 — the primary button on a printer's diagnosis. */
  hzRetry: {
    uz: 'Qayta urinish',
    ru: 'Повторить',
    en: 'Try again',
  },
  /**
   * What the retry actually did, counted.
   *
   * The design flashes `"{printer} · ulandi"` here, which is a claim about
   * hardware this tablet cannot see. `POST /pos/print-queue/requeue` answers
   * with a number, so the till says the number: a cashier who reads "4 ta chek
   * qayta navbatga qo'yildi" knows four dockets are on their way out and can
   * stand by the printer to check.
   */
  hzRetryDone: {
    uz: "{n} ta chek qayta navbatga qo'yildi",
    ru: '{n} чек(ов) снова в очереди',
    en: '{n} receipts back in the queue',
  },
  /**
   * Zero, said as zero.
   *
   * The one answer this button exists to be honest about. Nothing was stuck, so
   * nothing was re-queued, and the printer is still not printing — telling the
   * cashier "reconnected" here is telling them to walk away from a dead
   * printer. `flash.problem()` rather than `flash()` for the same reason.
   */
  hzRetryNone: {
    uz: "Navbatda kutayotgan chek yo'q — muammo printerning o'zida",
    ru: 'В очереди нет застрявших чеков — дело в самом принтере',
    en: 'Nothing was stuck in the queue — the printer itself is the problem',
  },
  /** The request never landed, or the till was refused. */
  hzRetryFailed: {
    uz: "Qayta navbatga qo'yib bo'lmadi",
    ru: 'Не удалось вернуть в очередь',
    en: 'The jobs could not be re-queued',
  },

  /* ---- one diagnosis per service, dc.html:12522–12543 ---- */

  /** dc.html:12525 */
  hzLinkTitle: {
    uz: "Real vaqt aloqasi yo'q",
    ru: 'Нет связи в реальном времени',
    en: 'The live link is down',
  },
  /** dc.html:12526 */
  hzLinkBody: {
    uz: "Buyurtma yuborilsa oshxona ekranida darhol ko'rinmaydi. Stop-list ham yangilanmaydi.",
    ru: 'Заказ не появится на экране кухни сразу. Стоп-лист тоже не обновляется.',
    en: 'An order will not appear on the kitchen screen straight away, and the stop list stops updating.',
  },
  /** dc.html:12527 */
  hzLinkFix: {
    uz: "Buyurtmani yuborishda davom eting — u navbatga tushadi. Aloqa qaytganda avtomatik ketadi. Bir daqiqadan ko'p davom etsa, menejerni chaqiring.",
    ru: 'Продолжайте отправлять заказы — они попадут в очередь и уйдут при восстановлении связи. Если это дольше минуты, позовите менеджера.',
    en: 'Keep sending orders — they queue and go through when the link returns. If it lasts more than a minute, fetch the manager.',
  },

  /** dc.html:12530 */
  hzNetTitle: {
    uz: "Tarmoq yo'q",
    ru: 'Нет сети',
    en: 'No network',
  },
  /** dc.html:12531 */
  hzNetBody: {
    uz: 'Tizim oflayn rejimda ishlayapti. Buyurtma qabul qilinadi va navbatga yoziladi.',
    ru: 'Система работает офлайн. Заказы принимаются и пишутся в очередь.',
    en: 'The system is offline. Orders are accepted and written to a queue.',
  },
  /** dc.html:12532 */
  hzNetFix: {
    uz: "Ishlashda davom eting — hech narsa yo'qolmaydi. Har bir amalga bir martalik kalit beriladi, shuning uchun takroriy chek chiqmaydi.",
    ru: 'Продолжайте работать — ничего не потеряется. У каждого действия одноразовый ключ, поэтому дублей не будет.',
    en: 'Keep working — nothing is lost. Every action carries a one-time key, so nothing prints twice.',
  },

  /** dc.html:12537 — the printer names itself in the title. */
  hzPrinterTitle: {
    uz: '{name} javob bermaydi',
    ru: '{name} не отвечает',
    en: '{name} is not responding',
  },
  /** dc.html:12539 */
  hzPrinterBody: {
    uz: 'Bu printerga ketadigan cheklar navbatda turadi.',
    ru: 'Чеки для этого принтера ждут в очереди.',
    en: 'Tickets for this printer are waiting in the queue.',
  },
  /** dc.html:12540 */
  hzPrinterFix: {
    uz: "Printerni tekshiring: quvvat, qog'oz, tarmoq kabeli. Qog'oz tugagan bo'lsa almashtiring — navbatdagi cheklar o'zi chiqadi. Shoshilinch bo'lsa taomni og'zaki aytib qo'ying.",
    ru: 'Проверьте принтер: питание, бумага, сетевой кабель. Если бумага кончилась — замените, очередь напечатается сама. Если срочно — передайте заказ устно.',
    en: 'Check the printer: power, paper, network cable. Replace the paper if it ran out — the queue prints itself. If it is urgent, pass the order on verbally.',
  },

  /**
   * The fiscal chip's two sentences.
   *
   * The design's health strip lists the live link, the network and the printers
   * — it has no fiscal chip, because in the prototype the fiscal module is a row
   * on the close-of-day screen. This till draws one, so its words are taken from
   * where the design does write them: `tlFiscalOk` and `tlFiscalNote`
   * (dc.html:9646, :9619). Nothing here is invented.
   */
  hzFiscalUp: {
    uz: 'Ulangan · soliq.uz bilan sinxron',
    ru: 'Подключён · синхронизирован с soliq.uz',
    en: 'Connected · synced with soliq.uz',
  },
  /**
   * `tlFiscalNote` is two sentences and the panel wants them apart: the first
   * says what a dead fiscal module costs, the second says what happens without
   * anyone doing anything. Split at the design's own full stop, nothing added.
   */
  hzFiscalBody: {
    uz: "Fiskal modul ulanmagan bo'lsa chek haqiqiy hisoblanmaydi.",
    ru: 'Если фискальный модуль не подключён, чек недействителен.',
    en: 'Receipts are not valid while the fiscal module is offline.',
  },
  hzFiscalFix: {
    uz: "Navbatdagi cheklar tarmoq qaytganda o'zi yuboriladi.",
    ru: 'Чеки из очереди отправятся сами при восстановлении связи.',
    en: 'Queued receipts send themselves when the connection returns.',
  },

  /** dc.html:11817 — the PIN keypad, once it lets somebody in. */
  shiftStarted: {
    uz: '{name} · smena ochildi',
    ru: '{name} · смена открыта',
    en: '{name} · shift started',
  },
} as const satisfies Readonly<Record<string, Trilingual>>;

/**
 * How many ways a bill can be split by head.
 *
 * Two at the bottom — one guest is not a split — and twelve at the top, which
 * is the guest app's own stepper (`Smart Restaurant Mehmon.dc.html:1006`,
 * `Math.min(12, …)` / `Math.max(2, …)`). The two surfaces settle the same bill,
 * so they cannot disagree about how many people may settle it.
 */
export const SPLIT_WAYS = { min: 2, max: 12 } as const;

/**
 * One head's share, rounded the way the design rounds it.
 *
 * `Math.floor(total / n / 1000) * 1000` in the design — so'm, floored to the
 * nearest thousand, which is the smallest note anybody carries here. In tiyin
 * that thousand is 100 000, and the floor is what leaves the remainder on the
 * last bill rather than dividing a tiyin nobody can hand over.
 *
 * ---------------------------------------------------------------------------
 * This is the PREVIEW, not the division
 *
 * `App\Support\Orders\BillSplit` owns the authoritative shares and mints the
 * sibling bills; `POST /pos/bills/{id}/split` with `ways` returns the family
 * and the till draws what came back. What this pair is for is the moment
 * *before* anybody agrees — the sheet has to show a table what each of them
 * would owe while they are still deciding, and there is no bill to ask the
 * server about yet.
 *
 * So the two implementations exist on purpose and must not drift: the same
 * flooring to a 1 000 so'm note, the same remainder on the last share, so the
 * figure a cashier reads out of the sheet is the figure that lands on the
 * receipt. Change the rule here and you have changed only what the guest was
 * promised. `BillSplit`'s own tests are taken from these functions for exactly
 * that reason.
 *
 * @see Smart Restaurant OS.dc.html:17261
 * @see App\Support\Orders\BillSplit — the same rule, server-side, and the one
 *      that decides what is actually charged
 */
const THOUSAND_SOM_IN_TIYIN = 100_000;

export function evenShare(totalTiyin: number, ways: number): number {
  if (ways < 1) return totalTiyin;

  return Math.floor(totalTiyin / ways / THOUSAND_SOM_IN_TIYIN) * THOUSAND_SOM_IN_TIYIN;
}

/**
 * The shares, in order, for a bill split `ways` between heads.
 *
 * Every head pays `evenShare`; the last one pays whatever the flooring left
 * behind, which is the design's own rule — "the rounding difference goes on the
 * last bill". The list therefore always adds back up to the total, which is the
 * property a cashier reading it out is relying on.
 *
 * Previewed here, decided by `BillSplit` on the server — see `evenShare` above
 * for why both exist and why they may not disagree.
 */
export function guestShares(totalTiyin: number, ways: number): number[] {
  const each = evenShare(totalTiyin, ways);

  return Array.from({ length: ways }, (_, index) =>
    index === ways - 1 ? totalTiyin - each * (ways - 1) : each,
  );
}

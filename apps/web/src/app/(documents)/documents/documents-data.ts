/**
 * 02 · Hujjatlar — every figure on the seven printed documents.
 *
 * Read off `docs/design/source/Smart Restaurant OS - Hujjatlar.dc.html` line by
 * line, not re-derived. The rule the repo runs on is in README.md: where a spec
 * and a design file disagree, **the file wins** — so where `specs/02-documents.md`
 * lists an X report and a daily-closing sheet that the file does not draw, the
 * file's seven sections are what exists here.
 *
 * Two conventions, both non-negotiable:
 *
 *   **Money is integer tiyin.** The design writes so'm, so every amount below is
 *   wrapped in `som()`. A receipt total that drifted by a hundredth is the one
 *   bug a guest finds before anybody else, and the platform's answer to it is
 *   that no money value is ever a float anywhere.
 *
 *   **The text is Uzbek and is not translated.** Unlike the console screens,
 *   this design file is monolingual: it carries no `P("uz","ru","en")` table
 *   because a printed receipt is a legal artefact of one jurisdiction and its
 *   wording is not a UI string. Only the chrome around the paper is trilingual
 *   — see `documents-copy.ts`.
 *
 * **This file is the specimen, not the record.** Every constant below is the
 * document the design drew, and it is what the surface prints when nobody has
 * said *which* shift, *which* bill or *which* employee. The live reads live in
 * the sibling `documents-server.ts`, per the house rule — types and fixtures
 * here, anything touching `next/headers` next door.
 *
 * Each document therefore has two things here: the specimen, and a widened type
 * beside it. The type is what makes the pair work at all — `as const` gives the
 * specimen literal types (`venue: 'SMART RESTAURANT'`), and a document read off
 * a real restaurant's API is a `string`, which no literal type will hold.
 */

import { formatTiyinAmount } from '@restaurant/utils';

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/**
 * Every figure on every one of the seven, formatted one way.
 *
 * Uzbek grouping regardless of who is looking at the screen, because the paper
 * is Uzbek: a Russian-reading accountant previewing a payslip still prints the
 * sheet the employee signs, and a document whose thousands separator followed
 * the previewer's console language would come off the printer differently
 * depending on who pressed the button.
 *
 * `formatTiyinAmount` rather than a local divide-by-a-hundred — that division
 * is the whole reason the shared formatter exists.
 */
export const money = (tiyin: number): string => formatTiyinAmount(Math.abs(tiyin), 'uz');

/**
 * The same figure with its sign always shown.
 *
 * Used exactly where the design writes one: a till movement is a direction
 * before it is an amount, and "5 481 000" against "+5 481 000" is the
 * difference between a takings line and a correction. The minus is U+2212, not
 * a hyphen — a hyphen is narrower than a digit and makes a column of figures
 * ragged.
 */
export const signedMoney = (tiyin: number): string =>
  `${tiyin < 0 ? '\u2212' : '+'}${money(tiyin)}`;

/* ------------------------------------------------------------------- shape */

export type DocumentKey =
  'index' | 'receipts' | 'z' | 'invoice' | 'stock-count' | 'payslip' | 'profit-loss';

/**
 * Which paper the document goes onto, and therefore which `@page` box applies.
 *
 * The two cannot share a print run — an 80 mm roll and an A4 sheet are
 * different page boxes and CSS has exactly one `@page` per named page — so the
 * selected document decides, and `documents.css` reads the decision off
 * `data-paper`.
 */
export type Paper = 'a4' | '80mm';

/** The design's order, `p1`…`p7`, and the order of the switcher. */
export const DOCUMENT_ORDER: readonly DocumentKey[] = [
  'index',
  'receipts',
  'z',
  'invoice',
  'stock-count',
  'payslip',
  'profit-loss',
];

/**
 * Sections 02 and 03 are drawn on an A4 specimen sheet in the design — a header
 * saying "haqiqiy o'lchamda", the strips side by side, notes underneath —
 * because the handoff is a deck to be read, not a receipt to be issued. On the
 * real surface the same two documents go to a thermal printer, so they claim
 * the 80 mm page box and the specimen framing is screen-only.
 */
export const PAPER_OF: Readonly<Record<DocumentKey, Paper>> = {
  index: 'a4',
  receipts: '80mm',
  z: '80mm',
  invoice: 'a4',
  'stock-count': 'a4',
  payslip: 'a4',
  'profit-loss': 'a4',
};

export const isDocumentKey = (value: unknown): value is DocumentKey =>
  typeof value === 'string' && (DOCUMENT_ORDER as readonly string[]).includes(value);

/* ============================================================== 01 · cover */

/** The rail down the left of a cover card — the design's four accents. */
export type Rail = 'brand' | 'warning' | 'ink' | 'accent';

export type CoverCard = {
  readonly paper: string;
  readonly name: string;
  readonly note: string;
  /**
   * The one word the design sets in bold inside the note.
   *
   * Kept as its own field rather than as markup in the string, because the note
   * is copy and the emphasis is typography: a `<b>` embedded in the sentence
   * would have to be parsed back out by anything that ever reads this for a
   * different medium — a PDF, a Telegram message, a printed brochure.
   */
  readonly emphasis?: string;
  readonly rail: Rail;
  /** The document this card describes, so the card is also the way in. */
  readonly goes: DocumentKey;
};

export const COVER = {
  eyebrow: 'Chop etiladigan hujjatlar',
  title: 'Smart Restaurant OS',
  where: 'Toshkent · Termiz · 5 filial',
  version: 'Versiya 1.0 · 15.08.2026',
  lede:
    "Tizim yetti xil hujjat chop etadi. Har biri boshqa qog'ozga, boshqa auditoriyaga va " +
    "boshqa maqsadga chiqadi — shuning uchun ular bir xil ko'rinmaydi. Quyida har birining " +
    "o'lchami, kim uchun ekani va nima uchun shundayligi.",
} as const;

export const COVER_CARDS: readonly CoverCard[] = [
  {
    paper: '80 mm termal',
    name: 'Mijoz cheki',
    note: "Fiskal ma'lumot, QQS ajratilgan, QR kod. Mijozga.",
    rail: 'brand',
    goes: 'receipts',
  },
  {
    paper: '80 mm termal',
    name: 'Oshxona cheki',
    note: "Narx yo'q. Faqat taom, miqdor, modifikator, mehmon raqami.",
    rail: 'warning',
    goes: 'receipts',
  },
  {
    paper: '80 mm termal',
    name: 'Z-hisobot',
    note: 'Smena yopilishi. Kassir imzosi, farq sababi.',
    rail: 'ink',
    goes: 'z',
  },
  {
    paper: 'A4',
    name: 'Xarid buyurtmasi',
    note: 'Yetkazib beruvchiga. Imzo va muhr joyi bor.',
    rail: 'accent',
    goes: 'invoice',
  },
  {
    paper: 'A4',
    name: 'Inventarizatsiya varaqasi',
    /* The bold word is the whole point of the sheet, so it survives as markup
       rather than being flattened into the sentence. */
    note: "Tizim soni ko'rsatilmaydi — omborchi ko'rmasdan sanaydi.",
    emphasis: "ko'rsatilmaydi",
    rail: 'accent',
    goes: 'stock-count',
  },
  {
    paper: 'A4',
    name: 'Maosh varaqasi',
    note: 'Xodimga. Xizmat haqi ulushi alohida qator.',
    rail: 'brand',
    goes: 'payslip',
  },
];

/** The seventh card is drawn wide, because its note does not fit the grid. */
export const COVER_WIDE: CoverCard = {
  paper: 'A4',
  name: 'Foyda va zarar hisoboti',
  note: "Egasi va bankka. QQS'siz tushum, tannarx, mehnat, operatsion xarajat, EBITDA. Q1 qaroriga mos.",
  rail: 'ink',
  goes: 'profit-loss',
};

/** The three rules every one of the seven documents obeys. */
export const COVER_RULES: readonly { readonly lead: string; readonly body: string }[] = [
  {
    lead: 'QQS narx ichida',
    body: "Menyudagi narx yakuniy. QQS 12% chekda ajratib ko'rsatiladi, qo'shilmaydi.",
  },
  {
    lead: 'Ish kuni 06:00–06:00',
    body: "01:30 dagi chek o'tgan kunga tegishli. Barcha hujjat shu qoidani ishlatadi.",
  },
  {
    lead: 'Xizmat haqi 10%',
    body: "Tushumga kiradi, QQS'ga tortiladi. Zalda olinadi, olib ketishda yo'q.",
  },
];

/* =========================================================== 02 · receipts */

export const RECEIPTS_HEAD = {
  title: 'Termal cheklar · 80 mm',
  note: "haqiqiy o'lchamda",
} as const;

export type ReceiptLine = {
  readonly quantity: number;
  readonly name: string;
  readonly amount: number;
  /** The modifier sheet under the line — `m1`, `m2`, or plain words. */
  readonly note: string;
};

/**
 * The guest's receipt, as the strip draws it.
 *
 * Labels are fields rather than constants because a live receipt carries its
 * own: `Xizmat haqi 10%` is the branch's own service rate and
 * `Chegirma · Oltin karta 5%` names the loyalty tier that actually applied. A
 * strip that printed the design's 10% over a 15% charge would be wrong in the
 * one place a guest checks.
 */
export type ReceiptDoc = {
  readonly venue: string;
  readonly branch: string;
  readonly address: string;
  readonly registration: string;
  readonly meta: readonly (readonly [string, string])[];
  readonly lines: readonly ReceiptLine[];
  readonly items: number;
  readonly serviceLabel: string;
  readonly service: number;
  readonly itemsWithService: number;
  readonly discountLabel: string;
  readonly discount: number;
  readonly total: number;
  readonly vatLabel: string;
  readonly vat: number;
  readonly tender: readonly (readonly [string, number])[];
  readonly fiscalModule: string;
  readonly fiscalSign: string;
  readonly qrNote: string;
  readonly thanks: readonly string[];
  readonly phones: string;
  readonly phonesNote: string;
};

/**
 * The guest's receipt.
 *
 * The figures are the design's and they reconcile: 246 000 + 24 600 − 13 530 =
 * 257 070, which is what the tender row pays.
 */
export const CUSTOMER_RECEIPT = {
  venue: 'SMART RESTAURANT',
  branch: 'Chilonzor filiali',
  address: "Bunyodkor shoh ko'chasi 12, Toshkent",
  registration: 'STIR 302 458 719 · +998 71 200 40 40',

  meta: [
    ['Chek', '№ 004 812'],
    ['Sana', '15.08.2026 21:14'],
    ['Ish kuni', '15.08.2026'],
    ['Stol · mehmon', '12 · 4'],
    ['Hisob', '1 / 2'],
    ['Buyurtmalar', '25 69 70 74'],
    ['Buyurtma turi', 'Zalda'],
    ['Ofitsiant', 'Jasur T.'],
    ['Kassir', 'Dilshod K.'],
  ] as readonly (readonly [string, string])[],

  lines: [
    { quantity: 2, name: "Osh, to'y oshi", amount: som(96_000), note: "m1 · qo'shimcha go'sht" },
    { quantity: 1, name: "Lag'mon, qovurma", amount: som(52_000), note: 'm2' },
    {
      quantity: 1,
      name: 'Tovuq lavash',
      amount: som(38_000),
      note: "m3 · achchiq sous, piyoz yo'q",
    },
    { quantity: 4, name: "Choy, ko'k", amount: som(32_000), note: 'umumiy' },
    { quantity: 2, name: 'Coca-Cola 0.5', amount: som(28_000), note: 'm1, m4' },
  ] as readonly ReceiptLine[],

  items: som(246_000),
  serviceLabel: 'Xizmat haqi  10%',
  service: som(24_600),
  itemsWithService: som(270_600),
  discountLabel: 'Chegirma · Oltin karta 5%',
  discount: som(13_530),
  total: som(257_070),
  vatLabel: 'shundan QQS 12%',
  vat: som(27_543),

  tender: [
    ['Karta · Uzcard ···4417', som(257_070)],
    ['Choypuli', som(25_000)],
  ] as readonly (readonly [string, number])[],

  fiscalModule: 'FM 7742 1180',
  fiscalSign: '1904 8827 3315',
  qrNote: 'Chekni soliq.uz saytida tekshirish uchun QR kodni skanerlang. Chek 30 kun saqlanadi.',

  thanks: ['Tashrifingiz uchun rahmat', 'Yana kutamiz'] as readonly string[],
  phones: '+998 71 200 40 40 · +998 90 123 45 67',
  phonesNote: 'Shikoyat va takliflar uchun',
} as const;

export type TicketModifier = {
  readonly text: string;
  /** Red and bold. The design reserves it for the two that ruin a plate. */
  readonly alert: boolean;
};

export type TicketLine = {
  readonly quantity: number;
  readonly name: string;
  readonly modifiers: readonly TicketModifier[];
  readonly seat: string;
};

/**
 * The kitchen's ticket, as the strip draws it.
 *
 * No money anywhere in the shape, which is the point: a field that does not
 * exist cannot be filled in by a later change. See the fixture below.
 */
export type TicketDoc = {
  readonly number: string;
  readonly where: string;
  readonly reference: readonly string[];
  readonly station: string;
  readonly firedAt: string;
  readonly lines: readonly TicketLine[];
  readonly foot: readonly (readonly [string, string])[];
  readonly stamp: string;
};

/**
 * The kitchen's ticket — and it carries no money, which is the design's rule
 * rather than an omission: "narx yo'q, oshpazga kerak emas".
 */
export const KITCHEN_TICKET = {
  number: '№ 74',
  where: 'STOL 12 · HISOB 1',
  reference: ['A-1291', '4812'] as readonly string[],
  station: 'GRILL',
  firedAt: '21:14',

  lines: [
    {
      quantity: 2,
      name: "OSH, TO'Y OSHI",
      modifiers: [{ text: "+ qo'shimcha go'sht", alert: false }],
      seat: 'mehmon 1',
    },
    { quantity: 1, name: "LAG'MON, QOVURMA", modifiers: [], seat: 'mehmon 2' },
    {
      quantity: 1,
      name: 'TOVUQ LAVASH',
      modifiers: [
        { text: '! ACHCHIQ SOUS', alert: true },
        { text: "! PIYOZ YO'Q", alert: true },
      ],
      seat: 'mehmon 3',
    },
  ] as readonly TicketLine[],

  foot: [
    ['Ofitsiant', 'Jasur T.'],
    ['Yuborilgan', '21:14:32'],
    ["Me'yor", '18 daqiqa'],
  ] as readonly (readonly [string, string])[],

  stamp: '3 POZITSIYA · 4 PORTSIYA',
} as const;

/** The two notes under the specimen sheet. Screen only — see `documents.css`. */
export const RECEIPT_NOTES: readonly { readonly lead: string; readonly body: string }[] = [
  {
    lead: 'Mijoz cheki',
    body:
      "— mijoz uchun yozilgan: nima yedi, qancha to'ladi, qanday tekshiradi. Fiskal " +
      "ma'lumot majburiy, QQS ajratilgan (Q1). Chegirma qatori doim ko'rinadi.",
  },
  {
    lead: 'Oshxona cheki',
    body:
      "— narx yo'q, oshpazga kerak emas. Taom nomi 13 pt, 2 m dan o'qiladi. Modifikator " +
      "qizil va katta — eng ko'p xato shu yerda. Mehmon raqami Q4 qaroriga mos, taomni " +
      "to'g'ri odamga berish uchun.",
  },
];

/* =========================================================== 03 · Z report */

export const Z_HEAD = { title: 'Z-hisobot · smena yopilishi', note: '80 mm termal' } as const;

/** A money row on the roll: label on the left, amount on the right. */
export type ZRow = {
  readonly label: string;
  readonly amount: number;
  /**
   * Print the sign even when the figure is positive.
   *
   * Set on exactly the rows the design signs, and only those: a drawer
   * movement is a direction before it is an amount, while a takings line is
   * just a total. Getting this from the value's own sign instead would print
   * "+16 842 000" against the food sales, which reads as an adjustment.
   */
  readonly signed?: boolean;
};

const zRow = (label: string, amount: number, signed = false): ZRow => ({ label, amount, signed });

/**
 * The Z, as the roll prints it.
 *
 * Every section is a list rather than a fixed set of rows: a restaurant that
 * takes Payme and one that does not print a different number of payment lines,
 * and a shift with no corrections prints none.
 */
export type ZReportDoc = {
  readonly title: string;
  readonly venue: string;
  readonly register: string;
  readonly meta: readonly (readonly [string, string])[];
  readonly turnoverTitle: string;
  readonly bills: { readonly label: string; readonly count: number };
  readonly turnover: readonly ZRow[];
  readonly turnoverTotal: ZRow;
  /**
   * Null when the shift's own document carries no tax figure.
   *
   * VAT lives on the bill (`vat_included`) and on the fiscal receipt
   * (`vat_total`); `GET /finance/shifts/{id}/report` sums neither, so a live Z
   * prints no such row rather than a summed one this surface invented. The
   * specimen keeps it, because the design draws it.
   */
  readonly turnoverVat: ZRow | null;
  readonly methodsTitle: string;
  readonly methods: readonly ZRow[];
  readonly drawerTitle: string;
  readonly drawer: readonly ZRow[];
  readonly expected: ZRow;
  readonly counted: ZRow;
  readonly variance: ZRow;
  readonly correctionsTitle: string;
  readonly corrections: readonly (readonly [string, number, number])[];
  readonly cardTips: ZRow;
  readonly reasonLabel: string;
  readonly signatures: readonly string[];
};

/** The Z. */
export const Z_REPORT = {
  title: 'Z-HISOBOT',
  venue: 'SMART RESTAURANT · Chilonzor',
  register: 'Kassa 1 · FM 7742 1180',

  meta: [
    ['Smena', '№ 318'],
    ['Ish kuni', '15.08.2026'],
    ['Ochilgan', '10:02'],
    ['Yopilgan', '23:48'],
    ['Kassir', 'Dilshod Karimov'],
  ] as readonly (readonly [string, string])[],

  turnoverTitle: 'AYLANMA',
  /* A count, not money — it is the one row on the roll that must not be
     divided by a hundred. */
  bills: { label: 'Cheklar soni', count: 184 },
  turnover: [
    zRow('Taomlar', som(16_842_000)),
    zRow('Xizmat haqi', som(1_512_400)),
    zRow('Chegirmalar', som(-684_200), true),
    zRow('Yaxlitlash', som(2_400), true),
  ] as readonly ZRow[],
  turnoverTotal: zRow('JAMI AYLANMA', som(17_672_600)),
  turnoverVat: zRow('shundan QQS 12%', som(1_893_493)),

  methodsTitle: "TO'LOV TURLARI",
  methods: [
    zRow('Naqd', som(5_481_000)),
    zRow('Karta · Uzcard/Humo', som(8_126_600)),
    zRow('Click / Payme', som(3_180_000)),
    zRow('Kompaniya hisobi', som(885_000)),
  ] as readonly ZRow[],

  drawerTitle: 'NAQD KASSA',
  drawer: [
    zRow("Boshlang'ich", som(500_000)),
    zRow('Naqd tushum', som(5_481_000), true),
    zRow('Qaytarish', som(-124_000), true),
    zRow('Inkassatsiya', som(-4_000_000), true),
  ] as readonly ZRow[],
  expected: zRow('Kutilgan', som(1_857_000)),
  counted: zRow('Sanalgan', som(1_825_000)),
  variance: zRow('FARQ', som(-32_000), true),

  correctionsTitle: 'TUZATISHLAR',
  /* Count and value in one cell, exactly as the roll prints it: "3 · 148 000"
     answers "how many, and how much" in the width of one line. */
  corrections: [
    ['Bekor qilingan', 3, som(148_000)],
    ['Qaytarilgan', 1, som(124_000)],
    ["Sovg'a qilingan", 2, som(96_000)],
  ] as readonly (readonly [string, number, number])[],
  cardTips: zRow('Choypuli · karta', som(412_000)),

  reasonLabel: 'Farq sababi',
  signatures: ['Kassir imzosi', 'Menejer imzosi'] as readonly string[],
} as const;

export const Z_NOTES = {
  variance: {
    title: "Farq nolga teng bo'lmasa, smena yopilmaydi",
    body:
      'Kassir sababni yozishi va menejer imzolashi shart. Sababsiz yopilgan smena — bu ' +
      "tizimga ishonchni yo'qotadigan birinchi joy. Farq 50 000 so'mdan oshsa, egaga " +
      'bildirishnoma ketadi.',
  },
  chain: {
    title: 'Pul zanjiri · Q10',
    body: 'Z-hisobot beshta raqamdan bittasi. Kun yopilganda tizim beshtasini solishtiradi:',
    /* All five agree, and that is the message. A chain drawn with five equal
       figures says "reconciled" faster than any badge could. */
    rows: [
      zRow('POS cheklari', som(17_672_600)),
      zRow('Fiskal modul', som(17_672_600)),
      zRow("To'lovlar jami", som(17_672_600)),
      zRow('Z-hisobot', som(17_672_600)),
      zRow('Buxgalteriya', som(17_672_600)),
    ] as readonly ZRow[],
  },
  x: {
    title: 'X-hisobot bilan farqi',
    body:
      "X-hisobot — smenani yopmasdan o'qish, kun bo'yi necha marta ham olinadi, " +
      'hisoblagichni nolga tushirmaydi. Z-hisobot bir marta olinadi va smenani qulflaydi. ' +
      "Ikkisi bir xil ko'rinmasligi kerak — shuning uchun Z sarlavhasi qalin va imzo joyi bor.",
  },
} as const;

/* ============================================================= 04 · invoice */

export type InvoiceLine = {
  readonly name: string;
  readonly unit: string;
  readonly quantity: number;
  readonly price: number;
  readonly amount: number;
};

/** The two addressed blocks at the head of the order — supplier and delivery. */
export type PartyBlock = {
  readonly label: string;
  readonly name: string;
  readonly lines: readonly string[];
};

/** The purchase order, as the sheet prints it. */
export type InvoiceDoc = {
  readonly seller: {
    readonly name: string;
    readonly legal: string;
    readonly address: string;
    readonly registration: string;
  };
  readonly title: string;
  readonly number: string;
  readonly date: string;
  readonly supplier: PartyBlock;
  readonly delivery: PartyBlock;
  readonly columns: readonly string[];
  readonly lines: readonly InvoiceLine[];
  readonly netLabel: string;
  readonly net: number;
  readonly vatLabel: string;
  readonly vat: number;
  readonly dueLabel: string;
  readonly due: number;
  readonly terms: { readonly lead: string; readonly body: string };
  readonly signatures: readonly { readonly line: string; readonly below: string }[];
};

/** The purchase order. */
export const INVOICE = {
  seller: {
    name: 'SMART RESTAURANT',
    legal: 'MChJ «Smart Restaurant Group»',
    address: "Bunyodkor shoh ko'chasi 12, Toshkent",
    registration: 'STIR 302 458 719 · +998 71 200 40 40',
  },
  title: 'Xarid buyurtmasi',
  number: '№ XB-2026-0418',
  date: '15.08.2026',

  supplier: {
    label: 'Yetkazib beruvchi',
    name: "«Toshkent Go'sht» MChJ",
    lines: [
      'STIR 304 117 882',
      'Sergeli tumani, Yangi Sergeli 4/2',
      'Sotuv menejeri: Farrux Ismoilov',
      '+998 90 344 12 08',
    ] as readonly string[],
  },
  delivery: {
    label: 'Yetkazib berish',
    name: 'Chilonzor filiali · ombor',
    lines: [
      'Kutilgan sana: 17.08.2026, 07:00–09:00',
      'Qabul qiluvchi: Sardor Nazarov, omborchi',
      "To'lov: yetkazib berilgandan 14 kun",
      'Shartnoma № 2026/41',
    ] as readonly string[],
  },

  columns: ['№', 'Nomi', 'Birlik', 'Soni', 'Narxi', 'Summa'] as readonly string[],
  lines: [
    {
      name: "Mol go'shti, orqa qism",
      unit: 'kg',
      quantity: 40,
      price: som(92_000),
      amount: som(3_680_000),
    },
    {
      name: "Qo'y go'shti, qovurga",
      unit: 'kg',
      quantity: 25,
      price: som(118_000),
      amount: som(2_950_000),
    },
    { name: 'Tovuq filesi', unit: 'kg', quantity: 60, price: som(46_000), amount: som(2_760_000) },
    { name: 'Mol dumbasi', unit: 'kg', quantity: 8, price: som(74_000), amount: som(592_000) },
    { name: 'Tovuq qanoti', unit: 'kg', quantity: 18, price: som(38_000), amount: som(684_000) },
  ] as readonly InvoiceLine[],

  netLabel: "Jami, QQS'siz",
  net: som(9_523_214),
  vatLabel: 'QQS 12%',
  vat: som(1_142_786),
  dueLabel: "To'lanadi",
  due: som(10_666_000),

  terms: {
    lead: 'Qabul shartlari.',
    body:
      "Go'sht +2…+4 °C da, muzlatilmagan holda yetkaziladi. Har bir pozitsiya uchun " +
      'veterinariya guvohnomasi talab qilinadi. Harorat yoki hujjat mos kelmasa, omborchi ' +
      'qabul qilishdan bosh tortadi va tizimda «rad etildi» deb belgilaydi. Kam chiqqan ' +
      'miqdor hisob-fakturadan chegiriladi.',
  },

  signatures: [
    { line: 'Buyurtma bergan · Sardor Nazarov, omborchi', below: 'Muhr joyi' },
    { line: 'Tasdiqlagan · Aziza Rasulova, menejer', below: 'Sana' },
  ] as readonly { readonly line: string; readonly below: string }[],
} as const;

/* ========================================================= 05 · stock count */

export type CountRow = {
  readonly name: string;
  readonly location: string;
  readonly unit: string;
};

/**
 * The count sheet, as it prints.
 *
 * `CountRow` carries a name, a place and a unit — and no quantity, which is the
 * document. The type is the enforcement: an on-hand figure cannot be printed by
 * accident because there is nowhere on the sheet to put it.
 */
export type StockCountDoc = {
  readonly title: string;
  readonly subtitle: string;
  readonly number: string;
  readonly date: string;
  readonly time: string;
  readonly warning: { readonly lead: string; readonly body: string };
  readonly columns: readonly string[];
  readonly rows: readonly CountRow[];
  readonly signatures: readonly string[];
  readonly footnote: string;
};

/** The count sheet — the one document whose empty state *is* the document. */
export const STOCK_COUNT = {
  title: 'Inventarizatsiya varaqasi',
  subtitle: 'Chilonzor filiali · asosiy ombor va sovutgich',
  number: '№ INV-2026-08-31',
  date: '31.08.2026',
  time: '23:50 · smena yopilgandan keyin',

  warning: {
    lead: "Tizim soni bu varaqada ataylab ko'rsatilmagan.",
    body:
      "Omborchi tizimdagi raqamni ko'rib sanasa, u raqamni tasdiqlaydi — sanamaydi. " +
      "Haqiqiy son qo'lda yozilib, tizimga kiritilgandan keyingina farq ko'rinadi.",
  },

  columns: ['№', 'Xomashyo', 'Joy', 'Birlik', 'Sanalgan', 'Yaroqsiz', 'Izoh'] as readonly string[],
  rows: [
    { name: "Mol go'shti, orqa qism", location: 'Sovutgich 1', unit: 'kg' },
    { name: "Qo'y go'shti, qovurga", location: 'Sovutgich 1', unit: 'kg' },
    { name: 'Tovuq filesi', location: 'Sovutgich 2', unit: 'kg' },
    { name: 'Mol dumbasi', location: 'Muzlatgich', unit: 'kg' },
    { name: 'Guruch, lazer', location: 'Quruq ombor', unit: 'kg' },
    { name: 'Sabzi', location: 'Sabzavot', unit: 'kg' },
    { name: 'Piyoz', location: 'Sabzavot', unit: 'kg' },
    { name: 'Pomidor', location: 'Sabzavot', unit: 'kg' },
    { name: 'Kartoshka', location: 'Sabzavot', unit: 'kg' },
    { name: 'Un, oliy navli', location: 'Quruq ombor', unit: 'kg' },
    { name: "Paxta yog'i", location: 'Quruq ombor', unit: 'l' },
    { name: 'Tuz', location: 'Quruq ombor', unit: 'kg' },
    { name: 'Zira', location: 'Ziravor', unit: 'kg' },
    { name: 'Suzma', location: 'Sovutgich 2', unit: 'kg' },
    { name: 'Coca-Cola 0.5', location: 'Ichimlik', unit: 'dona' },
    { name: "Choy, ko'k", location: 'Quruq ombor', unit: 'kg' },
    { name: 'Pishloq, mozzarella', location: 'Sovutgich 2', unit: 'kg' },
  ] as readonly CountRow[],

  signatures: [
    'Sanagan · omborchi',
    'Kuzatgan · menejer',
    'Boshlangan / tugagan vaqt',
  ] as readonly string[],

  footnote:
    "Varaq to'ldirilgandan keyin ma'lumot tizimga kiritiladi. Tizim farqni o'zi hisoblaydi va " +
    '3% dan oshgan har bir pozitsiya uchun sabab talab qiladi. Sanoq ikki kishi ishtirokida ' +
    "o'tkaziladi — bittasi sanaydi, ikkinchisi yozadi.",
} as const;

/* ============================================================= 06 · payslip */

export type PayslipRow = {
  readonly label: string;
  /** The second line under the label, where the design explains a figure. */
  readonly note?: string;
  /** The working, printed muted between the label and the amount. */
  readonly working?: string;
  readonly amount: number;
  readonly tone?: 'accent' | 'danger';
};

/** The two fact panels at the head of the sheet — the employee and the period. */
export type PayslipFacts = {
  readonly label: string;
  readonly name: string;
  readonly lines: readonly string[];
};

/** The payslip, as the sheet prints it. */
export type PayslipDoc = {
  readonly title: string;
  readonly subtitle: string;
  readonly venue: string;
  readonly number: string;
  readonly issued: string;
  readonly employee: PayslipFacts;
  readonly period: PayslipFacts;
  readonly earnedTitle: string;
  readonly earned: readonly PayslipRow[];
  readonly earnedTotal: { readonly label: string; readonly amount: number };
  readonly deductedTitle: string;
  readonly deducted: readonly PayslipRow[];
  readonly deductedTotal: { readonly label: string; readonly amount: number };
  readonly netLabel: string;
  readonly netNote: string;
  readonly net: number;
  readonly signatures: readonly string[];
  readonly footnote: string;
};

/** The payslip. */
export const PAYSLIP = {
  title: 'Maosh varaqasi',
  subtitle: '2026-yil avgust · Chilonzor filiali',
  venue: 'SMART RESTAURANT',
  number: '№ MV-2026-08-JT',
  issued: 'Berilgan sana: 01.09.2026',

  employee: {
    label: 'Xodim',
    name: 'Jasur Toshev',
    lines: [
      'Ofitsiant · tabel № 0042',
      'Ishga qabul: 12.03.2025',
      "Soatbay · 26 000 so'm / soat",
    ] as readonly string[],
  },
  period: {
    label: 'Davr',
    name: '01.08 – 31.08.2026',
    lines: [
      'Ishlangan: 144 soat · 18 smena',
      'Kechikish: 1 marta (18 daqiqa)',
      "Sotgan: 46 800 000 so'm",
    ] as readonly string[],
  },

  earnedTitle: 'Hisoblandi',
  earned: [
    { label: 'Asosiy · 144 soat × 26 000', working: '144 × 26 000', amount: som(3_744_000) },
    { label: 'Bonus · sotuvdan 3%', working: '46 800 000 × 3%', amount: som(1_404_000) },
    {
      label: 'Xizmat haqi ulushi',
      note: 'fondning 40% i, smena soatlariga qarab',
      working: '144 / 1 042 soat',
      amount: som(1_240_000),
      tone: 'accent',
    },
    { label: 'Bayram smenasi · 1-sentabr', working: '×1.5', amount: som(312_000) },
  ] as readonly PayslipRow[],
  earnedTotal: { label: 'Jami hisoblandi', amount: som(6_700_000) },

  deductedTitle: 'Ushlandi',
  deducted: [
    { label: 'Avans · 15.08.2026', amount: som(-1_500_000) },
    { label: 'Kechikish · 1 marta', working: '18 daqiqa', amount: som(-80_000), tone: 'danger' },
    {
      label: 'Sindirilgan idish',
      note: "2 ta likopcha · tannarx bo'yicha",
      amount: som(-100_000),
      tone: 'danger',
    },
    { label: "Daromad solig'i · 12%", amount: som(-804_000) },
  ] as readonly PayslipRow[],
  deductedTotal: { label: 'Jami ushlandi', amount: som(-2_484_000) },

  netLabel: "Qo'lga tegadi",
  netNote: 'Karta · Uzcard ···8814 · 01.09.2026',
  net: som(4_216_000),

  signatures: ['Xodim imzosi · tanishdim', "Buxgalter · Malika Yo'ldosheva"] as readonly string[],

  footnote:
    "Hisob-kitob bo'yicha savol bo'lsa, varaq berilgan kundan 5 ish kuni ichida buxgalteriyaga " +
    "murojaat qiling. Xizmat haqi ulushi tushumga bog'liq va har oy o'zgaradi.",
} as const;

/* ========================================================= 07 · profit-loss */

/**
 * `h` a section heading, `r` a line, `t` a subtotal, `f` the final row.
 *
 * The four kinds are the design's own — its script switches on exactly this
 * letter — and every visual difference between the rows falls out of it.
 */
export type PlKind = 'h' | 'r' | 't' | 'f';

export type PlRow = {
  readonly kind: PlKind;
  readonly label: string;
  /** Signed tiyin. Negative is a cost, and prints with a real minus sign. */
  readonly value: number;
  /** Share of revenue, already a string because the design writes one decimal. */
  readonly share: string;
  /**
   * The same line last period, or null when there is nothing to compare with.
   *
   * Null rather than zero, and the distinction is the column's whole worth: a
   * zero prints as a real figure and reads as "this line earned nothing in
   * June". `analytics/summary` carries one delta — revenue as a whole — so on a
   * live statement every row but the revenue subtotal has nothing to put here.
   */
  readonly previous: number | null;
  readonly delta: string;
};

const plHeading = (label: string): PlRow => ({
  kind: 'h',
  label,
  value: 0,
  share: '',
  previous: 0,
  delta: '',
});

/**
 * July against June, VAT-exclusive, all five branches.
 *
 * The specimen, and the only one of the seven the API cannot answer in full.
 * `documents-server.ts` builds a live statement from `analytics/summary` and
 * `finance/expenses` — revenue by channel and operating cost by category — and
 * leaves out the cost of sales, the depreciation, the interest and the tax,
 * because no module holds them and a P&L that guessed them would be a signed
 * document with invented figures on it. The reasoning is written out in full
 * beside `profitLossFor()`.
 */
export const PL_ROWS: readonly PlRow[] = [
  plHeading('Tushum'),
  {
    kind: 'r',
    label: 'Zal',
    value: som(214_800_000),
    share: '68.2',
    previous: som(201_400_000),
    delta: '+6.7%',
  },
  {
    kind: 'r',
    label: 'Olib ketish',
    value: som(62_400_000),
    share: '19.8',
    previous: som(58_900_000),
    delta: '+5.9%',
  },
  {
    kind: 'r',
    label: "Yetkazish · o'z kuryerlarimiz",
    value: som(24_100_000),
    share: '7.6',
    previous: som(19_800_000),
    delta: '+21.7%',
  },
  {
    kind: 'r',
    label: 'Agregatorlar · komissiyadan keyin',
    value: som(13_800_000),
    share: '4.4',
    previous: som(11_200_000),
    delta: '+23.2%',
  },
  {
    kind: 't',
    label: "Jami tushum, QQS'siz",
    value: som(315_100_000),
    share: '100.0',
    previous: som(291_300_000),
    delta: '+8.2%',
  },

  plHeading('Tannarx'),
  {
    kind: 'r',
    label: 'Xomashyo',
    value: som(-94_300_000),
    share: '29.9',
    previous: som(-88_100_000),
    delta: '+7.0%',
  },
  {
    kind: 'r',
    label: 'Chiqindi va yaroqsiz',
    value: som(-3_200_000),
    share: '1.0',
    previous: som(-3_800_000),
    delta: '−15.8%',
  },
  {
    kind: 'r',
    label: 'Xodim ovqati',
    value: som(-1_400_000),
    share: '0.5',
    previous: som(-1_300_000),
    delta: '+7.7%',
  },
  {
    kind: 't',
    label: 'Yalpi foyda',
    value: som(216_200_000),
    share: '68.6',
    previous: som(198_100_000),
    delta: '+9.1%',
  },

  plHeading('Operatsion xarajatlar'),
  {
    kind: 'r',
    label: 'Mehnat · maosh, bonus, xizmat haqi',
    value: som(-83_200_000),
    share: '26.4',
    previous: som(-78_400_000),
    delta: '+6.1%',
  },
  {
    kind: 'r',
    label: 'Ijara · 5 filial',
    value: som(-42_000_000),
    share: '13.3',
    previous: som(-42_000_000),
    delta: '0%',
  },
  {
    kind: 'r',
    label: 'Kommunal',
    value: som(-11_600_000),
    share: '3.7',
    previous: som(-9_800_000),
    delta: '+18.4%',
  },
  {
    kind: 'r',
    label: "Marketing · aksiya va sovg'a",
    value: som(-8_400_000),
    share: '2.7',
    previous: som(-6_900_000),
    delta: '+21.7%',
  },
  {
    kind: 'r',
    label: "Ta'mirlash va xizmat",
    value: som(-6_100_000),
    share: '1.9',
    previous: som(-4_200_000),
    delta: '+45.2%',
  },
  {
    kind: 'r',
    label: 'Bank komissiyasi va boshqa',
    value: som(-7_900_000),
    share: '2.5',
    previous: som(-7_200_000),
    delta: '+9.7%',
  },
  {
    kind: 't',
    label: 'EBITDA',
    value: som(57_000_000),
    share: '18.1',
    previous: som(49_600_000),
    delta: '+14.9%',
  },

  plHeading('Moliyaviy va soliq'),
  {
    kind: 'r',
    label: 'Amortizatsiya',
    value: som(-7_800_000),
    share: '2.5',
    previous: som(-7_800_000),
    delta: '0%',
  },
  {
    kind: 'r',
    label: 'Kredit foizi',
    value: som(-4_200_000),
    share: '1.3',
    previous: som(-4_400_000),
    delta: '−4.5%',
  },
  {
    kind: 'r',
    label: "Foyda solig'i · 15%",
    value: som(-6_750_000),
    share: '2.1',
    previous: som(-5_610_000),
    delta: '+20.3%',
  },
  {
    kind: 'f',
    label: 'Sof foyda',
    value: som(38_250_000),
    share: '12.1',
    previous: som(31_790_000),
    delta: '+20.3%',
  },
];

/**
 * Whether a change is good news: money coming in growing, or money going out
 * shrinking.
 *
 * The design's script writes this as `good = isTot ? up : !up` — every row that
 * is not a subtotal is treated as a cost. That is right for the nine cost lines
 * and wrong for the four revenue ones, so the prototype prints `Zal +6.7%`,
 * `Olib ketish +5.9%`, `Yetkazish +21.7%` and `Agregatorlar +23.2%` in red: a
 * restaurant's four growing income streams, drawn as four problems, on the one
 * document an owner takes to a bank.
 *
 * The rule here is the sign of the row's own figure instead, and that is not an
 * invention — it is the discriminator the design's own data already carries.
 * Revenue rows are positive (`214800000`), cost rows negative (`-94300000`), and
 * the colour rule simply never looked. Row for row it agrees with the file on
 * twenty of the twenty-four and differs only on the four it visibly gets wrong:
 *
 *   - subtotals (`t`, `f`) are all positive → `good = up`, the design's `isTot` branch
 *   - cost details are negative           → `good = !up`, the design's other branch
 *   - revenue details are positive        → `good = up`, which the design misses
 *
 * This is the one place in the build that departs from the file's *output*, and
 * it does so by following the file's own *data*. `documents-fidelity.test.ts`
 * pins both halves: that the twenty agree, and that the four are corrected.
 */
export const deltaTone = (row: PlRow): 'neutral' | 'good' | 'bad' => {
  if (row.delta === '0%' || row.delta === '') return 'neutral';

  const up = row.delta.startsWith('+');
  const incoming = row.value >= 0;

  return (incoming ? up : !up) ? 'good' : 'bad';
};

/** One of the three ratios under the table, each against the figure it beats. */
export type PlRatio = {
  readonly label: string;
  readonly value: string;
  readonly against: string;
  readonly tone: 'good' | 'warn';
};

/** Everything on the statement that is not one of its rows. */
export type ProfitLossDoc = {
  readonly title: string;
  readonly subtitle: string;
  readonly venue: string;
  readonly number: string;
  readonly issued: string;
  readonly columns: readonly string[];
  readonly ratios: readonly PlRatio[];
  readonly method: { readonly lead: string; readonly body: string };
  readonly signatures: readonly string[];
};

export const PROFIT_LOSS = {
  title: 'Foyda va zarar hisoboti',
  subtitle: "2026-yil iyul · barcha filiallar · QQS'siz",
  venue: 'SMART RESTAURANT',
  number: '№ PL-2026-07',
  issued: 'Tuzilgan: 05.08.2026',

  columns: ["Ko'rsatkich", 'Iyul', '%', 'Iyun', "O'zgarish"] as readonly string[],

  ratios: [
    { label: 'Tannarx ulushi', value: '31.4%', against: "me'yor 32%", tone: 'good' },
    { label: 'Mehnat ulushi', value: '26.4%', against: "me'yor 28%", tone: 'good' },
    { label: 'EBITDA marja', value: '18.1%', against: 'iyunda 19.4%', tone: 'warn' },
  ] as readonly {
    readonly label: string;
    readonly value: string;
    readonly against: string;
    readonly tone: 'good' | 'warn';
  }[],

  method: {
    lead: 'Metodika.',
    body:
      "Tushum QQS'siz ko'rsatilgan (Q1: menyudagi narx QQS bilan, hisobotda jami / 1.12). " +
      "Xizmat haqi tushumga kiritilgan (Q2). Sovg'a qilingan taomlar marketing xarajatida, " +
      "qaytarilgan cheklar tushumdan chegirilgan (Q8). Xodim ovqati tannarx bo'yicha " +
      'operatsion xarajatda (Q9). Ish kuni 06:00–06:00 (Q3).',
  },

  signatures: [
    "Buxgalter · Malika Yo'ldosheva",
    'Tasdiqlagan · Rustam Kamolov, egasi',
  ] as readonly string[],
} as const;

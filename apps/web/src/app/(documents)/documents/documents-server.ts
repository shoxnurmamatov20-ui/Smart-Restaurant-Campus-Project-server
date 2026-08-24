import { apiGet, type Paginated } from '@/lib/api-server';

import { LIVE_PARAM } from './documents-copy';
import {
  CUSTOMER_RECEIPT,
  INVOICE,
  KITCHEN_TICKET,
  money,
  PAYSLIP,
  PL_ROWS,
  PROFIT_LOSS,
  STOCK_COUNT,
  Z_REPORT,
  type CountRow,
  type DocumentKey,
  type InvoiceDoc,
  type InvoiceLine,
  type PayslipDoc,
  type PayslipRow,
  type PlRatio,
  type PlRow,
  type ProfitLossDoc,
  type ReceiptDoc,
  type ReceiptLine,
  type StockCountDoc,
  type TicketDoc,
  type TicketLine,
  type ZReportDoc,
  type ZRow,
} from './documents-data';

/**
 * 02 · Hujjatlar, from the API.
 *
 * Server half of ./documents-data.ts, per the house rule: types and specimens
 * there, anything that reaches the server here, because `@/lib/api-server` reads
 * `next/headers` and that cannot survive a client import.
 *
 * **A second query parameter is what makes a document real.** `?d=z` is the
 * specimen the design drew; `?d=z&shift=318` is the Z of shift 318. That split
 * is the whole design of this file and it is deliberate rather than incidental:
 * these seven sheets are the only screens in the console whose entire content is
 * *figures*, and a figure with no subject is not a smaller truth, it is a
 * different document. Nobody wants a Z report — they want *this* shift's.
 *
 * Which parameter belongs to which document is `LIVE_PARAM`, in
 * ./documents-copy.ts beside `documentHref` — URL shape is that module's. And
 * the surface says out loud which of the two it is holding, because a specimen
 * a reader mistakes for a record is the one failure mode a printed document has
 * that a screen does not: it leaves the building.
 *
 * ---------------------------------------------------------------------------
 * Three layers of permission, and this file is behind all of them
 *
 * `middleware.ts` decides who reaches `/documents`; `DOCUMENT_ACCESS` decides
 * which `?d=` they may open. Both run before anything here. The third layer is
 * the one that matters most and costs nothing: every read below goes out on the
 * **reader's own token** — `apiGet()` lifts it from the httpOnly session cookie
 * — so the API re-decides, per request and against Spatie's own permissions,
 * whether this person may see this shift, this bill, this employee's hours.
 * Nothing here is trusted to have got the first two layers right.
 *
 * It shows up as a real, visible limit rather than as theory. `settings.view`
 * belongs to the owner, the brand and branch managers and the accountant — and
 * **not to the cashier or the storekeeper** (`RolesAndPermissionsSeeder`). So a
 * cashier printing a live receipt gets the bill, the tender rows and the fiscal
 * block, and gets `null` for the letterhead. The answer to that is `'—'` and a
 * document marked incomplete, never the specimen's restaurant: printing SMART
 * RESTAURANT's name and STIR on another tenant's receipt is not a cosmetic
 * fallback, it is a forged tax document.
 *
 * ---------------------------------------------------------------------------
 * What this file will not do
 *
 * It never derives a figure the document should have been given. A bank reads
 * the P&L and a tax inspector reads the receipt; a plausible number computed
 * here is worse than a missing one, because a missing one is visible. Where a
 * section cannot be filled it is left out and the sheet says so — the same
 * reasoning `(dashboard)/dashboard/overview-server.ts` already applies when it
 * refuses to draw a gross profit off a partial cost base.
 */

/* --------------------------------------------------------------- the shape */

/**
 * Whether the sheet on screen is the design's specimen, a real document, or a
 * real document with a hole in it.
 *
 * `partial` is not a courtesy. It is what a reader needs before they sign the
 * thing: a payslip whose service-charge line could not be computed is still
 * worth printing to check the hours on, and is not worth handing to the
 * employee.
 */
export type DocumentSource = 'specimen' | 'live' | 'partial';

export type LoadedDocument =
  | { key: 'index'; source: 'specimen' }
  | { key: 'receipts'; source: DocumentSource; receipt: ReceiptDoc; ticket: TicketDoc }
  | { key: 'z'; source: DocumentSource; report: ZReportDoc }
  | { key: 'invoice'; source: DocumentSource; invoice: InvoiceDoc }
  | { key: 'stock-count'; source: DocumentSource; sheet: StockCountDoc }
  | { key: 'payslip'; source: DocumentSource; payslip: PayslipDoc }
  | {
      key: 'profit-loss';
      source: DocumentSource;
      statement: ProfitLossDoc;
      rows: readonly PlRow[];
    };

export type QueryParams = Readonly<Record<string, string | string[] | undefined>>;

/** One value from a query parameter that Next hands over as string or array. */
const one = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw === undefined || raw.trim() === '' ? null : raw.trim();
};

/* ------------------------------------------------------------- formatting */

/**
 * `15.08.2026`, which is the only date any of the seven prints.
 *
 * Cut out of the string rather than parsed into a `Date`. The API sends ISO8601
 * with the restaurant's own offset, and `new Date(...)` would re-read it in the
 * server's zone — a shift that closed at 23:48 in Tashkent printing as the
 * following day on a container running UTC. `till-server.ts` slices for the same
 * reason.
 */
const dmy = (iso: string | null | undefined): string => {
  if (!iso) return '—';

  const [year, month, day] = iso.slice(0, 10).split('-');

  return day && month && year ? `${day}.${month}.${year}` : '—';
};

/** `21:14`. */
const hm = (iso: string | null | undefined): string => (iso ? iso.slice(11, 16) : '—');

/** `15.08.2026 21:14`. */
const dmyHm = (iso: string | null | undefined): string => (iso ? `${dmy(iso)} ${hm(iso)}` : '—');

const zRow = (label: string, amount: number, signed = false): ZRow => ({ label, amount, signed });

/** A tender code as the paper says it; an unknown one keeps its own name. */
const METHOD_LABEL: Readonly<Record<string, string>> = {
  cash: 'Naqd',
  card: 'Karta',
  click: 'Click',
  payme: 'Payme',
  uzum: 'Uzum',
  transfer: "O'tkazma",
  credit: 'Kompaniya hisobi',
  bonus: 'Bonus',
};

const methodLabel = (method: string): string => METHOD_LABEL[method] ?? method;

/** How the order reached the kitchen, in the words the receipt uses. */
const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  dine_in: 'Zalda',
  takeaway: 'Olib ketish',
  delivery: 'Yetkazish',
  aggregator: 'Agregator',
};

/**
 * The eight built-in headings, in the words a printed statement uses.
 *
 * `finance.expense_categories` is where a restaurant's OWN headings live now, and
 * it publishes a translated title — but this map is what covers the eight the
 * till writes by name, which have no row until somebody edits one. An unmapped
 * category prints under its own code rather than under "Boshqa": a restaurant
 * that invented a heading should see it, not lose it into a bucket.
 */
const EXPENSE_LABEL: Readonly<Record<string, string>> = {
  rent: 'Ijara',
  utilities: 'Kommunal',
  salary: 'Mehnat',
  payroll: 'Mehnat',
  marketing: 'Marketing',
  repair: "Ta'mirlash va xizmat",
  supplies: 'Xomashyo',
  bank: 'Bank komissiyasi',
  tax: 'Soliq',
  delivery: 'Yetkazish xarajati',
  other: 'Boshqa',
};

/* ------------------------------------------------------------- letterhead */

type ApiLegal = {
  name?: string;
  tax_id?: string;
  address?: string;
  vat_registered?: boolean;
};

type ApiSettings = {
  data?: {
    name?: string;
    settings?: {
      legal?: ApiLegal;
      brand?: { name?: string };
      vat_percent?: number;
      service_charge_percent?: number;
    };
  };
};

/** `GET /settings/site` — a separate endpoint because a marketer writes it. */
type ApiSiteSettings = { data?: { phone?: string } };

/**
 * Who the restaurant is, on paper.
 *
 * Four of the seven documents carry it and every one of them is read by somebody
 * outside the building — a guest checking a receipt against soliq.uz, a supplier
 * invoicing against a purchase order, an employee querying a payslip. It comes
 * from `GET /settings` (`legal.*`, `brand.*`) plus `GET /settings/site` for the
 * phone, which is the one contact detail `legal` does not carry.
 *
 * Two flags rather than one, because the four documents do not all need the same
 * thing. A receipt and a purchase order are read by the tax office and by a
 * supplier's accountant and are wrong without a STIR and an address, so they ask
 * `complete`; a Z report and a payslip only put the restaurant's name at the top,
 * so they ask `named`. One flag would mark a Z incomplete over an address it
 * does not print.
 *
 * Both are false when the reader's token could not open settings at all, which
 * for a cashier is the normal case rather than an error — see the permission note
 * at the top of this file.
 */
type Letterhead = {
  venue: string;
  legal: string;
  address: string;
  registration: string;
  phone: string;
  vatPercent: number;
  servicePercent: number;
  /** The restaurant's name is known. */
  named: boolean;
  /** Its full requisites are known: name, address and STIR. */
  complete: boolean;
};

async function letterhead(): Promise<Letterhead> {
  const [settings, site] = await Promise.all([
    apiGet<ApiSettings>('/settings'),
    apiGet<ApiSiteSettings>('/settings/site'),
  ]);

  const restaurant = settings?.data;
  const values = restaurant?.settings;
  const legal = values?.legal;
  const phone = site?.data?.phone ?? '';

  /*
   * Q1 and Q3's rates as the floor. They are the platform's own defaults and
   * they only ever reach a *label* here — "QQS 12%" — never an amount that was
   * not already computed by the API, so a restaurant on a different rate reads
   * a wrong caption rather than a wrong total.
   */
  const vatPercent = values?.vat_percent ?? 12;
  const servicePercent = values?.service_charge_percent ?? 10;

  if (!restaurant) {
    return {
      venue: '—',
      legal: '—',
      address: '—',
      registration: '—',
      phone: '—',
      vatPercent,
      servicePercent,
      named: false,
      complete: false,
    };
  }

  const taxId = legal?.tax_id ?? '';
  const registration = [taxId === '' ? '' : `STIR ${taxId}`, phone].filter(Boolean).join(' · ');
  const venue = values?.brand?.name ?? restaurant.name ?? '';

  return {
    // `brand.name` is what the sign over the door says; `legal.name` is what the
    // tax office calls the company. A receipt wants the first, a purchase order
    // wants both, and the tenant's own name is the last resort.
    venue: venue === '' ? '—' : venue,
    legal: legal?.name ?? restaurant.name ?? '—',
    address: legal?.address ?? '—',
    registration: registration === '' ? '—' : registration,
    phone: phone === '' ? '—' : phone,
    vatPercent,
    servicePercent,
    named: venue !== '',
    complete: venue !== '' && taxId !== '' && (legal?.address ?? '') !== '',
  };
}

/* ============================================================= 02 receipts */

type ApiLineModifier = { option_id: number | null; title: string; price_delta: number };

type ApiBillLine = {
  order_id: number;
  title: string;
  quantity: number;
  total_price: number;
  note: string | null;
  seat_no: number;
  bill_no: number;
  modifiers: ApiLineModifier[];
};

type ApiBill = {
  id: number;
  number: string;
  channel: string;
  table_label: string | null;
  guests_count: number;
  subtotal: number;
  discount_total: number;
  service_charge: number;
  vat_included: number;
  total: number;
  lines: ApiBillLine[];
};

type ApiFiscalReceipt = {
  order_id: number | null;
  business_date: string | null;
  kind: string;
  status: string;
  fiscal_sign: string | null;
  module_no: string | null;
  qr_url: string | null;
  registered_at: string | null;
  created_at: string | null;
};

type ApiPayment = {
  method: string;
  amount: number;
  status: string;
  paid_at: string | null;
};

/**
 * The guest's receipt for one bill.
 *
 * Three reads, because there is no one endpoint for a receipt —
 * `pos/bills/{id}/receipt` does not exist, and the paper is genuinely three
 * modules' work: Pos owns the bill and its lines, Finance owns what was tendered
 * against it, and the fiscal module owns the block the guest verifies. They are
 * fetched together because a receipt missing any one of the three is not a
 * receipt.
 */
async function receiptFor(billId: string, head: Letterhead): Promise<ReceiptDoc | null> {
  const id = encodeURIComponent(billId);
  const bill = (await apiGet<{ data?: ApiBill }>(`/pos/bills/${id}`))?.data;

  if (!bill) return null;

  const [tenders, fiscal] = await Promise.all([
    apiGet<Paginated<ApiPayment>>(`/finance/payments?filter[order]=${bill.id}&per_page=50`),
    apiGet<Paginated<ApiFiscalReceipt>>(
      `/finance/fiscal/receipts?filter[order]=${bill.id}&per_page=10`,
    ),
  ]);

  // The sale, not a refund or a correction against it — those are their own
  // receipts with their own fiscal signs, and printing one of them under a
  // guest's total would tell them they were charged twice.
  const stamp = (fiscal?.data ?? []).find((receipt) => receipt.kind === 'sale');
  const paid = (tenders?.data ?? []).filter((payment) => payment.status !== 'refunded');

  const lines: ReceiptLine[] = bill.lines.map((line) => ({
    quantity: line.quantity,
    name: line.title,
    amount: line.total_price,
    /*
     * `m1` is the seat, which is how a runner knows whose plate this is; the
     * modifiers and the kitchen note follow it. The design's own strip reads
     * `m1 · qo'shimcha go'sht`, and this is that line rebuilt from the three
     * fields the bill actually carries.
     */
    note: [`m${line.seat_no}`, ...line.modifiers.map((modifier) => modifier.title), line.note ?? '']
      .filter((part) => part !== '')
      .join(' · '),
  }));

  const orders = [...new Set(bill.lines.map((line) => line.order_id))];
  const bills = [...new Set(bill.lines.map((line) => line.bill_no))];

  /*
   * Built as a list of rows that exist rather than a fixed nine.
   *
   * The waiter and the cashier are the two the design prints that this endpoint
   * cannot answer: the bill carries `waiter_user_id` and no name, and no cashier
   * at all. A row reading "Ofitsiant · 12" would be an internal id on a
   * customer's receipt, so the row is absent instead.
   */
  const meta: (readonly [string, string])[] = [
    ['Chek', `№ ${bill.number}`],
    ['Sana', dmyHm(stamp?.registered_at ?? stamp?.created_at ?? paid[0]?.paid_at ?? null)],
    ['Ish kuni', dmy(stamp?.business_date ?? null)],
    ['Stol · mehmon', `${bill.table_label ?? '—'} · ${bill.guests_count}`],
    ['Hisob', bills.join(' / ')],
    ['Buyurtmalar', orders.join(' ')],
    ['Buyurtma turi', CHANNEL_LABEL[bill.channel] ?? bill.channel],
  ];

  return {
    venue: head.venue,
    // The bill names its table, never its venue, and a branch id printed as a
    // number would say nothing to the person holding the paper.
    branch: '',
    address: head.address,
    registration: head.registration,
    meta,
    lines,
    items: bill.subtotal,
    serviceLabel: `Xizmat haqi  ${head.servicePercent}%`,
    service: bill.service_charge,
    itemsWithService: bill.subtotal + bill.service_charge,
    // The design names the tier — "Oltin karta 5%" — which the bill does not
    // carry; it holds one aggregate `discount_total` and no reason for it.
    discountLabel: 'Chegirma',
    discount: bill.discount_total,
    total: bill.total,
    vatLabel: `shundan QQS ${head.vatPercent}%`,
    // Shown, never added: the menu price already contains it (Q1), and the API
    // says so in the field's own name.
    vat: bill.vat_included,
    tender: paid.map((payment) => [methodLabel(payment.method), payment.amount] as const),
    fiscalModule: stamp?.module_no ?? '—',
    fiscalSign: stamp?.fiscal_sign ?? '—',
    qrNote: CUSTOMER_RECEIPT.qrNote,
    thanks: CUSTOMER_RECEIPT.thanks,
    phones: head.phone,
    phonesNote: CUSTOMER_RECEIPT.phonesNote,
  };
}

type ApiTicketLine = {
  title: string;
  quantity: number;
  note: string | null;
  modifiers: string[];
  seat_no: number;
};

type ApiKitchenTicket = {
  id: number;
  order_number: string;
  station: string;
  table_label: string | null;
  channel: string;
  waiter: { id: number; name: string | null } | null;
  lines: ApiTicketLine[];
  sla_minutes: number;
  started_at: string | null;
  created_at: string | null;
};

/**
 * The kitchen's docket.
 *
 * `EloquentTicketWriter` writes the lines as jsonb with names only — no ids and
 * **no prices** — which is the same rule the paper obeys, enforced one layer
 * lower. Nothing here could print money onto this strip even by mistake.
 */
async function ticketFor(ticketId: string): Promise<TicketDoc | null> {
  const id = encodeURIComponent(ticketId);
  const ticket = (await apiGet<{ data?: ApiKitchenTicket }>(`/kitchen/tickets/${id}`))?.data;

  if (!ticket) return null;

  const lines: TicketLine[] = (ticket.lines ?? []).map((line) => ({
    quantity: line.quantity,
    name: line.title.toUpperCase(),
    /*
     * Red is for the modifier that ruins a plate, and the API's two fields split
     * along exactly that line: `modifiers` are catalogue options a guest chose
     * from a list, `note` is what somebody typed — which is where "no onion,
     * allergy" is written. So the note alarms and the options do not, and a
     * kitchen keeps reading the red ones.
     */
    modifiers: [
      ...line.modifiers.map((text) => ({ text: `+ ${text}`, alert: false })),
      ...(line.note === null || line.note === ''
        ? []
        : [{ text: `! ${line.note.toUpperCase()}`, alert: true }]),
    ],
    seat: `mehmon ${line.seat_no}`,
  }));

  const portions = lines.reduce((total, line) => total + line.quantity, 0);

  return {
    number: `№ ${ticket.id}`,
    where:
      ticket.table_label === null
        ? (CHANNEL_LABEL[ticket.channel] ?? ticket.channel).toUpperCase()
        : `STOL ${ticket.table_label.toUpperCase()}`,
    reference: [ticket.order_number],
    station: ticket.station.toUpperCase(),
    // There is no `fired_at` column anywhere in the API. The docket is written
    // at the moment the bill is sent, so its own `created_at` *is* the firing
    // time; `started_at` is later — when a cook picked it up.
    firedAt: hm(ticket.created_at),
    lines,
    foot: [
      // `KitchenTicketController@show` eager-loads nothing, so `waiter.name` is
      // null on this endpoint even when the ticket has a waiter — only the KDS
      // index joins the relation.
      ['Ofitsiant', ticket.waiter?.name ?? '—'],
      ['Yuborilgan', hm(ticket.created_at)],
      ["Me'yor", `${ticket.sla_minutes} daqiqa`],
    ],
    stamp: `${lines.length} POZITSIYA · ${portions} PORTSIYA`,
  };
}

/* ============================================================== 03 Z report */

type ApiShiftReport = {
  shift: {
    number: string;
    status: string;
    opened_at: string | null;
    closed_at: string | null;
  };
  turnover: { takings: number; refunded: number; bills: number };
  methods: { method: string; amount: number }[];
  drawer: {
    opening_cash: number;
    cash_taken: number;
    cash_rounding: number;
    cash_tips: number;
    cash_brought_in: number;
    cash_paid_out: number;
    expected_cash: number;
    counted_cash: number | null;
    difference: number | null;
  };
  adjustments: {
    rounding: number;
    tips: { total: number; cash: number; non_cash: number };
    refunds: { count: number; amount: number };
  };
  variance: { difference: number };
  signatures: { counted_by: string | null; witnessed_by: string | null };
};

/**
 * One shift's Z.
 *
 * `GET /finance/shifts/{id}/report` answers the whole document, and for a closed
 * shift it answers with the frozen `z_report` jsonb verbatim — the same bytes
 * the cashier signed. **Nothing below recomputes a figure of it.** That freezing
 * exists precisely so refunding one of yesterday's bills this afternoon cannot
 * restate yesterday's Z, and a printer deriving its own totals would undo it.
 *
 * Two rows the design draws that the report does not carry, both left out rather
 * than guessed at:
 *
 *   **The VAT line.** The shift report has no tax figure at all — VAT lives on
 *   the bill (`vat_included`) and on the fiscal receipt (`vat_total`), neither of
 *   which is summed per shift. `turnoverVat` is therefore null and the roll
 *   simply has no such row.
 *
 *   **Voided and comped counts.** `adjustments` carries refunds only, so the
 *   corrections block prints the one line it can prove.
 */
async function zReportFor(shiftId: string, head: Letterhead): Promise<ZReportDoc | null> {
  const id = encodeURIComponent(shiftId);
  const report = (await apiGet<{ data?: ApiShiftReport }>(`/finance/shifts/${id}/report`))?.data;

  if (!report?.shift) return null;

  const { shift, turnover, drawer, adjustments, variance, signatures } = report;

  const turnoverRows: ZRow[] = [zRow('Aylanma', turnover.takings)];

  if (turnover.refunded !== 0) turnoverRows.push(zRow('Qaytarilgan', -turnover.refunded, true));
  if (adjustments.rounding !== 0) turnoverRows.push(zRow('Yaxlitlash', adjustments.rounding, true));

  const drawerRows: ZRow[] = [zRow("Boshlang'ich", drawer.opening_cash)];

  if (drawer.cash_taken !== 0) drawerRows.push(zRow('Naqd tushum', drawer.cash_taken, true));
  if (drawer.cash_tips !== 0) drawerRows.push(zRow('Naqd choypuli', drawer.cash_tips, true));
  if (drawer.cash_brought_in !== 0) {
    drawerRows.push(zRow('Kiritilgan', drawer.cash_brought_in, true));
  }
  if (drawer.cash_paid_out !== 0) drawerRows.push(zRow('Chiqim', -drawer.cash_paid_out, true));
  if (drawer.cash_rounding !== 0) drawerRows.push(zRow('Yaxlitlash', drawer.cash_rounding, true));

  return {
    title: 'Z-HISOBOT',
    venue: head.venue,
    // "Kassa 1 · FM 7742 1180" in the design. The shift report names neither the
    // register nor the fiscal module it is paired with.
    register: '',
    meta: [
      ['Smena', `№ ${shift.number}`],
      // The report carries no `business_date`; the day a shift opened on is the
      // trading day it belongs to, since a shift never spans the 06:00 boundary
      // it was opened after.
      ['Ish kuni', dmy(shift.opened_at)],
      ['Ochilgan', hm(shift.opened_at)],
      ['Yopilgan', hm(shift.closed_at)],
      ['Kassir', signatures.counted_by ?? '—'],
    ],
    turnoverTitle: 'AYLANMA',
    bills: { label: 'Cheklar soni', count: turnover.bills },
    turnover: turnoverRows,
    turnoverTotal: zRow('JAMI AYLANMA', turnover.takings),
    turnoverVat: null,
    methodsTitle: "TO'LOV TURLARI",
    methods: report.methods.map((method) => zRow(methodLabel(method.method), method.amount)),
    drawerTitle: 'NAQD KASSA',
    drawer: drawerRows,
    expected: zRow('Kutilgan', drawer.expected_cash),
    // Null until somebody has counted. Zero is the true figure for an uncounted
    // drawer on paper: the line is there to be filled in by hand if the sheet is
    // printed before the count, which is exactly when a manager prints it.
    counted: zRow('Sanalgan', drawer.counted_cash ?? 0),
    variance: zRow('FARQ', drawer.difference ?? variance.difference, true),
    correctionsTitle: 'TUZATISHLAR',
    corrections:
      adjustments.refunds.count === 0
        ? []
        : [['Qaytarilgan', adjustments.refunds.count, adjustments.refunds.amount] as const],
    cardTips: zRow('Choypuli · karta', adjustments.tips.non_cash),
    reasonLabel: Z_REPORT.reasonLabel,
    signatures: Z_REPORT.signatures,
  };
}

/* =============================================================== 04 invoice */

type ApiPurchaseOrder = {
  id: number;
  supplier_id: number | null;
  supplier: { id: number; name: string } | null;
  number: string;
  status: string;
  expected_at: string | null;
  total: number;
  note: string | null;
  items: {
    name: string;
    unit: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
  created_at: string | null;
};

type ApiSupplier = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number | null;
};

/**
 * One purchase order.
 *
 * The supplier is fetched separately because the order nests only `{id, name}`
 * — and the block the design draws is four lines of contact details that live on
 * the supplier record.
 *
 * **The VAT split is derived, and this is the one place in the file that derives
 * anything.** `purchase_orders` has a single `total` and no tax column at all.
 * The design's own sheet shows why that is still answerable: its line amounts
 * sum to 10 666 000, which is the *gross* it prints, and its "Jami, QQS'siz"
 * of 9 523 214 is that figure over 1.12. So the tax is inside the price, exactly
 * as it is everywhere else on this platform (Q1), and the split below is the
 * document's own arithmetic rather than a new claim — at the restaurant's own
 * rate from `settings.vat_percent`, not a hard-coded twelve.
 */
async function invoiceFor(orderId: string, head: Letterhead): Promise<InvoiceDoc | null> {
  const id = encodeURIComponent(orderId);
  const order = (await apiGet<{ data?: ApiPurchaseOrder }>(`/suppliers/purchase-orders/${id}`))
    ?.data;

  if (!order) return null;

  const supplier =
    order.supplier_id === null
      ? null
      : ((await apiGet<{ data?: ApiSupplier }>(`/suppliers/suppliers/${order.supplier_id}`))
          ?.data ?? null);

  const lines: InvoiceLine[] = order.items.map((item) => ({
    name: item.name,
    unit: item.unit ?? '',
    quantity: item.quantity,
    price: item.unit_price,
    amount: item.total_price,
  }));

  const due = order.total;
  const vat = Math.round((due * head.vatPercent) / (100 + head.vatPercent));

  return {
    seller: {
      name: head.venue,
      legal: head.legal,
      address: head.address,
      registration: head.registration,
    },
    title: INVOICE.title,
    number: `№ ${order.number}`,
    date: dmy(order.created_at),
    supplier: {
      label: INVOICE.supplier.label,
      name: order.supplier?.name ?? '—',
      // No STIR and no address: `SupplierResource` carries neither, which is the
      // one field a supplier's own accountant will ask for.
      lines: [
        supplier?.contact_name ?? '',
        supplier?.phone ?? '',
        supplier?.email ?? '',
        supplier?.payment_terms_days === null || supplier?.payment_terms_days === undefined
          ? ''
          : `To'lov: yetkazib berilgandan ${supplier.payment_terms_days} kun`,
      ].filter((line) => line !== ''),
    },
    delivery: {
      label: INVOICE.delivery.label,
      // The order names no branch and no receiver — `purchase_orders` carries
      // neither — so the destination is the order's own note when it has one.
      name: '—',
      lines: [
        `Kutilgan sana: ${dmyHm(order.expected_at)}`,
        `Holati: ${order.status}`,
        order.note ?? '',
      ].filter((line) => line !== ''),
    },
    columns: INVOICE.columns,
    lines,
    netLabel: INVOICE.netLabel,
    net: due - vat,
    vatLabel: `QQS ${head.vatPercent}%`,
    vat,
    dueLabel: INVOICE.dueLabel,
    due,
    /*
     * Generic, where the specimen's are not.
     *
     * The design's acceptance conditions are written for the meat order it
     * depicts — "+2…+4 °C, muzlatilmagan holda", a veterinary certificate per
     * line. Printing those on an order for flour would be a condition the
     * supplier cannot meet and the storekeeper cannot check. What survives is
     * the half that is true of any delivery, and it is the half that matters:
     * a mismatch is refused and a shortfall comes off the invoice.
     */
    terms: {
      lead: INVOICE.terms.lead,
      body:
        'Yetkazilgan mahsulot buyurtmadagi nom, miqdor va sifatga mos kelishi shart. ' +
        "Mos kelmasa yoki hujjati to'liq bo'lmasa, omborchi qabul qilishdan bosh tortadi va " +
        'tizimda «rad etildi» deb belgilaydi. Kam chiqqan miqdor hisob-fakturadan chegiriladi.',
    },
    // The design signs these with the two people who ordered and approved. The
    // order records neither, so the paper carries the roles and a blank rule for
    // the name — which is what a signature line is for.
    signatures: [
      { line: 'Buyurtma bergan · omborchi', below: 'Muhr joyi' },
      { line: 'Tasdiqlagan · menejer', below: 'Sana' },
    ],
  };
}

/* =========================================================== 05 stock count */

type ApiIngredient = {
  name: string;
  unit: string;
  storage: string | null;
  store: string;
};

/** Where the ingredient is kept, in the words the sheet's "Joy" column wants. */
const STORE_LABEL: Readonly<Record<string, string>> = {
  main: 'Asosiy ombor',
  kitchen: 'Oshxona',
  bar: 'Bar',
};

/**
 * The count sheet for one store room.
 *
 * **`GET /inventory/items` is not the list this wants**, despite its name: it is
 * `IngredientController@lookup`, a barcode/`?q=` scanner endpoint that returns
 * at most 25 rows and, with neither parameter, deliberately returns none. A
 * count sheet built on it would print empty and look like a working feature.
 * The paginated index is `GET /inventory/ingredients`, and it carries the three
 * columns this document has: `name`, `unit` and where the thing lives.
 *
 * What it must never ask for is the quantity — and it does not have to try:
 * `CountRow` has nowhere to put one. The warning band on the sheet is the reason
 * ("omborchi ko'rmasdan sanaydi"), and a storekeeper who reads the system's
 * figure before counting confirms it instead of counting.
 */
async function stockCountFor(store: string): Promise<StockCountDoc | null> {
  const all = store === 'all' || store === '*';
  const query = all ? '' : `&filter[store]=${encodeURIComponent(store)}`;
  const page = await apiGet<Paginated<ApiIngredient>>(
    `/inventory/ingredients?per_page=100&sort=name${query}`,
  );

  if (!page?.data) return null;

  const rows: CountRow[] = page.data.map((item) => ({
    name: item.name,
    // `storage` is the shelf it lives on and `store` is which room; the shelf is
    // what somebody walking round with a clipboard needs, and the room is the
    // honest fallback when nobody has filled the shelf in.
    location: item.storage ?? STORE_LABEL[item.store] ?? item.store,
    unit: item.unit,
  }));

  const today = new Date().toISOString();

  return {
    title: STOCK_COUNT.title,
    subtitle: all ? 'Barcha omborlar' : (STORE_LABEL[store] ?? store),
    number: `№ INV-${today.slice(0, 10)}`,
    date: dmy(today),
    time: STOCK_COUNT.time,
    warning: STOCK_COUNT.warning,
    columns: STOCK_COUNT.columns,
    rows,
    signatures: STOCK_COUNT.signatures,
    footnote: STOCK_COUNT.footnote,
  };
}

/* =============================================================== 06 payslip */

/** `2026-08` — the month a payslip covers, defaulting to the one we are in. */
const monthOf = (asked: string | null): string =>
  asked !== null && /^\d{4}-\d{2}$/.test(asked) ? asked : new Date().toISOString().slice(0, 7);

const MONTH_NAME: readonly string[] = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** One frozen payroll run, and the lines it holds. */
type ApiPayrollPeriod = {
  id: number;
  period: string;
  starts_on: string;
  ends_on: string;
  status: string;
  is_finalised: boolean;
  gross_tiyin: number;
  deductions_tiyin: number;
  net_tiyin: number;
  finalised_at: string | null;
  lines?: ApiPayrollLine[];
};

type ApiPayrollLine = {
  staff_member_id: number;
  full_name?: string | null;
  position?: string | null;
  employee_code?: string | null;
  minutes_worked: number;
  hourly_rate: number;
  basic_tiyin: number;
  service_charge_tiyin: number;
  bonus_tiyin: number;
  deductions_tiyin: number;
  net_tiyin: number;
  shifts_count: number;
  late_count: number;
  note: string | null;
};

/**
 * One employee's month, off the payroll run that was signed off.
 *
 * ---------------------------------------------------------------------------
 * The run, not the attendance table
 *
 * This sheet used to be assembled from `GET /staff/attendances` — hours worked
 * times whatever `staff_members.hourly_rate` said TODAY — and that arrangement
 * had a defect an employee finds on payday: a rise granted in September rewrote
 * what August appeared to have paid. `staff.payroll_lines` snapshots the rate at
 * the moment the run was built, so a payslip reprinted a year later is the same
 * document.
 *
 * It also carries the rows attendance never could. Bonus, deductions and the
 * service-charge share are columns on the line now, which is why this sheet is
 * `live` rather than `partial`: what it prints under "Qo'lga tegadi" IS the net
 * rather than a gross wearing a net's label.
 *
 * ---------------------------------------------------------------------------
 * A draft run is still printed, and says so
 *
 * `is_finalised` decides the footnote rather than whether the sheet renders. A
 * manager checking a month before signing it off is exactly who needs to read it
 * — refusing to draw an unfrozen run would leave them nothing to check — and a
 * draft that did not announce itself is how an unsigned figure reaches an
 * employee.
 */
async function payslipFor(
  memberId: string,
  month: string,
  head: Letterhead,
): Promise<PayslipDoc | null> {
  const runs = await apiGet<{ data?: ApiPayrollPeriod[] }>(
    `/staff/payroll?filter[period]=${encodeURIComponent(month)}&per_page=5`,
  );

  const summary = (runs?.data ?? [])[0];

  if (summary === undefined) return null;

  // The list omits the lines on purpose — thirty months of payslips is a
  // thousand rows nobody is looking at — so the run is re-read for its own.
  const run = await apiGet<{ data?: ApiPayrollPeriod }>(`/staff/payroll/${summary.id}`);

  const line = (run?.data?.lines ?? []).find(
    (row) => String(row.staff_member_id) === String(memberId),
  );

  if (line === undefined) return null;

  const hours = Math.round(line.minutes_worked / 60);
  const [year, index] = month.split('-');
  const monthName = MONTH_NAME[Number(index) - 1] ?? month;

  const earned: PayslipRow[] = [
    {
      label: `Asosiy · ${hours} soat × ${money(line.hourly_rate)}`,
      working: `${hours} × ${money(line.hourly_rate)}`,
      amount: line.basic_tiyin,
    },
  ];

  /*
   * The three optional rows, printed only when they carry something.
   *
   * A zero row on a payslip is a claim — "you were paid no bonus this month" —
   * and it is a different claim from "there is no bonus scheme here". The design
   * draws the service-charge share as its own accented line, so it keeps that
   * treatment when there is one.
   */
  if (line.service_charge_tiyin > 0) {
    earned.push({
      label: 'Xizmat haqi ulushi',
      amount: line.service_charge_tiyin,
      tone: 'accent',
    });
  }

  if (line.bonus_tiyin > 0) {
    earned.push({ label: 'Bonus', amount: line.bonus_tiyin });
  }

  const deducted: PayslipRow[] =
    line.deductions_tiyin > 0
      ? [
          {
            label: 'Ushlanmalar',
            // Whatever the person who entered it wrote — an advance, a breakage,
            // income tax. One column and a note, rather than five columns this
            // platform would have to invent values for; see the migration.
            note: line.note ?? undefined,
            amount: line.deductions_tiyin,
            tone: 'danger',
          },
        ]
      : [];

  const gross = line.basic_tiyin + line.service_charge_tiyin + line.bonus_tiyin;
  const frozen = run?.data?.is_finalised === true;

  return {
    title: PAYSLIP.title,
    subtitle: `${year}-yil ${monthName}`,
    venue: head.venue,
    number: `№ MV-${month}-${line.employee_code ?? memberId}`,
    issued: `Berilgan sana: ${dmy(run?.data?.finalised_at ?? new Date().toISOString())}`,
    employee: {
      label: PAYSLIP.employee.label,
      name: line.full_name ?? `#${memberId}`,
      lines: [
        [line.position ?? '', line.employee_code == null ? '' : `tabel № ${line.employee_code}`]
          .filter((part) => part !== '')
          .join(' · '),
        `Soatbay · ${money(line.hourly_rate)} so'm / soat`,
      ].filter((entry) => entry !== ''),
    },
    period: {
      label: PAYSLIP.period.label,
      name: `${dmy(run?.data?.starts_on ?? summary.starts_on)} – ${dmy(run?.data?.ends_on ?? summary.ends_on)}`,
      lines: [
        `Ishlangan: ${hours} soat · ${line.shifts_count} smena`,
        line.late_count === 0 ? "Kechikish yo'q" : `Kechikish: ${line.late_count} marta`,
      ],
    },
    earnedTitle: PAYSLIP.earnedTitle,
    earned,
    earnedTotal: { label: PAYSLIP.earnedTotal.label, amount: gross },
    deductedTitle: PAYSLIP.deductedTitle,
    deducted,
    deductedTotal: { label: PAYSLIP.deductedTotal.label, amount: line.deductions_tiyin },
    netLabel: PAYSLIP.netLabel,
    /*
     * The specimen prints the card the money went to; a live sheet has no idea.
     * `staff.payroll_lines` records what is owed, not how it was sent — the
     * bank's own file format is a contract with a bank rather than a schema —
     * so what goes here is the fact this document DOES know: when the run was
     * signed off, or that it has not been.
     */
    netNote: frozen
      ? `Tasdiqlangan: ${dmy(run?.data?.finalised_at)}`
      : 'Bu hisob hali tasdiqlanmagan — davr yopilmagan',
    net: line.net_tiyin,
    // The specimen signs this off with a named accountant; a live sheet knows
    // only that somebody signed it, so the rule is left for whoever did.
    signatures: ['Xodim imzosi · tanishdim', 'Buxgalter'],
    footnote: frozen
      ? 'Bu varaq tizimdagi tasdiqlangan hisobdan tuzilgan: soat va stavka hisob ' +
        'qilingan paytdagi holatda muzlatilgan, shuning uchun keyingi oylardagi stavka ' +
        "o'zgarishi bu varaqni o'zgartirmaydi."
      : 'Bu varaq HALI TASDIQLANMAGAN hisobdan tuzilgan. Davr yopilgunga qadar ' +
        "summalar o'zgarishi mumkin.",
  };
}

/* ========================================================== 07 profit-loss */

/** One heading of the statement's `expenses` block. */
type ApiExpenseLine = { category: string; amount_tiyin: number; entries: number };

/**
 * One menu category's takings for the month.
 *
 * `name` is `unknown` because the column is jsonb `{uz, ru, en}` and an older
 * row can hold a bare string — see `nameOf()`, which is where that is decided
 * once rather than at every use.
 */
type ApiCategoryLine = { slug: string; name: unknown; revenue_tiyin: number };

type ApiStatement = {
  data?: {
    month: string;
    previous_month: string;
    window: { from: string; to: string };
    vat_percent: number;
    revenue_by_category: ApiCategoryLine[];
    revenue: {
      gross_tiyin: number;
      net_tiyin: number;
      previous_net_tiyin: number;
      discounts_tiyin: number;
      delta_percent: number | null;
    };
    cost_of_sales: { tiyin: number; coverage_percent: number };
    labour: { tiyin: number; previous_tiyin: number };
    expenses: ApiExpenseLine[];
    expenses_total_tiyin: number;
    depreciation_tiyin: number;
    totals: { ebitda_tiyin: number; operating_profit_tiyin: number };
    source: { days: number; expected_days: number; computed_at: string | null };
  };
};

/** `+8.2%` / `−4.5%`, with the design's real minus rather than a hyphen. */
const percent = (value: number | null): string => {
  if (value === null) return '';
  if (value === 0) return '0%';

  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
};

/**
 * The statement for one calendar month.
 *
 * ---------------------------------------------------------------------------
 * A month, and why that took an endpoint of its own
 *
 * This sheet used to be built from `GET /analytics/summary?period=`, whose whole
 * vocabulary is `today | week | month` — and `month` there is the trailing thirty
 * trading days ending today, never "Iyul". A statement is a document with a
 * month's name at the top of it, filed against a month's return and compared
 * against the month before; a trailing window cannot be any of those things.
 * `GET /analytics/profit-loss?month=YYYY-MM` is the answer to exactly that, and
 * it carries the previous month's revenue with it.
 *
 * ---------------------------------------------------------------------------
 * What the sheet now proves, and the two things it still cannot
 *
 * Cost of sales, labour, expenses split by heading and DEPRECIATION are all real
 * — the last of those is the line a fit-out used to be missing, which is why a
 * new kitchen wiped out the month it was bought in.
 *
 * **Loan interest and profit tax are still absent**, and absent rather than
 * zeroed: no loan schedule and no tax computation exists on this platform, and a
 * zero on a signed statement is a claim that there were none.
 *
 * **The comparison column carries one figure**, on the revenue subtotal. The
 * statement can prove last month's revenue and nothing else per line, and a
 * fabricated June column on a sheet with a signature line is the one thing this
 * file will not do.
 *
 * `cogs_coverage_percent` rides along and decides the method note: a gross
 * profit over a partial cost base overstates itself by exactly the share of the
 * menu nobody has costed, which is the number an owner is least able to check.
 */
async function profitLossFor(
  month: string,
  head: Letterhead,
): Promise<{
  statement: ProfitLossDoc;
  rows: readonly PlRow[];
} | null> {
  const answer = await apiGet<ApiStatement>(
    `/analytics/profit-loss?month=${encodeURIComponent(month)}`,
  );

  const figures = answer?.data;

  if (figures === undefined) return null;

  const revenue = figures.revenue.net_tiyin;
  const share = (value: number): string =>
    revenue === 0 ? '' : ((Math.abs(value) / revenue) * 100).toFixed(1);

  const rows: PlRow[] = [
    { kind: 'h', label: 'Tushum', value: 0, share: '', previous: null, delta: '' },
  ];

  /*
   * The revenue rows are the menu's own categories, as a PROPORTION of the
   * month's revenue.
   *
   * The split is read live off the bills while the total comes from a projection
   * that is at most a day old, so the two disagree slightly by construction. A
   * statement whose named rows did not add up to its own subtotal would be the
   * first thing anybody noticed, so the proportion is what is carried across and
   * the subtotal stays the figure every ratio below is measured against.
   */
  const sold = figures.revenue_by_category.reduce((total, row) => total + row.revenue_tiyin, 0);

  let allocated = 0;

  figures.revenue_by_category.forEach((row, index) => {
    const last = index === figures.revenue_by_category.length - 1;
    // The last row takes the remainder, so the rounding of every row before it
    // cannot leave the section a few tiyin short of its own subtotal.
    const value = last
      ? revenue - allocated
      : sold === 0
        ? 0
        : Math.round((row.revenue_tiyin / sold) * revenue);

    allocated += value;

    rows.push({
      kind: 'r',
      label: nameOf(row),
      value,
      share: share(value),
      previous: null,
      delta: '',
    });
  });

  const before = figures.revenue.previous_net_tiyin;

  rows.push({
    kind: 't',
    label: "Jami tushum, QQS'siz",
    value: revenue,
    share: revenue === 0 ? '' : '100.0',
    // A real previous figure, not one recovered from a percentage: the endpoint
    // reads the month before as its own window.
    previous: before === 0 ? null : before,
    delta: percent(figures.revenue.delta_percent),
  });

  /* ---- Cost of sales ---- */
  if (figures.cost_of_sales.tiyin > 0) {
    rows.push({
      kind: 'h',
      label: 'Tannarx',
      value: 0,
      share: '',
      previous: null,
      delta: '',
    });

    rows.push({
      kind: 'r',
      // The coverage is in the label rather than only in the method note,
      // because this is the one row on the sheet whose figure is knowingly
      // incomplete and the reader is looking at the row, not the footnote.
      label: `Mahsulot tannarxi · kalkulyatsiya ${figures.cost_of_sales.coverage_percent}%`,
      value: -figures.cost_of_sales.tiyin,
      share: share(figures.cost_of_sales.tiyin),
      previous: null,
      delta: '',
    });

    rows.push({
      kind: 't',
      label: 'Yalpi foyda',
      value: revenue - figures.cost_of_sales.tiyin,
      share: share(revenue - figures.cost_of_sales.tiyin),
      previous: null,
      delta: '',
    });
  }

  /* ---- Operating cost ---- */
  const operating: { label: string; amount: number }[] = [];

  if (figures.labour.tiyin > 0) {
    operating.push({ label: 'Mehnat haqi', amount: figures.labour.tiyin });
  }

  for (const line of figures.expenses) {
    /*
     * `payroll` is dropped, and this is the one subtraction on the sheet.
     *
     * `labour` above is hours worked × the rate on the record, projected nightly
     * for every venue; a `payroll` expense row is a month's wages somebody typed
     * in as one payment. Printing both would show a restaurant paying its staff
     * twice, on a document that goes to a bank.
     */
    if (line.category === 'payroll') continue;

    operating.push({
      label: EXPENSE_LABEL[line.category] ?? line.category,
      amount: line.amount_tiyin,
    });
  }

  if (figures.depreciation_tiyin > 0) {
    operating.push({ label: 'Amortizatsiya', amount: figures.depreciation_tiyin });
  }

  if (operating.length > 0) {
    rows.push({
      kind: 'h',
      label: 'Operatsion xarajatlar',
      value: 0,
      share: '',
      previous: null,
      delta: '',
    });

    for (const line of operating) {
      rows.push({
        kind: 'r',
        label: line.label,
        value: -line.amount,
        share: share(line.amount),
        previous: null,
        delta: '',
      });
    }

    const total = operating.reduce((sum, line) => sum + line.amount, 0);

    rows.push({
      kind: 't',
      label: 'Jami operatsion xarajat',
      value: -total,
      share: share(total),
      previous: null,
      delta: '',
    });
  }

  rows.push({
    kind: 'f',
    /*
     * "Operatsion foyda", not "Sof foyda".
     *
     * Net profit is revenue less cost of sales, operating cost, depreciation,
     * interest and tax. This sheet can prove the first three and the platform
     * holds neither of the last two, so the row names what it actually is — the
     * same discipline the cost-of-sales label keeps about its own coverage.
     */
    label: 'Operatsion foyda',
    value: figures.totals.operating_profit_tiyin,
    share: share(figures.totals.operating_profit_tiyin),
    previous: null,
    delta: '',
  });

  /* The ratios the statement can prove from its own rows. */
  const ratios: PlRatio[] = [];

  if (revenue > 0 && figures.cost_of_sales.tiyin > 0) {
    const food = (figures.cost_of_sales.tiyin / revenue) * 100;

    ratios.push({
      label: 'Tannarx ulushi',
      value: `${food.toFixed(1)}%`,
      against: food <= 32 ? "me'yor 32%" : "me'yordan yuqori · 32%",
      tone: food <= 32 ? 'good' : 'warn',
    });
  }

  if (revenue > 0 && figures.labour.tiyin > 0) {
    const labour = (figures.labour.tiyin / revenue) * 100;

    ratios.push({
      label: 'Mehnat ulushi',
      value: `${labour.toFixed(1)}%`,
      against: labour <= 28 ? "me'yor 28%" : "me'yordan yuqori · 28%",
      tone: labour <= 28 ? 'good' : 'warn',
    });
  }

  if (revenue > 0) {
    const margin = (figures.totals.ebitda_tiyin / revenue) * 100;

    ratios.push({
      label: 'EBITDA marjasi',
      value: `${margin.toFixed(1)}%`,
      against: margin >= 15 ? "me'yor 15%" : "me'yordan past · 15%",
      tone: margin >= 15 ? 'good' : 'warn',
    });
  }

  const gross = figures.vat_percent;
  const covered = figures.source.days >= figures.source.expected_days;

  return {
    statement: {
      title: PROFIT_LOSS.title,
      subtitle: `${dmy(figures.window.from)} – ${dmy(figures.window.to)} · QQS'siz`,
      venue: head.venue,
      number: `№ PL-${figures.month}`,
      issued: `Tuzilgan: ${dmy(new Date().toISOString())}`,
      columns: PROFIT_LOSS.columns,
      ratios,
      method: {
        lead: 'Metodika.',
        body:
          `Tushum QQS'siz ko'rsatilgan (Q1: jami / ${(1 + gross / 100).toFixed(2)}). ` +
          `Tannarx menyuning kalkulyatsiya qilingan ${figures.cost_of_sales.coverage_percent}% ` +
          'qismidan hisoblangan, shuning uchun yalpi foyda haqiqiydan yuqori chiqadi. ' +
          "Kredit foizi va foyda solig'i tizimda saqlanmaydi va bu varaqda yo'q. " +
          'Solishtirish ustuni faqat jami tushum uchun bor — modul boshqa qatorlar uchun ' +
          "o'tgan davrni bermaydi." +
          (covered
            ? ''
            : ` Diqqat: oyning ${figures.source.expected_days} kunidan ` +
              `${figures.source.days} tasi hisoblangan.`),
      },
      signatures: PROFIT_LOSS.signatures,
    },
    rows,
  };
}

/**
 * A menu category's name in the sheet's own language.
 *
 * The column is jsonb `{uz, ru, en}` and this surface prints Uzbek — every
 * document in this folder does, because a printed sheet leaves the building in
 * the language the restaurant files in. A category whose name came back as a
 * bare string (an older row, or a restaurant that never translated it) is used
 * as it stands rather than dropped.
 */
function nameOf(row: ApiCategoryLine): string {
  const name = row.name;

  if (typeof name === 'string') return name;

  if (name !== null && typeof name === 'object') {
    const map = name as Record<string, unknown>;
    const uz = map.uz ?? map.en ?? map.ru;

    if (typeof uz === 'string') return uz;
  }

  return row.slug;
}

/* ================================================================ dispatch */

/**
 * The document this request is for, live where it can be and the specimen where
 * it cannot.
 *
 * One `await` for the whole page rather than a fetch inside each component: the
 * chrome has to say whether what follows is real *before* it draws it, and a
 * banner that appeared after the sheet would be a banner nobody read.
 */
export async function loadDocument(key: DocumentKey, params: QueryParams): Promise<LoadedDocument> {
  const specimen = (): LoadedDocument => specimenFor(key);

  if (key === 'index') return { key: 'index', source: 'specimen' };

  /*
   * The receipts sheet is the one that takes two subjects, and they are
   * independent: `?bill=` makes the guest's strip real, `?ticket=` the kitchen's.
   * A manager checking a docket has no bill to name, and a cashier reprinting a
   * receipt has no docket.
   */
  if (key === 'receipts') {
    const billAsked = one(params.bill);
    const ticketAsked = one(params.ticket);

    if (billAsked === null && ticketAsked === null) return specimen();

    const head = await letterhead();
    const [receipt, ticket] = await Promise.all([
      billAsked === null ? Promise.resolve(null) : receiptFor(billAsked, head),
      ticketAsked === null ? Promise.resolve(null) : ticketFor(ticketAsked),
    ]);

    if (receipt === null && ticket === null) return specimen();

    return {
      key: 'receipts',
      // Anything short of both strips, behind a complete letterhead, is partial
      // rather than live — the other half of the sheet is still the specimen.
      source: receipt !== null && ticket !== null && head.complete ? 'live' : 'partial',
      receipt: receipt ?? CUSTOMER_RECEIPT,
      ticket: ticket ?? KITCHEN_TICKET,
    };
  }

  const asked = one(params[LIVE_PARAM[key] ?? '']);

  // No subject is the specimen, and that is the common case: the switcher's own
  // links carry no parameter, so a reader browsing the folder sees the design's
  // sheets, and only an entry point from the till, the ledger or the store room
  // arrives naming one.
  if (asked === null) return specimen();

  /*
   * Before the letterhead, because the count sheet does not carry one — and the
   * storekeeper who prints it is one of the two roles without `settings.view`,
   * so asking would be two requests that are guaranteed to come back 403.
   */
  if (key === 'stock-count') {
    const sheet = await stockCountFor(asked);

    return sheet === null ? specimen() : { key: 'stock-count', source: 'live', sheet };
  }

  const head = await letterhead();

  switch (key) {
    case 'z': {
      const report = await zReportFor(asked, head);

      return report === null
        ? specimen()
        : { key: 'z', source: head.named ? 'live' : 'partial', report };
    }

    case 'invoice': {
      const invoice = await invoiceFor(asked, head);

      return invoice === null
        ? specimen()
        : { key: 'invoice', source: head.complete ? 'live' : 'partial', invoice };
    }

    case 'payslip': {
      const payslip = await payslipFor(asked, monthOf(one(params.month)), head);

      /*
       * Live now: `staff.payroll_lines` holds the bonus, the deductions and the
       * service-charge share, so what this sheet prints under "Qo'lga tegadi" is
       * the net rather than a gross wearing a net's label — which is the error
       * an employee finds on payday.
       *
       * A DRAFT run still renders and still says so, in its own footnote rather
       * than through the surface's banner: a manager checking a month before
       * signing it off is exactly who needs to read it.
       */
      return payslip === null
        ? specimen()
        : { key: 'payslip', source: head.named ? 'live' : 'partial', payslip };
    }

    case 'profit-loss': {
      /*
       * The parameter goes up unchecked, deliberately.
       *
       * `monthOf()` would answer THIS month for anything malformed, and a
       * statement for a month that is still running is a half-empty sheet with a
       * signature line on it. The endpoint validates the shape itself and falls
       * back to the month that FINISHED, which is the one a P&L is read about —
       * and the sheet is headed with the window the server answered rather than
       * the one that was asked for.
       */
      const statement = await profitLossFor(asked, head);

      /*
       * `partial` only because of the letterhead, which is the same rule the Z
       * report follows: a statement that cannot name the restaurant it is about
       * is not a document anybody can file. The FIGURES are whole now — cost of
       * sales, labour, expenses by heading and depreciation — and what is
       * missing (loan interest, profit tax) is missing from the platform rather
       * than from this read, so it is stated in the method note instead of
       * marking the sheet.
       */
      return statement === null
        ? specimen()
        : { key: 'profit-loss', source: head.named ? 'live' : 'partial', ...statement };
    }
  }
}

/** The design's own sheet, which is what this surface draws by default. */
export function specimenFor(key: DocumentKey): LoadedDocument {
  switch (key) {
    case 'index':
      return { key: 'index', source: 'specimen' };
    case 'receipts':
      return {
        key: 'receipts',
        source: 'specimen',
        receipt: CUSTOMER_RECEIPT,
        ticket: KITCHEN_TICKET,
      };
    case 'z':
      return { key: 'z', source: 'specimen', report: Z_REPORT };
    case 'invoice':
      return { key: 'invoice', source: 'specimen', invoice: INVOICE };
    case 'stock-count':
      return { key: 'stock-count', source: 'specimen', sheet: STOCK_COUNT };
    case 'payslip':
      return { key: 'payslip', source: 'specimen', payslip: PAYSLIP };
    case 'profit-loss':
      return { key: 'profit-loss', source: 'specimen', statement: PROFIT_LOSS, rows: PL_ROWS };
  }
}

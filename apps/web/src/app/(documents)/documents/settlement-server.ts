import { apiGet } from '@/lib/api-server';

/**
 * One marketplace statement, for the sheet that prints it.
 *
 * Its own module rather than a case inside `documents-server.ts`, and the
 * reason is not tidiness. The seven documents that file loads are all a
 * restaurant's own paper — a Z report, a payslip, a count sheet — read from the
 * modules the restaurant already owns. A settlement is the *platform's*
 * statement ABOUT that restaurant: it comes from `Modules/Marketplace`, it is
 * addressed outward, and it exists only for storefronts on the market. Bolting
 * an eighth key onto `DOCUMENT_ORDER` would put it in the switcher of every
 * accountant who has never sold a dish through MyPOS.
 *
 * So `?d=settlement&id=…` is a branch of its own on the page, and this is its
 * loader. Nothing here touches `documents-data.ts` or `documents-server.ts`.
 *
 * ---------------------------------------------------------------------------
 * `null` is the only failure, and it prints nothing
 *
 * Unlike every other document on this surface there is no specimen to fall back
 * to, and that is deliberate rather than unfinished. A Z report specimen
 * teaches a cashier what the paper looks like; a specimen SETTLEMENT is an
 * invoice for money nobody owes, and a merchant who printed one and sent it to
 * their accountant would be sending a fiction with a real letterhead on it.
 */

/** `GET /api/v1/marketplace/settlements/{settlement}` — the statement half. */
type ApiStatementLine = {
  label: { uz: string; ru: string; en: string };
  count: number;
  amount_tiyin: number;
};

type ApiStatement = {
  invoice_number: string;
  issued_on: string;
  period_start: string;
  period_end: string;
  store: { name: string; slug: string };
  tenant: { name: string; inn: string | null };
  lines: readonly ApiStatementLine[];
  gross_tiyin: number;
  commission_tiyin: number;
  adjustments_tiyin: number;
  payable_tiyin: number;
  payout: {
    bank_name: string | null;
    mfo: string | null;
    account_last4: string | null;
    inn: string | null;
    holder: string | null;
    state: string;
  } | null;
};

type ApiSettlementDetail = {
  id: number;
  state: string;
  orders: readonly {
    id: number;
    number: string;
    delivered_at: string | null;
    total_tiyin: number;
    subtotal_tiyin: number;
    commission_tiyin: number;
    merchant_due_tiyin: number;
  }[];
  placements: readonly { id: number; slot: string; days: number; total_tiyin: number }[];
  statement: ApiStatement;
};

/** One line of the summary block — a count and an amount under a name. */
export type StatementLine = { label: string; count: number; amount: number };

/** One order, as the schedule of deliveries prints it. */
export type StatementOrder = {
  number: string;
  /** Already formatted for print: the paper is Uzbek and so is the date. */
  delivered: string;
  gross: number;
  commission: number;
  due: number;
};

export type StatementDoc = {
  invoiceNumber: string;
  issuedOn: string;
  period: string;
  storeName: string;
  tenantName: string;
  tenantInn: string;
  lines: readonly StatementLine[];
  orders: readonly StatementOrder[];
  placements: readonly { label: string; days: number; amount: number }[];
  /** Tiyin, every one of them. */
  gross: number;
  commission: number;
  adjustments: number;
  payable: number;
  bank: { name: string; mfo: string; accountLast4: string; inn: string; holder: string } | null;
  /** Whether the platform has confirmed the account this pays into. */
  bankVerified: boolean;
  /** `paid` prints a settled stamp; anything else is still owed. */
  paid: boolean;
};

/** The two placements the platform sells, as a printed line reads. */
const SLOT_LABEL: Readonly<Record<string, string>> = {
  home_top: 'Bosh sahifa lentasi',
  category_top: 'Qidiruvda yuqorida',
};

/**
 * A date as this paper writes one: `15.08.2026`.
 *
 * Written out rather than handed to `Intl`, and for the same reason
 * `documents-data.ts` pins the thousands separator: the sheet an accountant
 * signs must not come off the printer differently depending on who pressed the
 * button — and with `Intl` it would depend on something worse than that. The
 * `uz-UZ` pattern is `10/08/2026` in one ICU build and `10.08.2026` in another,
 * so a Node upgrade on the server would silently change the format of every
 * statement ever printed. The design's own documents use dots (`:617`, `:716`).
 *
 * An unparseable value prints an em dash rather than "Invalid Date", which is a
 * thing no accountant should ever be handed.
 */
function printedDate(value: string | null): string {
  if (value === null) return '—';

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) return '—';

  const day = new Date(parsed);
  const pad = (part: number) => String(part).padStart(2, '0');

  /*
   * UTC parts, not local ones. The API sends `2026-08-16` for the period and an
   * ISO instant for a delivery; read in a browser five hours behind, an order
   * delivered at 02:00 would print on the day before and fall outside the week
   * the statement claims to cover.
   */
  return `${pad(day.getUTCDate())}.${pad(day.getUTCMonth() + 1)}.${day.getUTCFullYear()}`;
}

export function statementFrom(row: ApiSettlementDetail): StatementDoc {
  const statement = row.statement;
  const payout = statement.payout;

  return {
    invoiceNumber: statement.invoice_number,
    issuedOn: printedDate(statement.issued_on),
    period: `${printedDate(statement.period_start)} — ${printedDate(statement.period_end)}`,
    storeName: statement.store.name,
    tenantName: statement.tenant.name,
    tenantInn: statement.tenant.inn ?? '—',
    /*
     * The summary lines come down in three languages and print in one. Uzbek,
     * like every other word on this paper — it is a document of one
     * jurisdiction rather than a UI string, which is the rule the whole surface
     * follows (`documents-data.ts` says it at the top).
     */
    lines: statement.lines.map((line) => ({
      label: line.label.uz,
      count: line.count,
      amount: line.amount_tiyin,
    })),
    orders: row.orders.map((order) => ({
      number: order.number,
      delivered: printedDate(order.delivered_at),
      gross: order.total_tiyin,
      commission: order.commission_tiyin,
      due: order.merchant_due_tiyin,
    })),
    placements: row.placements.map((placement) => ({
      label: SLOT_LABEL[placement.slot] ?? placement.slot,
      days: placement.days,
      amount: placement.total_tiyin,
    })),
    gross: statement.gross_tiyin,
    commission: statement.commission_tiyin,
    adjustments: statement.adjustments_tiyin,
    payable: statement.payable_tiyin,
    bank:
      payout === null || payout.bank_name === null
        ? null
        : {
            name: payout.bank_name,
            mfo: payout.mfo ?? '—',
            // The last four on paper too. A printed statement is left on desks,
            // photographed and emailed; twenty digits on it are twenty digits
            // in somebody's inbox.
            accountLast4: payout.account_last4 ?? '',
            inn: payout.inn ?? '—',
            holder: payout.holder ?? '—',
          },
    bankVerified: payout?.state === 'verified',
    paid: row.state === 'paid',
  };
}

/**
 * Load one statement, or `null`.
 *
 * The read goes out on the reader's own console token, so the API is the last
 * of three guards rather than something this module re-implements:
 * `middleware.ts` decides who reaches the surface, `documents-access.ts`
 * decides who may ask for a settlement at all, and the policy upstream decides
 * whether this statement belongs to their restaurant. A merchant editing the
 * id in the address bar gets a 403 and therefore `null`.
 */
export async function loadSettlement(id: number): Promise<StatementDoc | null> {
  const answer = await apiGet<{ data: ApiSettlementDetail }>(`/marketplace/settlements/${id}`);

  return answer?.data?.statement === undefined ? null : statementFrom(answer.data);
}

/** `?id=` as a positive whole number, or `null` — a printed document needs one. */
export function settlementIdFrom(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (raw === undefined || !/^\d+$/.test(raw)) return null;

  const id = Number(raw);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

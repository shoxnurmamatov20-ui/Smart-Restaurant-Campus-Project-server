import type { RoleId } from '@/lib/roles';

import { DOCUMENT_ORDER, type DocumentKey } from './documents-data';

/**
 * Who may print which document.
 *
 * `specs/02-documents.md §7` names it in four sentences: *"Cashier prints
 * receipts, X and Z. Manager prints daily closing. Accountant prints invoices
 * and P&L. Warehouse prints count sheets."* Short, and every clause matters —
 * these seven sheets carry a restaurant's turnover, a supplier's prices and a
 * named employee's pay, and until now the surface asked nobody who they were.
 *
 * The surface itself is guarded by `SURFACE_ACCESS.documents`, which is the
 * union of the lists below; this table is the second, finer cut, because a
 * warehouseman who may print a count sheet must still not be able to read a
 * colleague's payslip by editing `?d=`.
 *
 * **Owner holds all seven** — the same reading as their 100% discount ceiling
 * and their twenty-four sidebar rows: the business is theirs, so no figure in
 * it is hidden from them.
 *
 * **Waiter, chef, operator and the platform operator hold none**, so they never
 * reach the surface at all. A waiter has no document in the design's list; the
 * platform operator has no restaurant to print one about.
 */
export const DOCUMENT_ACCESS: Readonly<Record<DocumentKey, readonly RoleId[]>> = {
  /*
   * The contents sheet. Not "everyone": it lists the six documents and links to
   * them, so a role that holds none of them would be reading a menu of things
   * they cannot open. The list below is the union, and `documentsFor()` is what
   * keeps the cards themselves down to the reader's own.
   */
  index: ['owner', 'manager', 'accountant', 'cashier', 'warehouse'],

  // "Cashier prints receipts, X and Z." The manager is here because §7's last
  // line — *"reprint requires manager approval"* — makes them the approver, and
  // an approver who cannot see the document approves blind.
  receipts: ['owner', 'manager', 'cashier'],
  z: ['owner', 'manager', 'cashier'],

  // "Accountant prints invoices and P&L." The payslip joins them: it is payroll,
  // which is the ledger's, and it is the one document naming a person's pay.
  invoice: ['owner', 'accountant'],
  payslip: ['owner', 'accountant'],
  'profit-loss': ['owner', 'accountant'],

  // "Warehouse prints count sheets." Only they, and deliberately not the
  // manager: the sheet is printed empty precisely so the person counting is not
  // the person who already knows what the number should be.
  'stock-count': ['owner', 'warehouse'],
};

/**
 * The eighth sheet, which is not one of the seven.
 *
 * `?d=settlement` prints the marketplace's statement about this restaurant, and
 * it is deliberately outside `DOCUMENT_ACCESS`: that table is keyed by
 * `DocumentKey`, which is the design file's seven, and adding an eighth would
 * put a settlement tab in the switcher of every accountant whose restaurant has
 * never sold a dish through MyPOS. It is reached only from the merchant panel's
 * own payout screen, by link.
 *
 * The rule above still applies, and this is the same cut it makes for the other
 * money documents. `invoice` and `profit-loss` are owner and accountant; a
 * settlement is the same kind of paper — it is quoted at a bank and handed to a
 * bookkeeper — so it is the same two.
 *
 * **There is no `merchant` role to name.** The merchant panel has no role of
 * its own on this platform; it is operated on the owner's console session
 * against `marketplace.*` permissions, which is why the owner is the merchant
 * here. The accountant joins them for the reason they hold the invoice: they
 * are the person who reconciles the payout against the bank statement.
 *
 * Both are already inside `SURFACE_ACCESS.documents`, so this narrows the
 * surface's gate rather than widening it — which is the only direction a
 * second gate is ever allowed to move.
 */
export const SETTLEMENT_ACCESS: readonly RoleId[] = ['owner', 'accountant'];

/** Whether this role may open a marketplace settlement statement. */
export const maySettlement = (role: RoleId): boolean => SETTLEMENT_ACCESS.includes(role);

/**
 * The ninth sheet, which is not one of the seven either.
 *
 * `?d=report&kind=…&period=…` prints a standard report — the console's own
 * analytics table on A4 — and it stands outside `DOCUMENT_ACCESS` for exactly
 * the reason the settlement does: that table is keyed by `DocumentKey`, which
 * is the design file's seven, and a ninth key would put a "Hisobot" tab in the
 * switcher of every reader on the surface. It is reached only by link, from the
 * export dialog's PDF button.
 *
 * **Whoever may read analytics, and nobody else.** A standard report is the
 * whole estate's turnover, margin and voids — the same material the console
 * guards behind `analytics.view`, which the seeder gives to the owner, the
 * managers and the accountant. The cashier and the storekeeper reach this
 * surface for their own paper and have no business with the takings: a cashier
 * prints the Z of the shift they stood through, which is their own drawer, and
 * a storekeeper counts shelves. Neither is a reason to hand them every waiter's
 * sales beside their own.
 *
 * Both cuts above the API still apply and the API is still the last one — the
 * read goes out on the reader's own token, so a role added here by mistake gets
 * a 403 rather than somebody else's revenue. This list is the door, not the
 * lock.
 *
 * All three are already inside `SURFACE_ACCESS.documents`, so this narrows the
 * surface's gate rather than widening it — the only direction a second gate is
 * ever allowed to move.
 */
export const REPORT_ACCESS: readonly RoleId[] = ['owner', 'manager', 'accountant'];

/** Whether this role may open a printable standard report. */
export const mayReport = (role: RoleId): boolean => REPORT_ACCESS.includes(role);

/** The documents this role may open, in the design's order. */
export const documentsFor = (role: RoleId): readonly DocumentKey[] =>
  DOCUMENT_ORDER.filter((key) => DOCUMENT_ACCESS[key].includes(role));

/** Whether this role may open this one. */
export const mayOpen = (role: RoleId, key: DocumentKey): boolean =>
  DOCUMENT_ACCESS[key].includes(role);

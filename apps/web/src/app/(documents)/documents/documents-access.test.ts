import { describe, expect, it } from 'vitest';

import { ROLE_IDS, SURFACE_ACCESS, type RoleId } from '@/lib/roles';

import {
  DOCUMENT_ACCESS,
  documentsFor,
  mayOpen,
  mayReport,
  REPORT_ACCESS,
} from './documents-access';
import { DOCUMENT_ORDER, type DocumentKey } from './documents-data';

/**
 * `specs/02-documents.md §7`, asserted rather than trusted.
 *
 * Two guards stand between a reader and these seven sheets, and they guard
 * different things. `middleware.ts` decides who reaches `/documents` — that end
 * is held by `middleware.test.ts`. It cannot decide *which* document, because
 * the document is not in the path: it is `?d=`, a query parameter, which the
 * matcher never sees. So the second cut lives in the page, and this is what
 * says it is still there.
 *
 * The failure it exists for is quiet in the usual way. Nothing errors when a
 * role is added to a list — a warehouseman who could open `?d=payslip` sees a
 * page that renders perfectly, with a named colleague's pay on it.
 */

/**
 * §7's four sentences, transcribed word for word.
 *
 * Note what it does *not* say: the payslip is in none of the four clauses, and
 * §7 is the only place the handoff assigns these documents at all. An
 * unassigned document is the dangerous kind — it is the one naming a person's
 * pay — so the build assigns it rather than leaving it open, and `EXTRA` below
 * is where that decision is written down instead of being folded into this
 * table where it would read as something the spec said.
 */
const SPEC: Readonly<Record<string, readonly DocumentKey[]>> = {
  cashier: ['receipts', 'z'],
  accountant: ['invoice', 'profit-loss'],
  warehouse: ['stock-count'],
};

/**
 * Where the build goes past §7, and why.
 *
 * Two entries, both narrowing rather than widening: each gives a document to
 * the smallest role that must have it, and neither hands anyone a sheet §7
 * would have kept from them.
 */
const EXTRA: Readonly<Record<string, readonly DocumentKey[]>> = {
  /*
   * The payslip. §7 assigns it to nobody; it is payroll, payroll is the ledger,
   * and the ledger is the accountant's — the same reasoning that puts the
   * invoice and the P&L in their hands two clauses earlier.
   */
  accountant: ['payslip'],
  /*
   * §7 gives the manager the daily closing — the Z — and its last line makes
   * them the approver of every reprint. An approver who cannot open the
   * document approves blind, so the receipt comes with it.
   */
  manager: ['receipts', 'z'],
};

describe('the spec is what is implemented', () => {
  it.each(Object.entries(SPEC))('%s prints everything §7 names', (role, expected) => {
    const held = documentsFor(role as RoleId);

    for (const key of expected) {
      expect(held, `§7 gives ${role} the ${key}`).toContain(key);
    }
  });

  it.each(Object.entries(SPEC))('%s prints nothing beyond §7 and EXTRA', (role, expected) => {
    const allowed = new Set<DocumentKey>([...expected, ...(EXTRA[role] ?? [])]);
    const held = documentsFor(role as RoleId).filter((key) => key !== 'index');

    expect([...held].sort()).toEqual([...allowed].sort());
  });

  it('the manager does not hold the payslip', () => {
    // The one line worth pinning on its own: a manager is the reprint approver
    // for the till's documents, not a reader of a named colleague's pay.
    expect(mayOpen('manager', 'payslip')).toBe(false);
    expect(mayOpen('accountant', 'payslip')).toBe(true);
  });

  it('the owner holds all seven', () => {
    // The same reading as their 100% ceiling and their twenty-four rows.
    expect(documentsFor('owner')).toEqual(DOCUMENT_ORDER);
  });

  it('four roles hold none, and so never reach the surface', () => {
    for (const role of ['waiter', 'kitchen', 'operator', 'super'] as const) {
      expect(documentsFor(role), `${role} holds a document`).toEqual([]);
      expect(
        (SURFACE_ACCESS.documents as readonly string[]).includes(role),
        `${role} can reach /documents`,
      ).toBe(false);
    }
  });
});

describe('the two guards agree', () => {
  it('the surface list is exactly the union of the document lists', () => {
    /*
     * Drift either way is a defect. A role on the surface that holds no
     * document lands on a contents sheet with nothing in it; a role holding a
     * document but off the surface is redirected before they can print the
     * thing they are entitled to — and both look like a bug in the page rather
     * than a mistake in a list.
     */
    const union = new Set(ROLE_IDS.filter((role) => documentsFor(role).length > 0));

    expect([...union].sort()).toEqual([...SURFACE_ACCESS.documents].sort());
  });

  it('the contents sheet is offered to everyone who holds anything', () => {
    for (const role of ROLE_IDS) {
      const holdsSomething = DOCUMENT_ORDER.filter((key) => key !== 'index').some((key) =>
        mayOpen(role, key),
      );

      expect(mayOpen(role, 'index'), `index is wrong for ${role}`).toBe(holdsSomething);
    }
  });

  it('names every document, so a new one cannot default to open', () => {
    // The table is keyed by `DocumentKey`, so an eighth document is a type
    // error rather than an eighth sheet nobody guarded.
    expect(Object.keys(DOCUMENT_ACCESS).sort()).toEqual([...DOCUMENT_ORDER].sort());
  });

  it('never names a role that does not exist', () => {
    for (const [key, roles] of Object.entries(DOCUMENT_ACCESS)) {
      for (const role of roles) {
        expect(ROLE_IDS, `${key} names "${role}"`).toContain(role);
      }
    }
  });
});

/**
 * `?d=report` — the ninth sheet, and not one of the seven.
 *
 * It prints a standard report on A4 and it is reached only by link, from the
 * export dialog's PDF button. That makes it exactly the shape of thing the
 * settlement already is: outside `DOCUMENT_ACCESS`, because that table is keyed
 * by `DocumentKey` and a ninth key would put a report tab in the switcher of
 * every reader on the surface.
 *
 * The failure this guards is the one every list here guards, and it is quiet:
 * nothing errors when a role is added. A cashier who could open `?d=report`
 * sees a page that renders perfectly, with every waiter's takings on it.
 */
describe('the printable standard report', () => {
  it('is held by whoever may read analytics, and by nobody else', () => {
    // Turnover, margin and voids across the whole estate — the same material
    // `analytics.view` guards, which the seeder gives to these three.
    expect([...REPORT_ACCESS].sort()).toEqual(['accountant', 'manager', 'owner']);
  });

  it('is not held by the two roles who reach the surface for their own paper', () => {
    /*
     * A cashier prints the Z of the shift they stood through and a storekeeper
     * counts shelves. Both are on `/documents` for that, and neither is a
     * reason to hand them the restaurant's takings.
     */
    expect(mayReport('cashier')).toBe(false);
    expect(mayReport('warehouse')).toBe(false);
  });

  it('narrows the surface gate rather than widening it', () => {
    // The only direction a second gate is ever allowed to move: everyone named
    // here already reaches `/documents`, or middleware would redirect them
    // before this list was ever consulted.
    for (const role of REPORT_ACCESS) {
      expect(
        (SURFACE_ACCESS.documents as readonly string[]).includes(role),
        `${role} cannot reach /documents`,
      ).toBe(true);
    }
  });

  it('never names a role that does not exist', () => {
    for (const role of REPORT_ACCESS) {
      expect(ROLE_IDS, `REPORT_ACCESS names "${role}"`).toContain(role);
    }
  });

  it('is not one of the seven', () => {
    // If it ever becomes a `DocumentKey`, the switcher grows a tab and this
    // list stops being the thing that guards it.
    expect(DOCUMENT_ORDER as readonly string[]).not.toContain('report');
    expect(Object.keys(DOCUMENT_ACCESS)).not.toContain('report');
  });
});

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { landingPath, ROLE_IDS, ROLES, SURFACE_ACCESS, type RoleId } from './roles';

/**
 * Nine roles, and the whole job each of them has to be able to finish.
 *
 * `START-HERE.md §5` is unusually direct about this: *"Do not consider a role
 * done until its whole flow runs end to end."* It then lists the flow, in order,
 * for every one of the nine. That list is a specification, and until now nothing
 * checked it — a role could have every sidebar row the design gives it and still
 * be missing the one screen that finishes its day.
 *
 * So each step below is transcribed from that section and paired with the file
 * that answers for it. The test asserts three things, and the third is the one
 * that catches a regression nobody would notice:
 *
 *   1. Every step has a screen on disk.
 *   2. Every role lands somewhere that exists.
 *   3. Every step is *reachable by that role* — either a sidebar row their nav
 *      allowlist contains, or a full-bleed surface `SURFACE_ACCESS` grants them.
 *      A screen a role cannot navigate to is a screen that role does not have.
 *
 * What this is not: a check that the screens are finished. It is a check that
 * the path exists, which is the thing that silently breaks when a route is
 * renamed or a nav allowlist is edited.
 */

type Step = {
  /** The words `START-HERE §5` uses, so a reader can find the line. */
  readonly does: string;
  /** The route file. */
  readonly file: string;
  /**
   * How this role gets there: a `ModuleKey` from their sidebar allowlist, or a
   * surface key from `SURFACE_ACCESS`. `null` for a screen that is reached from
   * inside another one rather than from navigation — a sheet, a drawer, a step
   * in a wizard.
   */
  readonly via: string | null;
};

const FLOWS: Readonly<Record<RoleId, readonly Step[]>> = {
  waiter: [
    { does: 'pick table', file: 'src/app/(pos)/pos/page.tsx', via: 'pos' },
    { does: 'items and modifiers', file: 'src/app/(pos)/pos/modifier-sheet.tsx', via: null },
    { does: 'fire to the kitchen', file: 'src/app/(pos)/pos/order-screen.tsx', via: null },
    { does: 'split, transfer, discount', file: 'src/app/(pos)/pos/bill-actions.tsx', via: null },
    { does: 'pay', file: 'src/app/(pos)/pos/pay-sheet.tsx', via: null },
    { does: 'their own tables', file: 'src/app/(dashboard)/tables/page.tsx', via: 'tables' },
  ],
  cashier: [
    { does: 'open the till', file: 'src/app/(pos)/pos/open-till.tsx', via: null },
    { does: 'take cash and card', file: 'src/app/(pos)/pos/pay-sheet.tsx', via: null },
    {
      does: 'X report, count, Z report',
      file: 'src/app/(dashboard)/finance/till/till-reports.tsx',
      via: null,
    },
    {
      does: 'the till screen itself',
      file: 'src/app/(dashboard)/finance/till/page.tsx',
      via: 'till',
    },
  ],
  kitchen: [
    {
      does: 'new → accept → cooking → ready',
      file: 'src/app/(kds)/kitchen/kds-board.tsx',
      via: null,
    },
    { does: 'the board', file: 'src/app/(kds)/kitchen/page.tsx', via: 'kitchen' },
    { does: 'toggle the stop list', file: 'src/app/(kds)/kitchen/stop-sheet.tsx', via: null },
  ],
  warehouse: [
    { does: 'stock on hand', file: 'src/app/(dashboard)/inventory/page.tsx', via: 'inventory' },
    {
      does: 'receive, count, waste, transfer',
      file: 'src/app/(dashboard)/inventory/operations/page.tsx',
      via: 'stockOps',
    },
    {
      does: 'receive against a purchase order',
      file: 'src/app/(dashboard)/suppliers/page.tsx',
      via: 'suppliers',
    },
    {
      does: 'the same jobs on a phone',
      file: 'src/app/(staff)/crew/[role]/[tab]/page.tsx',
      via: 'crew',
    },
  ],
  manager: [
    { does: 'approval queue', file: 'src/app/(staff)/crew/[role]/queue/page.tsx', via: 'crew' },
    { does: 'rota', file: 'src/app/(dashboard)/staff/shifts/page.tsx', via: 'shifts' },
    { does: 'shift close', file: 'src/app/(dashboard)/finance/till/page.tsx', via: 'till' },
    {
      does: 'loss prevention',
      file: 'src/app/(dashboard)/analytics/control/page.tsx',
      via: 'control',
    },
  ],
  accountant: [
    {
      does: 'expense, payable, payroll, close',
      file: 'src/app/(dashboard)/finance/books/page.tsx',
      via: 'books',
    },
    { does: 'reconciliation', file: 'src/app/(dashboard)/finance/page.tsx', via: 'finance' },
    { does: 'export', file: 'src/app/(dashboard)/export-dialog.tsx', via: null },
  ],
  owner: [
    { does: 'dashboard', file: 'src/app/(dashboard)/dashboard/page.tsx', via: 'dashboard' },
    {
      does: 'branch comparison and targets',
      file: 'src/app/(dashboard)/settings/branches/page.tsx',
      via: 'branches',
    },
    { does: 'complaints', file: 'src/app/(dashboard)/crm/cases/page.tsx', via: 'cases' },
    { does: 'report', file: 'src/app/(dashboard)/analytics/reports/page.tsx', via: 'reports' },
  ],
  operator: [
    { does: 'the intake queue', file: 'src/app/(dashboard)/calls/page.tsx', via: 'calls' },
    { does: 'price an order', file: 'src/app/(dashboard)/menu/page.tsx', via: 'menu' },
    { does: 'know who is calling', file: 'src/app/(dashboard)/crm/page.tsx', via: 'crm' },
    { does: 'take the complaint', file: 'src/app/(dashboard)/crm/cases/page.tsx', via: 'cases' },
  ],
  super: [
    { does: 'create a tenant', file: 'src/app/(platform)/platform/tenants/page.tsx', via: 'super' },
    { does: 'plan', file: 'src/app/(platform)/platform/plans/page.tsx', via: 'super' },
    { does: 'invoice', file: 'src/app/(platform)/platform/billing/page.tsx', via: 'super' },
    { does: 'terminal', file: 'src/app/(platform)/platform/terminals/page.tsx', via: 'super' },
    {
      does: 'impersonate, with an audit trail',
      file: 'src/app/(platform)/platform/sign-ins/page.tsx',
      via: 'super',
    },
  ],
};

describe('the nine roles', () => {
  it('are all covered', () => {
    // A role added to `roles.ts` without a flow here is a role nobody has
    // walked end to end, which is the exact thing §5 asks for.
    expect(Object.keys(FLOWS).sort()).toEqual([...ROLE_IDS].sort());
  });

  it('each land on a screen that exists', () => {
    for (const id of ROLE_IDS) {
      const path = landingPath(ROLES[id]);
      const candidates = [
        `src/app${path}/page.tsx`,
        `src/app/(dashboard)${path}/page.tsx`,
        `src/app/(platform)${path}/page.tsx`,
        `src/app/(kds)${path}/page.tsx`,
      ];

      expect(
        candidates.some((file) => existsSync(join(process.cwd(), file))),
        `${id} lands on ${path}, which has no page`,
      ).toBe(true);
    }
  });
});

describe.each(ROLE_IDS)('%s', (id) => {
  const role = ROLES[id];

  it.each(FLOWS[id].map((step) => [step.does, step] as const))('can %s', (_does, step) => {
    expect(existsSync(join(process.cwd(), step.file)), `${step.file} is missing`).toBe(true);
  });

  it('can reach every step it navigates to', () => {
    const unreachable = FLOWS[id]
      .filter((step) => step.via !== null)
      .filter((step) => {
        const via = step.via!;

        // A sidebar row: it has to be on this role's allowlist.
        if ((role.nav as readonly string[]).includes(via)) return false;

        // Or a full-bleed surface: `SURFACE_ACCESS` has to name this role.
        const surface = SURFACE_ACCESS[via as keyof typeof SURFACE_ACCESS];

        return !(surface as readonly string[] | undefined)?.includes(id);
      })
      .map((step) => `${step.does} (via ${step.via!})`);

    expect(unreachable, `${id} cannot navigate to these`).toEqual([]);
  });
});

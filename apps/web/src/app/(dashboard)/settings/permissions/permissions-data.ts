import type { Messages } from '@/i18n';

/**
 * Who may do what.
 *
 * The matrix mirrors the Spatie permission set the API defines — every module
 * grants `{module}.{action}` and every route sits behind one — so this screen
 * is a view of the real thing rather than a second source of truth.
 *
 * Reading is live: the sibling `permissions-server.ts` asks
 * `GET /api/v1/roles` — which answers what each role holds in THIS restaurant,
 * its withheld permissions and its discount ceiling — and translates it into
 * the design's twenty-three actions. What is below is the fallback that renders
 * when there is no session or the API is down, and it is deliberately the whole
 * matrix rather than per-cell: a grid that is half real and half demo is the
 * worst possible thing to put in front of somebody deciding who may issue a
 * refund, because nothing on it says which half is which.
 *
 * Saving is wired now, through `PUT /api/v1/roles/{role}` — which enforces the
 * platform's floor and writes the audit row. The thing that made it a build
 * rather than a wiring job is the map below: it is MANY-TO-ONE. Five of the
 * design's actions read `pos.sell`, so switching "send to kitchen" off for a
 * waiter also takes away opening an order, taking payment, transferring a table
 * and closing a shift.
 *
 * The editor does not hide that and does not work around it. A cell is a
 * PERMISSION, the grid is redrawn from each role's permission set after every
 * click, and the four sibling cells visibly move with the one that was
 * pressed — which is the truth about what the button did. A grid that let them
 * be set independently would be lying about a server that cannot store the
 * difference.
 */

type Permissions = Messages['console']['permissions'];

export type RoleKey =
  | 'roleSuper'
  | 'roleOwner'
  | 'roleManager'
  | 'roleAccountant'
  | 'roleWaiter'
  | 'roleCashier'
  | 'roleKitchen'
  | 'roleWarehouse'
  | 'roleOperator';

export const ROLES: readonly { key: RoleKey; initials: string }[] = [
  { key: 'roleSuper', initials: 'ON' },
  { key: 'roleOwner', initials: 'RK' },
  { key: 'roleManager', initials: 'AR' },
  { key: 'roleAccountant', initials: 'MY' },
  { key: 'roleWaiter', initials: 'JT' },
  { key: 'roleCashier', initials: 'DK' },
  { key: 'roleKitchen', initials: 'BA' },
  { key: 'roleWarehouse', initials: 'SN' },
  /*
   * The ninth column. It was missing along with the role itself, which is why
   * the last three rows below were missing too: an intake desk is the only
   * thing on this grid that accepts a delivery, assigns a courier or confirms
   * an aggregator order, so with no operator there was nobody for those rows
   * to be about.
   */
  { key: 'roleOperator', initials: 'DR' },
];

/** 0 denied, 1 allowed, 2 allowed with a manager's PIN. */
export type Grant = 0 | 1 | 2;

export type MatrixRow = {
  action: keyof Pick<
    Permissions,
    | 'aOpenOrder'
    | 'aSend'
    | 'aVoid'
    | 'aDiscount5'
    | 'aDiscount20'
    | 'aPayment'
    | 'aRefund'
    | 'aTransfer'
    | 'aReservations'
    | 'aAdvance'
    | 'aEditMenu'
    | 'aAdjustStock'
    | 'aPurchase'
    | 'aStaff'
    | 'aFinance'
    | 'aPayroll'
    | 'aBranches'
    | 'aCloseShift'
    | 'aRoles'
    | 'aAcceptDelivery'
    | 'aAssignCourier'
    | 'aConfirmAggregator'
    | 'aTenant'
  >;
  /** One grant per role, in ROLES order. */
  grants: readonly Grant[];
};

export const MATRIX: readonly MatrixRow[] = [
  { action: 'aOpenOrder', grants: [0, 1, 1, 0, 1, 1, 0, 0, 1] },
  { action: 'aSend', grants: [0, 1, 1, 0, 1, 1, 0, 0, 1] },
  { action: 'aVoid', grants: [0, 1, 1, 0, 2, 2, 0, 0, 2] },
  { action: 'aDiscount5', grants: [0, 1, 1, 0, 1, 1, 0, 0, 1] },
  { action: 'aDiscount20', grants: [0, 1, 1, 0, 2, 2, 0, 0, 2] },
  { action: 'aPayment', grants: [0, 1, 1, 0, 2, 1, 0, 0, 0] },
  { action: 'aRefund', grants: [0, 1, 1, 1, 0, 2, 0, 0, 0] },
  { action: 'aTransfer', grants: [0, 1, 1, 0, 1, 1, 0, 0, 0] },
  { action: 'aReservations', grants: [0, 1, 1, 0, 0, 0, 0, 0, 1] },
  { action: 'aAdvance', grants: [0, 1, 1, 0, 0, 0, 1, 0, 0] },
  { action: 'aEditMenu', grants: [0, 1, 1, 0, 0, 0, 0, 0, 0] },
  { action: 'aAdjustStock', grants: [0, 1, 1, 0, 0, 0, 0, 1, 0] },
  { action: 'aPurchase', grants: [0, 1, 1, 2, 0, 0, 0, 1, 0] },
  { action: 'aStaff', grants: [0, 1, 1, 0, 0, 0, 0, 0, 0] },
  { action: 'aFinance', grants: [0, 1, 0, 1, 0, 0, 0, 0, 0] },
  { action: 'aPayroll', grants: [0, 1, 0, 1, 0, 0, 0, 0, 0] },
  { action: 'aBranches', grants: [0, 1, 0, 0, 0, 0, 0, 0, 0] },
  { action: 'aCloseShift', grants: [0, 1, 1, 0, 0, 1, 0, 0, 0] },
  { action: 'aRoles', grants: [0, 1, 0, 0, 0, 0, 0, 0, 0] },
  /* The three the intake desk exists for. */
  { action: 'aAcceptDelivery', grants: [0, 1, 1, 0, 0, 0, 0, 0, 1] },
  { action: 'aAssignCourier', grants: [0, 1, 1, 0, 0, 0, 0, 0, 1] },
  { action: 'aConfirmAggregator', grants: [0, 1, 1, 0, 0, 0, 0, 0, 1] },
  { action: 'aTenant', grants: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
];

/**
 * One role as `GET /api/v1/roles` answers it.
 *
 * `withheld` rides along rather than being left for the save to discover: a
 * cell the server will always refuse is drawn as refused rather than as an
 * empty tick somebody presses and then gets a 422 for.
 */
export type ApiRole = {
  name: string;
  permissions: string[];
  withheld: string[];
  discount_limit_percent: number | null;
};

/** The design's role key against the platform's role name. */
export const ROLE_NAMES: Readonly<Record<RoleKey, string>> = {
  roleSuper: 'super-admin',
  roleOwner: 'owner',
  roleManager: 'branch-manager',
  roleAccountant: 'accountant',
  roleWaiter: 'waiter',
  roleCashier: 'cashier',
  roleKitchen: 'chef',
  roleWarehouse: 'storekeeper',
  roleOperator: 'order-operator',
};

/**
 * Which permission expresses each of the design's actions.
 *
 * The seam between two vocabularies, and it is written down rather than
 * inferred because the interesting cells are the ones where the two do not line
 * up. A manager thinks in things a person does at work; the API thinks in
 * things a route can check.
 *
 * `ask` is the second half: a role that holds `ask` but not `needs` can raise
 * the request and a manager signs it, which is the PIN mark. Where `ask` is
 * absent, holding the permission is the only way through.
 */
export const ACTIONS: Readonly<Record<MatrixRow['action'], { needs: string; ask?: string }>> = {
  aOpenOrder: { needs: 'pos.sell' },
  aSend: { needs: 'pos.sell' },
  // Asking is not granting — P9's whole point, and the reason a waiter's cell
  // here says PIN rather than being empty.
  aVoid: { needs: 'pos.void', ask: 'pos.sell' },
  aDiscount5: { needs: 'pos.discount', ask: 'pos.sell' },
  aDiscount20: { needs: 'pos.discount', ask: 'pos.sell' },
  aPayment: { needs: 'pos.sell' },
  aRefund: { needs: 'pos.refund', ask: 'pos.sell' },
  aTransfer: { needs: 'pos.sell' },
  aReservations: { needs: 'tables.update' },
  aAdvance: { needs: 'kitchen.update' },
  aEditMenu: { needs: 'menu.update' },
  aAdjustStock: { needs: 'inventory.update' },
  aPurchase: { needs: 'suppliers.create', ask: 'suppliers.view' },
  aStaff: { needs: 'staff.manage' },
  aFinance: { needs: 'finance.manage' },
  aPayroll: { needs: 'finance.manage' },
  aBranches: { needs: 'branches.manage' },
  aCloseShift: { needs: 'pos.sell' },
  aRoles: { needs: 'roles.manage' },
  aAcceptDelivery: { needs: 'orders.update' },
  aAssignCourier: { needs: 'orders.update' },
  aConfirmAggregator: { needs: 'orders.update' },
  aTenant: { needs: 'tenants.manage' },
};

/**
 * The two discount rows, and the ceiling each one is measured against.
 *
 * These two cells are deliberately NOT editable. A discount is not a yes or a
 * no — it is `Terminal.settings.discount_limits`, a percentage, and the single
 * source CLAUDE.md names. Drawing a tick that wrote a boolean over a number
 * would silently demote an owner from 100% to "allowed", which is what the
 * console used to do to the ceiling by keeping its own copy of it.
 */
export const DISCOUNT_CEILING: Partial<Record<MatrixRow['action'], number>> = {
  aDiscount5: 5,
  aDiscount20: 20,
};

/**
 * One cell, from what the role actually holds.
 *
 * A role the endpoint did not return keeps whatever the fixture said. That is
 * only ever `super-admin`, which the platform deliberately excludes from a
 * restaurant's own roles screen — it is not editable there, and inventing a row
 * of dashes for it would claim the operator can do nothing.
 */
export function grantFor(row: MatrixRow, role: ApiRole | undefined, index: number): Grant {
  if (role === undefined) return row.grants[index] ?? 0;

  const rule = ACTIONS[row.action];
  const holds = role.permissions.includes(rule.needs);
  const ceiling = DISCOUNT_CEILING[row.action];

  if (ceiling !== undefined) {
    // A discount is not a yes or a no. The role's ceiling decides: at or above
    // it they sign for themselves, below it they ask, and with no till
    // permission at all they are not in this conversation.
    const limit = role.discount_limit_percent;

    if (limit !== null && limit >= ceiling) return 1;

    return rule.ask !== undefined && role.permissions.includes(rule.ask) ? 2 : 0;
  }

  if (holds) return 1;

  return rule.ask !== undefined && role.permissions.includes(rule.ask) ? 2 : 0;
}

/**
 * Whether a role still holds exactly what it arrived with.
 *
 * Order-insensitive, because the editor appends and filters while the API
 * answers sorted — comparing the two as lists would report every role as
 * changed the moment one tick moved, and the save writes one audit row per
 * role it sends.
 */
export function samePermissions(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return false;

  const held = new Set(before);

  return after.every((permission) => held.has(permission));
}

/** How each grant is drawn: a glyph, not a colour alone. */
export const GRANT_STYLE: Record<Grant, { glyph: string; className: string }> = {
  0: { glyph: '—', className: 'text-fg-disabled' },
  1: { glyph: '✓', className: 'bg-success-50 text-success-700' },
  2: { glyph: 'PIN', className: 'bg-warning-50 text-warning-700' },
};

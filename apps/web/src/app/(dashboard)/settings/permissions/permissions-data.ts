import type { Messages } from '@/i18n';

/**
 * Who may do what.
 *
 * The matrix mirrors the Spatie permission set the API defines — every module
 * grants `{module}.{action}` and every route sits behind one — so this screen
 * is a view of the real thing rather than a second source of truth.
 *
 * TODO(api): GET /api/v1/roles and /api/v1/permissions. Saving writes through
 * to Spatie; the audit log records who changed which grant, because a
 * permission change is the one edit that lets every later edit happen.
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
  | 'roleWarehouse';

export const ROLES: readonly { key: RoleKey; initials: string }[] = [
  { key: 'roleSuper', initials: 'ON' },
  { key: 'roleOwner', initials: 'RK' },
  { key: 'roleManager', initials: 'AR' },
  { key: 'roleAccountant', initials: 'MY' },
  { key: 'roleWaiter', initials: 'JT' },
  { key: 'roleCashier', initials: 'DK' },
  { key: 'roleKitchen', initials: 'BA' },
  { key: 'roleWarehouse', initials: 'SN' },
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
    | 'aTenant'
  >;
  /** One grant per role, in ROLES order. */
  grants: readonly Grant[];
};

export const MATRIX: readonly MatrixRow[] = [
  { action: 'aOpenOrder', grants: [0, 1, 1, 0, 1, 1, 0, 0] },
  { action: 'aSend', grants: [0, 1, 1, 0, 1, 1, 0, 0] },
  { action: 'aVoid', grants: [0, 1, 1, 0, 2, 2, 0, 0] },
  { action: 'aDiscount5', grants: [0, 1, 1, 0, 1, 1, 0, 0] },
  { action: 'aDiscount20', grants: [0, 1, 1, 0, 2, 2, 0, 0] },
  { action: 'aPayment', grants: [0, 1, 1, 0, 2, 1, 0, 0] },
  { action: 'aRefund', grants: [0, 1, 1, 1, 0, 2, 0, 0] },
  { action: 'aTransfer', grants: [0, 1, 1, 0, 1, 1, 0, 0] },
  { action: 'aReservations', grants: [0, 1, 1, 0, 0, 0, 0, 0] },
  { action: 'aAdvance', grants: [0, 1, 1, 0, 0, 0, 1, 0] },
  { action: 'aEditMenu', grants: [0, 1, 1, 0, 0, 0, 0, 0] },
  { action: 'aAdjustStock', grants: [0, 1, 1, 0, 0, 0, 0, 1] },
  { action: 'aPurchase', grants: [0, 1, 1, 2, 0, 0, 0, 1] },
  { action: 'aStaff', grants: [0, 1, 1, 0, 0, 0, 0, 0] },
  { action: 'aFinance', grants: [0, 1, 0, 1, 0, 0, 0, 0] },
  { action: 'aPayroll', grants: [0, 1, 0, 1, 0, 0, 0, 0] },
  { action: 'aBranches', grants: [0, 1, 0, 0, 0, 0, 0, 0] },
  { action: 'aCloseShift', grants: [0, 1, 1, 0, 0, 1, 0, 0] },
  { action: 'aRoles', grants: [0, 1, 0, 0, 0, 0, 0, 0] },
  { action: 'aTenant', grants: [1, 0, 0, 0, 0, 0, 0, 0] },
];

/** How each grant is drawn: a glyph, not a colour alone. */
export const GRANT_STYLE: Record<Grant, { glyph: string; className: string }> = {
  0: { glyph: '—', className: 'text-fg-disabled' },
  1: { glyph: '✓', className: 'bg-success-50 text-success-700' },
  2: { glyph: 'PIN', className: 'bg-warning-50 text-warning-700' },
};

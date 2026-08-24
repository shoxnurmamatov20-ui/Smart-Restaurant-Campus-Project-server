import { apiGet } from '@/lib/api-server';

import {
  grantFor,
  MATRIX,
  ROLES,
  ROLE_NAMES,
  type ApiRole,
  type MatrixRow,
} from './permissions-data';

/**
 * The permissions matrix, from Spatie.
 *
 * Server half of ./permissions-data.ts, split per the house rule: types and
 * fixtures in `*-data.ts`, anything that calls the server in a sibling only
 * server components import.
 *
 * ---------------------------------------------------------------------------
 * Why this file is a translation and not a fetch
 *
 * The design's grid is twenty-three ACTIONS — "open an order", "discount 20%",
 * "confirm an aggregator order" — and the server holds PERMISSIONS, which are
 * finer and named after modules. They are not the same vocabulary and neither
 * is wrong: a manager thinks in things a person does at work, and the API
 * thinks in things a route can check.
 *
 * The map that joins them is `ACTIONS` in `permissions-data.ts`. It moved there
 * when the grid became editable, because the browser needs it too: a cell click
 * changes a PERMISSION, and the grid is redrawn from the role's own set so the
 * other cells that read the same permission visibly move with it.
 *
 * ---------------------------------------------------------------------------
 * The roles ride back beside the grid
 *
 * `roles` is what the editor edits and `editable` is which columns it may
 * touch. Both are the server's own answer rather than a second list here:
 * `RoleFloor::editable()` decides that a restaurant cannot reconfigure
 * `super-admin`, and a console with its own opinion about that would draw a
 * column of controls that always 422.
 */

export type PermissionMatrix = {
  rows: readonly MatrixRow[];
  /** What each role holds here, as the endpoint answered it. Empty for fixtures. */
  roles: readonly ApiRole[];
  /** Which role names a restaurant may configure at all. */
  editable: readonly string[];
  /** False when this render is the fixture matrix rather than the server's. */
  live: boolean;
};

type ApiRoles = {
  data: ApiRole[];
  meta?: { permissions?: string[]; editable?: string[] };
};

/**
 * What each role actually holds in THIS restaurant, drawn as the design's grid.
 *
 * Falls back to the fixture matrix whole rather than per-cell: a grid that is
 * half real and half demo is the worst possible thing to put in front of
 * somebody deciding who may issue a refund, because nothing on it says which
 * half is which.
 */
export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  /*
   * `/roles`, not `/v1/roles`. `apiBase()` already ends `.../api/v1`, so the
   * second form asked for `/api/v1/v1/roles`, got a 404, and fell back to the
   * fixture matrix on every single render — silently, because falling back is
   * exactly what this function does when the API is down.
   */
  const live = await apiGet<ApiRoles>('/roles');

  if (!live?.data) return { rows: MATRIX, roles: [], editable: [], live: false };

  const byName = new Map(live.data.map((role) => [role.name, role]));

  return {
    rows: MATRIX.map((row) => ({
      action: row.action,
      grants: ROLES.map((role, index) => grantFor(row, byName.get(ROLE_NAMES[role.key]), index)),
    })),
    roles: live.data,
    editable: live.meta?.editable ?? live.data.map((role) => role.name),
    live: true,
  };
}

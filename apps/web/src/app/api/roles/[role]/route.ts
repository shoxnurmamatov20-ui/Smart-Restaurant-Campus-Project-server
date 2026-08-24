import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * What one role may do inside this restaurant.
 *
 * `PUT /api/v1/roles/{role}`, forwarded with the reader's own token — the API
 * decides `roles.manage` against the person who actually pressed Save, which by
 * `DesignRoleMatrixTest` only an owner and the platform operator hold.
 *
 * ---------------------------------------------------------------------------
 * The whole list, never a diff
 *
 * The endpoint takes the permissions a role should end up with and stores the
 * difference against the platform baseline as this restaurant's overlay (see
 * `TenantRoleOverlay` for why an edit cannot be a write to Spatie's shared
 * table). So the browser sends the full set: a partial list would revoke
 * everything left out of it, on the one screen where that is the worst possible
 * failure.
 *
 * ---------------------------------------------------------------------------
 * What is NOT checked here
 *
 * Which permissions a role may hold. `RoleFloor::refusals()` answers that and
 * refuses with the names in the envelope, in three languages; a second copy of
 * the floor in this handler would be a second thing to keep in step with the
 * platform's own rules, and it would be the copy that went stale. The grid
 * already draws those cells as unpressable from the `withheld` list the read
 * carries, so a refusal here means something changed underneath the reader —
 * which is exactly when they should see the API's own sentence.
 *
 * A POST from the browser, a PUT upstream: `lib/console-post.ts` sends nothing
 * but POSTs and the handler speaks whatever verb the API wants.
 */
type Body = { permissions?: unknown; discountLimitPercent?: unknown };

/** The platform's own shape for a permission name — `{module}.{action}`. */
const PERMISSION = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/**
 * More than the platform has, and far more than a role could hold.
 *
 * A ceiling on the list rather than on each name: this body is the only thing
 * on the console that can grow unbounded from a loop, and an unbounded array
 * forwarded to a validator is a request nobody meant to send.
 */
const MAX_PERMISSIONS = 200;

export async function POST(request: NextRequest, context: { params: Promise<{ role: string }> }) {
  const { role } = await context.params;

  // `{module}.{action}` is also what a role name is not: role names are
  // hyphenated words (`branch-manager`, `order-operator`). Checked here because
  // this segment is interpolated into the upstream URL.
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(role)) return badRequest('invalid_role');

  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  if (!Array.isArray(body.permissions)) return badRequest('invalid_permissions');

  if (body.permissions.length > MAX_PERMISSIONS) return badRequest('invalid_permissions');

  const permissions = body.permissions.filter(
    (name): name is string => typeof name === 'string' && PERMISSION.test(name),
  );

  // A name that is not a permission is a caller that has lost track of what it
  // is sending, and dropping it silently would save a role with one fewer
  // permission than the person on screen believed they had granted.
  if (permissions.length !== body.permissions.length) return badRequest('invalid_permissions');

  /*
   * The discount ceiling rides along only when it is sent.
   *
   * It is a PERCENTAGE and the single source is `Terminal.settings
   * .discount_limits`, which is where `ApprovalGate` reads it. Absent means
   * "leave it alone" — the endpoint only writes it when the key is present, and
   * a console that always sent one would overwrite an owner's 100% with
   * whatever it happened to have rendered.
   */
  const ceiling = body.discountLimitPercent;
  const hasCeiling = typeof ceiling === 'number' && Number.isInteger(ceiling);

  if (ceiling !== undefined && (!hasCeiling || ceiling < 0 || ceiling > 100)) {
    return badRequest('invalid_discount_limit');
  }

  return forward(request, `/roles/${encodeURIComponent(role)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: [...new Set(permissions)],
      ...(hasCeiling ? { discount_limit_percent: ceiling } : {}),
    }),
  });
}

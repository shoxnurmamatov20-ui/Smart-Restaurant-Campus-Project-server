'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post, type Lang } from '@/lib/console-post';

import {
  ACTIONS,
  DISCOUNT_CEILING,
  grantFor,
  GRANT_STYLE,
  ROLES,
  ROLE_NAMES,
  samePermissions,
  type ApiRole,
  type MatrixRow,
} from './permissions-data';

/**
 * Who may do what, and now it can be changed.
 *
 * The grid was read-only and said so by having no Save button — an editable
 * looking 23 × 9 matrix over a button that only flashed is the one place on
 * this screen where being wrong has a cost, since this is the grid that decides
 * who may void, refund and discount.
 *
 * ---------------------------------------------------------------------------
 * A cell is a PERMISSION, not a cell
 *
 * `ACTIONS` is many-to-one: five of the design's actions read `pos.sell`, so
 * switching "send to kitchen" off for a waiter also takes away opening an
 * order, taking payment, transferring a table and closing a shift. This editor
 * does not hide that and does not work around it. The whole column is redrawn
 * from the role's permission set after every click, so the four sibling cells
 * visibly move with the one that was pressed — which is the truth about what
 * the button did. Letting them be set independently would be lying about a
 * server that cannot store the difference.
 *
 * ---------------------------------------------------------------------------
 * Three kinds of cell that do not move
 *
 * `super-admin`, because a restaurant does not configure the platform operator
 * and `RoleFloor::editable()` refuses it; anything in the role's `withheld`
 * list, because the floor refuses that too and a tick somebody presses and then
 * gets a 422 for is worse than a dash; and the two discount rows, because a
 * discount ceiling is a PERCENTAGE — `Terminal.settings.discount_limits`, the
 * single source — and writing a boolean over it would silently demote an owner
 * from 100% to "allowed".
 *
 * ---------------------------------------------------------------------------
 * Saving sends whole roles, and only the ones that moved
 *
 * `PUT /api/v1/roles/{role}` takes the full permission list and stores the diff
 * against the platform baseline as this restaurant's overlay. Sending every
 * role would write nine audit rows for one changed tick; sending a partial list
 * would revoke everything left out.
 */
export function PermissionGrid({
  rows,
  roles,
  editable,
  live,
  lang,
  actionLabels,
  roleLabels,
  grid,
  labels,
}: {
  rows: readonly MatrixRow[];
  roles: readonly ApiRole[];
  editable: readonly string[];
  live: boolean;
  lang: Lang;
  /** Every action's row heading, resolved on the server. */
  actionLabels: Readonly<Record<string, string>>;
  /** Every column's heading, in ROLES order. */
  roleLabels: Readonly<Record<string, string>>;
  /** The design's grid template — one column per role plus the action column. */
  grid: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();

  /*
   * The edit, held as permission sets rather than as grants.
   *
   * Keyed by the platform's role name because that is what the save addresses
   * and what `withheld` is stated against. Grants are derived on every render
   * by `grantFor()` — the same function the server used to draw the first
   * paint — so there is exactly one definition of what a cell means.
   */
  const [held, setHeld] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(roles.map((role) => [role.name, [...role.permissions]])),
  );
  const [saving, setSaving] = useState(false);

  const byName = new Map(roles.map((role) => [role.name, role]));

  /** The role as it stands in the editor, not as it arrived. */
  const edited = (name: string): ApiRole | undefined => {
    const role = byName.get(name);

    return role === undefined ? undefined : { ...role, permissions: held[name] ?? [] };
  };

  const changed = roles.filter(
    (role) => !samePermissions(role.permissions, held[role.name] ?? role.permissions),
  );

  function toggle(name: string, permission: string) {
    setHeld((current) => {
      const set = current[name] ?? [];

      return {
        ...current,
        [name]: set.includes(permission)
          ? set.filter((held) => held !== permission)
          : [...set, permission],
      };
    });
  }

  async function save() {
    if (saving || changed.length === 0) return;

    setSaving(true);

    for (const role of changed) {
      const answer = await post<unknown>(
        `/api/roles/${encodeURIComponent(role.name)}`,
        { permissions: held[role.name] ?? [] },
        lang,
      );

      if (!answer.ok) {
        setSaving(false);
        flash.problem(answer.message ?? labels.saveFailed);

        return;
      }
    }

    setSaving(false);
    flash(labels.saved);
    // The server re-reads `GET /roles`, so what is drawn next is what was
    // stored — including anything the floor quietly refused to move.
    router.refresh();
  }

  return (
    <>
      <div data-scroll className="bg-surface overflow-x-auto rounded-lg border">
        <div className="min-w-[1080px]">
          <div className={`bg-bg-subtle sticky top-0 grid ${grid} border-b`}>
            <div className="text-fg-subtle self-end px-5 py-3.5 text-xs font-semibold tracking-wide">
              {labels.action}
            </div>

            {ROLES.map((role) => (
              <div key={role.key} className="border-divider border-l px-2 py-3 text-center">
                <div className="bg-bg-muted text-fg-muted rounded-pill text-3xs mx-auto mb-[7px] grid size-[26px] place-items-center font-bold">
                  {role.initials}
                </div>
                <div className="text-fg-muted text-2xs leading-[1.25] font-semibold">
                  {roleLabels[role.key]}
                </div>
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div key={row.action} data-row className={`border-divider grid ${grid} border-b`}>
              <div className="px-5 py-[13px] text-sm">{actionLabels[row.action]}</div>

              {ROLES.map((role, index) => {
                const name = ROLE_NAMES[role.key];
                const current = edited(name);
                const grant = grantFor(row, current, index);
                const style = GRANT_STYLE[grant];
                const permission = ACTIONS[row.action].needs;

                /*
                 * Whether this particular cell may be pressed. Four conditions,
                 * and every one of them is a thing the server would refuse.
                 */
                const settable =
                  live &&
                  current !== undefined &&
                  editable.includes(name) &&
                  DISCOUNT_CEILING[row.action] === undefined &&
                  !current.withheld.includes(permission);

                if (!settable) {
                  return (
                    <div
                      key={`${row.action}-${role.key}`}
                      className="border-divider flex items-center justify-center border-l p-2"
                    >
                      <span
                        className={`text-2xs flex h-[22px] min-w-[26px] items-center justify-center rounded-xs px-[7px] font-bold ${style.className}`}
                      >
                        {style.glyph}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${row.action}-${role.key}`}
                    className="border-divider flex items-center justify-center border-l p-2"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(name, permission)}
                      /* The permission the cell actually moves, named on hover:
                         it is how a reader discovers that five cells share one. */
                      title={`${roleLabels[role.key]} · ${permission}`}
                      aria-pressed={grant === 1}
                      className={`text-2xs hover:ring-border-strong flex h-[22px] min-w-[26px] items-center justify-center rounded-xs px-[7px] font-bold hover:ring-2 ${style.className}`}
                    >
                      {style.glyph}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/*
       * The Save button appears with the first change and says how many roles
       * it is about to write. A permanently visible Save over an unchanged grid
       * is the control that trains people to press it without reading.
       */}
      {live ? (
        <div className="mt-4 flex items-center justify-end gap-3">
          {changed.length > 0 ? (
            <span className="text-fg-muted text-xs">
              {labels.pending.replace('{n}', String(changed.length))}
            </span>
          ) : null}

          <button
            type="button"
            data-press
            disabled={changed.length === 0 || saving}
            onClick={() => void save()}
            className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {labels.save}
          </button>
        </div>
      ) : null}
    </>
  );
}

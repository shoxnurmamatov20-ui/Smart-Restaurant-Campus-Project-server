'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import type { FloorPlanRooms, PlanTable } from './tables-server';

/**
 * "Edit layout" — where each table sits, and which room it is in.
 *
 * The design draws a button for this on the floor screen and it was an
 * `ActionButton`: it flashed a sentence about a plan editor and opened nothing.
 * What replaces it is a list rather than a canvas, and that is a reading of the
 * design rather than a compromise — the plan it draws is a wrapping grid of
 * equal tiles, so what a table needs is a PLACE IN ITS ROOM, not an (x, y). A
 * drag-and-drop canvas over a scale drawing of the room is a different product
 * and would want different columns.
 *
 * Two moves, and both are one `PATCH /v1/tables/tables/{table}`: up or down
 * within the room, and across to another room. One tile per call, because two
 * managers rearranging different corners of the same evening must not each post
 * a copy of the whole floor.
 *
 * Optimistic, then reconciled by a reload. The list reorders under the finger
 * immediately — a plan editor that waits for a round trip per press is one
 * nobody finishes a room in — and the page reloads when the editor is closed so
 * the board above it is drawn from what actually landed.
 */
export function LayoutEditor({
  plan,
  labels,
}: {
  plan: FloorPlanRooms;
  labels: {
    open: string;
    close: string;
    title: string;
    hint: string;
    room: string;
    empty: string;
    up: string;
    down: string;
    saved: string;
    failed: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<readonly PlanTable[]>(plan.tables);
  const [dirty, setDirty] = useState(false);

  /**
   * The room's tables in the order they are drawn.
   *
   * `position` first and the label second — exactly the API's own default sort
   * — so a room nobody has arranged reads as it always did rather than
   * scrambling the moment this screen is opened.
   */
  const inRoom = (hallId: number): readonly PlanTable[] =>
    tables
      .filter((table) => table.hallId === hallId)
      .slice()
      .sort(
        (left, right) => left.position - right.position || left.label.localeCompare(right.label),
      );

  async function write(tableId: number, patch: { position?: number; hallId?: number }) {
    const answer = await post('/api/tables/layout', { tableId, ...patch }, 'uz');

    if (answer.ok) {
      setDirty(true);

      return true;
    }

    flash.problem(answer.message ?? labels.failed);

    return false;
  }

  /**
   * Swap a table with its neighbour.
   *
   * Both rows are written, and both have to be: `position` is an ordering and
   * moving one tile past another leaves the other where it was. Renumbering the
   * whole room on every press would be a dozen requests for one keystroke.
   */
  async function move(hallId: number, tableId: number, direction: -1 | 1) {
    const room = inRoom(hallId);
    const index = room.findIndex((table) => table.id === tableId);
    const neighbour = room[index + direction];
    const table = room[index];

    if (table === undefined || neighbour === undefined) return;

    /*
     * Positions are renumbered from one for this pair rather than swapped.
     *
     * Every table on an untouched floor sits at 0, so a swap would exchange
     * zero for zero and change nothing at all. Numbering by the row's place in
     * the list is what turns "unplaced" into an order the first time anybody
     * presses an arrow.
     */
    const here = index + 1;
    const there = index + direction + 1;

    setTables((current) =>
      current.map((row) =>
        row.id === table.id
          ? { ...row, position: there }
          : row.id === neighbour.id
            ? { ...row, position: here }
            : row,
      ),
    );

    const first = await write(table.id, { position: there });

    if (first) await write(neighbour.id, { position: here });
  }

  async function moveRoom(tableId: number, hallId: number) {
    setTables((current) =>
      current.map((row) => (row.id === tableId ? { ...row, hallId, position: 0 } : row)),
    );

    // Placed at the end of its new room rather than at its old number: two
    // tables sharing a position in a room they did not both come from is a
    // plan whose order depends on which one the database returns first.
    await write(tableId, { hallId, position: 0 });
  }

  function toggle() {
    if (open && dirty) {
      flash(labels.saved);
      // The board above draws state from its own read; a reload is what makes
      // the two agree rather than leaving a moved tile in one and not the other.
      window.location.reload();

      return;
    }

    setOpen((current) => !current);
  }

  return (
    <>
      <button
        type="button"
        data-press
        onClick={toggle}
        className="border-border-strong bg-surface text-fg grid h-[34px] place-items-center rounded-md border px-3.5 text-sm font-semibold"
      >
        {open ? labels.close : labels.open}
      </button>

      {open ? (
        <div className="bg-surface fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t p-5 shadow-lg">
          <h3 className="text-md font-semibold">{labels.title}</h3>
          <p className="text-fg-subtle mt-1 mb-4 text-xs leading-normal">{labels.hint}</p>

          {plan.halls.length === 0 ? (
            <p className="text-fg-subtle py-8 text-center text-sm">{labels.empty}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plan.halls.map((hall) => {
                const room = inRoom(hall.id);

                return (
                  <section key={hall.id} className="rounded-lg border p-3.5">
                    <h4 className="text-2xs tracking-caps text-fg-subtle mb-2 font-semibold uppercase">
                      {hall.name}
                    </h4>

                    {room.length === 0 ? (
                      <p className="text-fg-subtle py-3 text-center text-xs">{labels.empty}</p>
                    ) : (
                      <ul className="grid gap-1.5">
                        {room.map((table, index) => (
                          <li
                            key={table.id}
                            className="border-divider flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                          >
                            <span data-num className="text-fg-disabled w-5 text-xs">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {table.label}
                            </span>

                            <button
                              type="button"
                              aria-label={`${table.label} · ${labels.up}`}
                              disabled={index === 0}
                              onClick={() => void move(hall.id, table.id, -1)}
                              className="text-fg-muted hover:text-fg h-7 w-6 text-sm disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`${table.label} · ${labels.down}`}
                              disabled={index === room.length - 1}
                              onClick={() => void move(hall.id, table.id, 1)}
                              className="text-fg-muted hover:text-fg h-7 w-6 text-sm disabled:opacity-30"
                            >
                              ↓
                            </button>

                            <select
                              value={hall.id}
                              aria-label={`${table.label} · ${labels.room}`}
                              onChange={(event) =>
                                void moveRoom(table.id, Number(event.target.value))
                              }
                              className="border-border-strong bg-bg-subtle h-7 max-w-[110px] rounded-md border px-1.5 text-xs"
                            >
                              {plan.halls.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

import type { TableStatus } from './tables-data';

/**
 * The API's table states against the five the design draws.
 *
 * Its own module because both halves of the floor screen need it and they live
 * on opposite sides of the server boundary: `tables-server.ts` maps the first
 * paint, and `floor-board.tsx` — a client component — maps every message that
 * arrives on `branch.{id}.floor` afterwards. It cannot sit in the server module
 * (that one reads `next/headers`, which cannot exist in a browser bundle) and
 * it does not belong in `tables-data.ts`, which is the design's fixture and
 * says nothing about an API.
 *
 * Two mappings would be worse than either: a socket that coloured a table
 * differently from the render it is correcting is a floor plan that changes
 * colour when somebody reloads it.
 *
 * Anything unrecognised reads as free rather than throwing. A new state the
 * server grows should leave the floor drawable, and an open ring on a table
 * that is actually busy is corrected by the next render.
 */
export const TABLE_STATE: Readonly<Record<string, TableStatus>> = {
  free: 'free',
  available: 'free',
  seated: 'seated',
  occupied: 'seated',
  reserved: 'reserved',
  booked: 'reserved',
  cleaning: 'cleaning',
  dirty: 'cleaning',
  to_pay: 'to_pay',
  billed: 'to_pay',
};

/** What `branch.{id}.floor` carries — Modules/Tables `TableStateChanged`. */
export type TableChanged = {
  table_id: number;
  /**
   * The table's own name, which is what the board matches on.
   *
   * `Table` in `tables-data.ts` is the design's shape and carries no id, and a
   * screen that joined the channel late has no floor plan to look one up in.
   * "A-7 went green" is the whole message.
   */
  label: string;
  from: string;
  to: string;
};

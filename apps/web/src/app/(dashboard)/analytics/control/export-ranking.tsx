'use client';

import { useState } from 'react';

import { ExportDialog } from '../../export-dialog';

/**
 * The staff ranking, as a file.
 *
 * This screen's export button used to flash "eksport qilinmoqda" and produce
 * nothing; it was then replaced with a link to the printable voids sheet, which
 * is a real page but a different report — the ranking on screen is who the
 * voids and discounts belong to, and that is the table a manager takes into a
 * conversation.
 *
 * ---------------------------------------------------------------------------
 * `kind: 'waiters'`, and that is not a substitution
 *
 * The API builds that report from `LossControl::report()['staff']` — the same
 * query, in the same window, that drew the rows above this button. Asking for a
 * separate `control` kind would have meant a second query answering the same
 * question, and two figures a manager can hold up beside each other of which
 * one will eventually be wrong.
 *
 * The dialog falls back to writing the rows on screen when the server refuses —
 * a reader with no session, or an API mid-restart — so the button produces a
 * file either way. What it never does is promise one it did not write.
 */
export function ExportRanking({
  period,
  rows,
  columns,
  className,
  label,
  labels,
}: {
  /** The window the screen is drawn for, so the file matches what is on it. */
  period: 'today' | 'week' | 'month';
  /** One array per person, already formatted the way the table shows them. */
  rows: readonly (readonly string[])[];
  columns: readonly string[];
  className: string;
  label: string;
  labels: React.ComponentProps<typeof ExportDialog>['labels'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" data-press onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      <ExportDialog
        open={open}
        onClose={() => setOpen(false)}
        filename="control"
        columns={columns}
        rows={rows}
        server={{ kind: 'waiters', period }}
        labels={labels}
      />
    </>
  );
}

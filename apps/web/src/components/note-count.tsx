'use client';

import { useLocale } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';

/**
 * A drawer, counted note by note.
 *
 * The same table on the tablet that opens a till and on the console that closes
 * one, because it is the same act: somebody standing at an open drawer with
 * banknotes in their hand. Typing "480 000" is a figure anybody can produce
 * without opening the drawer at all, and it is the number every Z report is
 * reconciled against — so the total has to be the thing the count produces, not
 * the thing it is checked against.
 *
 * One copy for a sharper reason than tidiness. The float and the closing count
 * are the two ends of one arithmetic, and two components multiplying notes by
 * values are two places that can disagree about a drawer — which is precisely
 * the failure the whole close-day flow exists to surface.
 *
 * Notes arrive in tiyin and stay in tiyin. Nothing here divides or multiplies
 * by a hundred: a screen that converted anywhere would be one rounding away
 * from a till that never reconciles.
 */

/** What has been typed into each row, keyed by denomination in tiyin. */
export type NoteCounts = Readonly<Record<number, string>>;

/** How many notes of one denomination, as a number. Blank and junk read as none. */
export function piecesOf(counts: NoteCounts, note: number): number {
  return Number.parseInt(counts[note] ?? '', 10) || 0;
}

/** What the counted notes come to, in tiyin. */
export function countTotal(notes: readonly number[], counts: NoteCounts): number {
  return notes.reduce((total, note) => total + note * piecesOf(counts, note), 0);
}

/**
 * The count as the API takes it: denomination in tiyin → how many.
 *
 * Empty rows are dropped rather than sent as zero. The server drops them too,
 * and sending them would make a stored count mostly padding — with no way for a
 * reader to tell a note counted as none from one that was never offered.
 */
export function breakdownOf(notes: readonly number[], counts: NoteCounts): Record<string, number> {
  const breakdown: Record<string, number> = {};

  for (const note of notes) {
    const pieces = piecesOf(counts, note);

    if (pieces > 0) breakdown[String(note)] = pieces;
  }

  return breakdown;
}

/** Whether anything at all has been typed — a drawer with nothing in it counts. */
export function isCounted(notes: readonly number[], counts: NoteCounts): boolean {
  return notes.some((note) => (counts[note] ?? '').length > 0);
}

export function NoteCount({
  notes,
  counts,
  onChange,
  labels,
  disabled = false,
}: {
  /** Denominations in tiyin, largest first. */
  notes: readonly number[];
  counts: NoteCounts;
  onChange: (counts: NoteCounts) => void;
  labels: { note: string; pieces: string; sum: string };
  disabled?: boolean;
}) {
  const locale = useLocale() as 'uz' | 'ru' | 'en';

  return (
    <div>
      <div className="border-divider text-fg-subtle text-2xs grid grid-cols-[1fr_96px_1fr] gap-3 border-b pb-2 font-semibold tracking-[0.06em] uppercase">
        <span>{labels.note}</span>
        <span className="text-center">{labels.pieces}</span>
        <span className="text-right">{labels.sum}</span>
      </div>

      {notes.map((note) => {
        const pieces = piecesOf(counts, note);

        return (
          <label
            key={note}
            className="border-divider grid grid-cols-[1fr_96px_1fr] items-center gap-3 border-b py-2.5 last:border-0"
          >
            <span data-num className="text-md font-semibold tabular-nums">
              {formatTiyinAmount(note, locale)}
            </span>

            <input
              value={counts[note] ?? ''}
              onChange={(event) =>
                onChange({
                  ...counts,
                  // Digits only. A tablet keyboard offers a decimal point and a
                  // minus sign, and neither is a number of banknotes.
                  [note]: event.target.value.replace(/\D/g, '').slice(0, 4),
                })
              }
              inputMode="numeric"
              disabled={disabled}
              aria-label={`${formatTiyinAmount(note, locale)} · ${labels.pieces}`}
              className="border-border text-md h-12 rounded-[10px] border text-center font-semibold tabular-nums disabled:opacity-50"
            />

            <span
              data-num
              className={`text-md text-right tabular-nums ${pieces > 0 ? '' : 'text-fg-subtle'}`}
            >
              {pieces > 0 ? formatTiyinAmount(note * pieces, locale) : '—'}
            </span>
          </label>
        );
      })}
    </div>
  );
}

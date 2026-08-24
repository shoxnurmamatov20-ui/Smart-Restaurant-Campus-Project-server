'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';

import { KDS_COPY, say, type StopEntry } from './kds-data';

/**
 * The 86 sheet.
 *
 * The design draws it as a panel over the board, grouped by station, with one
 * switch per dish — because the person opening it is a cook mid-service who has
 * just looked in a fridge, and the thing they want is their own station's list
 * and a single tap.
 *
 * Every tap is a write, and the answer replaces the sheet. No optimistic toggle:
 * a switch that flipped locally and then failed would leave a cook believing a
 * dish is off while every tablet in the building is still selling it, and that is
 * the one mistake this feature exists to prevent. So the row goes busy for the
 * length of the request and then says what the server says.
 */
export function StopSheet({
  entries,
  onEntries,
  onClose,
  labels,
}: {
  entries: readonly StopEntry[];
  /** Handed the sheet the server returned, so the board and this stay in step. */
  onEntries: (next: readonly StopEntry[]) => void;
  onClose: () => void;
  labels: {
    title: string;
    subtitle: string;
    close: string;
    off: string;
    on: string;
    failed: string;
    empty: string;
    stations: Record<string, string>;
  };
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const locale = useLocale();

  async function toggle(entry: StopEntry) {
    if (busy !== null) return;

    setBusy(entry.dishId);
    setFailed(false);

    try {
      const response = await fetch(
        entry.stopped ? `/api/kitchen/stop-list?dish=${entry.dishId}` : '/api/kitchen/stop-list',
        entry.stopped
          ? { method: 'DELETE' }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ menu_item_id: entry.dishId }),
            },
      );

      if (!response.ok) {
        setFailed(true);
        flash.problem(labels.failed);

        return;
      }

      const body = (await response.json()) as { data?: readonly StopEntry[] };

      if (body.data !== undefined) onEntries(body.data);

      /*
       * `Manti · stop-listga qo'shildi` — `dc.html:17530`.
       *
       * The switch itself flips, which the chef standing over it saw. The toast
       * is what confirms the *other* half of the promise: every till in the
       * building has just been told, and the dish cannot be sold any more. That
       * is the whole reason the sheet exists and it happens off screen.
       *
       * Past tense and after the response, never before — an optimistic toast
       * here would announce a stop the server refused.
       */
      flash(
        `${entry.title} · ${say(locale, entry.stopped ? KDS_COPY.stopLifted : KDS_COPY.stopAdded)}`,
      );
    } catch {
      setFailed(true);
      flash.problem(labels.failed);
    } finally {
      setBusy(null);
    }
  }

  // Grouped in the order the stations first appear, which follows the menu's own
  // sort — so the sheet reads in the same order as the board above it.
  const byStation = new Map<string, StopEntry[]>();

  for (const entry of entries) {
    const group = byStation.get(entry.station);

    if (group === undefined) byStation.set(entry.station, [entry]);
    else group.push(entry);
  }

  return (
    /*
     * Inline, pushing the board down — not a drawer over it.
     *
     * `specs/01-os.md §5.5` draws a panel that opens under the header and keeps
     * the tickets visible. This was a right-hand modal covering half the wall,
     * and the difference matters mid-service: the cook opening the 86 sheet is
     * the same cook watching the pass, and a sheet that hides the board is a
     * sheet they close before they have finished reading it.
     */
    <section data-panel-in className="border-divider bg-surface flex-none border-b">
      <div className="flex w-full flex-col">
        <header className="border-divider flex flex-none items-start gap-3 border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-display tracking-snug text-xl leading-tight font-semibold">
              {labels.title}
            </div>
            <p className="text-fg-subtle mt-1 text-xs leading-normal">{labels.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border-border flex h-11 w-11 flex-none items-center justify-center rounded-md border text-lg"
          >
            ×
          </button>
        </header>

        {failed ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 mx-5 mt-3 rounded-[10px] px-3 py-2 text-xs font-medium"
          >
            {labels.failed}
          </p>
        ) : null}

        {entries.length === 0 ? (
          <p className="text-fg-subtle px-5 py-8 text-center text-sm">{labels.empty}</p>
        ) : (
          <div data-scroll className="max-h-[46vh] overflow-y-auto px-6 py-3">
            {[...byStation.entries()].map(([station, group]) => (
              <section key={station} className="mb-5 last:mb-0">
                <h3 className="text-fg-subtle text-2xs tracking-caps mb-2 font-semibold uppercase">
                  {labels.stations[station] ?? station}
                </h3>

                {group.map((entry) => (
                  <button
                    key={entry.dishId}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void toggle(entry)}
                    className="border-divider flex min-h-[56px] w-full items-center gap-3 border-b py-2.5 text-left last:border-0 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`text-md block leading-snug font-semibold ${
                          entry.stopped ? 'text-fg-subtle line-through' : ''
                        }`}
                      >
                        {entry.title}
                      </span>

                      {/* Who took it off, which is half of what the sheet is for:
                          a dish that is off and nobody knows why stays off. */}
                      {entry.stopped && entry.stoppedBy !== null ? (
                        <span className="text-fg-subtle mt-0.5 block text-xs">
                          {entry.stoppedBy}
                          {entry.reason === null ? '' : ` · ${entry.reason}`}
                        </span>
                      ) : null}
                    </span>

                    <span
                      className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${
                        entry.stopped
                          ? 'bg-warning-50 text-warning-700'
                          : 'bg-bg-muted text-fg-muted'
                      }`}
                    >
                      {entry.stopped ? labels.off : labels.on}
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

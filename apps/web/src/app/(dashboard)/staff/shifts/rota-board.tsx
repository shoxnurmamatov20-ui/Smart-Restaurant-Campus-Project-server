'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import {
  hoursOf,
  MINIMUM_COVER,
  ROTA_COPY,
  say,
  SHIFT_CYCLE,
  WEEKLY_HOUR_LIMIT,
  type Lang,
} from './shifts-data';

/**
 * The week, with the two columns that make it readable.
 *
 * The console drew the grid and stopped there. The design does not: every row
 * ends in a total, and a total over 48 hours or a row with no day off is called
 * out in red beneath it (`shRows`, `Smart Restaurant OS.dc.html:16619`). Under
 * the grid runs the cover row — how many people are on each day — which is the
 * only place an understaffed Saturday is visible before Saturday.
 *
 * Hours are read back out of the printed range rather than stored, so a shift
 * that came from the API counts the same as one typed here. Tapping a cell
 * steps day → evening → off, the design's own cycle, and every figure below
 * recomputes: a rota editor whose totals lag behind its cells is worse than no
 * editor, because the number is still there and is now wrong.
 */
export type RotaPerson = {
  id: string;
  name: string;
  /** Already resolved — the roster and the rota must not disagree about a post. */
  role: string;
  days: readonly (string | null)[];
};

export function RotaBoard({
  people,
  days,
  week,
  lang,
  labels,
}: {
  people: readonly RotaPerson[];
  /** Seven headings, Monday first. Weekend headings are tinted by the caller. */
  days: readonly { label: string; weekend: boolean }[];
  /**
   * The dates the headings stand for, `YYYY-MM-DD`.
   *
   * Publishing needs them and the headings cannot carry them: `Du`, `Se`, `Cho`
   * are seven words that mean a different seven days every week. Resolved by the
   * page, which is where the week is decided.
   */
  week: { from: string; to: string };
  lang: Lang;
  labels: { who: string; off: string; rota: string; rotaSub: string };
}) {
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [published, setPublished] = useState(false);

  const cellAt = (person: RotaPerson, index: number): string | null => {
    const key = `${person.id}-${index}`;

    return key in edits ? edits[key]! : (person.days[index] ?? null);
  };

  function cycle(person: RotaPerson, index: number) {
    const current = cellAt(person, index);
    const at = SHIFT_CYCLE.indexOf(current);
    const next = SHIFT_CYCLE[(at + 1) % SHIFT_CYCLE.length]!;

    setEdits((state) => ({ ...state, [`${person.id}-${index}`]: next }));
    setPublished(false);
  }

  /* People on, per day. Counted from the live cells so an edit moves it. */
  const cover = days.map(
    (_, index) => people.filter((person) => cellAt(person, index) !== null).length,
  );

  return (
    <section className="bg-surface mb-[18px] overflow-hidden rounded-lg border">
      <div className="border-divider flex flex-wrap items-center justify-between gap-4 border-b px-5 pt-4 pb-3.5">
        <h3 className="text-md tracking-snug font-semibold">{labels.rota}</h3>

        <div className="flex items-center gap-3">
          <span data-num className="text-fg-subtle text-xs">
            {labels.rotaSub} · {say(ROTA_COPY.hint, lang)}
          </span>

          <span
            data-num
            className={`rounded-pill text-2xs px-2.5 py-[5px] font-semibold ${
              published ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
            }`}
          >
            {published ? say(ROTA_COPY.published, lang) : say(ROTA_COPY.draft, lang)}
          </span>

          <button
            type="button"
            data-press
            onClick={() => {
              /*
               * Marked published before the answer, and left marked whatever
               * comes back. The pill is about what the manager just did; a
               * refusal says so in the toast, which is where a person looks
               * after pressing something.
               */
              setPublished(true);

              void post('/api/staff/rota', week, lang).then((answer) => {
                if (answer.ok) {
                  flash(say(ROTA_COPY.publishedFlash, lang));

                  return;
                }

                flash.problem(answer.message ?? say(ROTA_COPY.publishedFlash, lang));
              });
            }}
            className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-4 text-sm font-semibold text-white"
          >
            {say(ROTA_COPY.publish, lang)}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              <th className="bg-surface text-fg-subtle sticky left-0 border-b px-5 py-[11px] text-left text-xs font-semibold">
                {labels.who}
              </th>
              {days.map((day) => (
                <th
                  key={day.label}
                  className={`border-b px-2 py-[11px] text-center text-xs font-semibold ${
                    day.weekend ? 'text-fg-brand' : 'text-fg-subtle'
                  }`}
                >
                  {day.label}
                </th>
              ))}
              <th className="text-fg-subtle border-b py-[11px] pr-5 pl-3.5 text-right text-xs font-semibold">
                {say(ROTA_COPY.hours, lang)}
              </th>
            </tr>
          </thead>

          <tbody>
            {people.map((person) => {
              const cells = days.map((_, index) => cellAt(person, index));
              const total = cells.reduce((sum, cell) => sum + hoursOf(cell), 0);
              const hasRest = cells.some((cell) => cell === null);

              /* Two warnings, and only one is shown: a week that is both over
                 the limit and rest-free is over the limit first, because that
                 is the one with a number attached to it. */
              const warning =
                total > WEEKLY_HOUR_LIMIT
                  ? say(ROTA_COPY.over, lang)
                  : hasRest
                    ? ''
                    : say(ROTA_COPY.noRest, lang);

              return (
                <tr key={person.id}>
                  <td className="border-divider bg-surface sticky left-0 border-b px-5 py-[11px]">
                    <span className="block text-sm font-semibold">{person.name}</span>
                    <span className="text-fg-subtle mt-0.5 block text-xs">{person.role}</span>
                  </td>

                  {cells.map((cell, index) => (
                    <td
                      key={`${person.id}-${index}`}
                      className="border-divider border-b px-1.5 py-[7px] text-center"
                    >
                      <button
                        type="button"
                        data-num
                        data-press
                        onClick={() => cycle(person, index)}
                        className={`text-2xs hover:border-border-strong inline-block min-w-[54px] rounded-sm border border-transparent px-[7px] py-1.5 font-semibold ${
                          cell === null
                            ? 'bg-bg-muted text-fg-disabled'
                            : hoursOf(cell) >= 10
                              ? 'bg-brand-50 text-brand-700'
                              : 'bg-accent-50 text-accent-700'
                        }`}
                      >
                        {cell ?? labels.off}
                      </button>
                    </td>
                  ))}

                  <td className="border-divider border-b py-[7px] pr-5 pl-3.5 text-right">
                    <span
                      data-num
                      className={`font-display text-sm font-bold ${
                        total > WEEKLY_HOUR_LIMIT ? 'text-danger-600' : ''
                      }`}
                    >
                      {total} {say(ROTA_COPY.hoursShort, lang)}
                    </span>
                    {warning === '' ? null : (
                      <span className="text-danger-600 text-2xs mt-0.5 block">{warning}</span>
                    )}
                  </td>
                </tr>
              );
            })}

            <tr>
              <td className="bg-bg-subtle text-fg-subtle sticky left-0 px-5 py-[11px] text-xs font-semibold">
                {say(ROTA_COPY.cover, lang)}
              </td>
              {cover.map((count, index) => (
                <td
                  key={days[index]?.label ?? index}
                  className="bg-bg-subtle px-1.5 py-[11px] text-center"
                >
                  <span
                    data-num
                    className={`text-sm font-bold ${
                      count < MINIMUM_COVER ? 'text-danger-600' : 'text-fg-muted'
                    }`}
                  >
                    {count}
                  </span>
                </td>
              ))}
              <td className="bg-bg-subtle" />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

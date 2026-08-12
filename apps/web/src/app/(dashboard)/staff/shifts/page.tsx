import { getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../../module-page';
import { ACTION_PRIMARY, PageHead } from '../../screen';
import { STAFF } from '../staff-data';
import { getRota } from './shifts-data';

export const generateMetadata = () => moduleMetadata('shifts');

/**
 * The week's rota.
 *
 * Built to the design's Schedule screen: staff down the side, days across, one
 * cell per person per day. The name column is sticky, because a rota is read by
 * scrolling sideways and a row without its name is a row nobody can use.
 *
 * A day off is written rather than left blank. An empty cell in a rota is
 * ambiguous — it could mean off, or it could mean nobody has filled it in yet —
 * and those two are the difference between a quiet Tuesday and an unstaffed one.
 *
 * TODO — Phase 1 · staff/shifts, once the module is built:
 *   - Assigning and swapping a shift, and publishing the week
 *   - Unfilled shifts, which the Staff page already counts
 *   - Attendance against the rota: planned versus clocked
 *   - Cost per shift, which feeds the labour line on Branches
 */

/** The seven day headings, in the catalogue's order. */
const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/**
 * Who works when.
 *
 * Indexed to match DAYS; `null` is a day off. The shift strings are the ones
 * the Staff screen already shows, so a manager reading both sees one rota.
 *
 * The fallback, when there is no session. The API's week comes from
 * ./shifts-data.ts and arrives already in this shape.
 */
const ROTA: Record<string, readonly (string | null)[]> = {
  aziza: ['09–18', '09–18', '09–18', null, '09–18', '10–19', null],
  jasur: ['10–19', '10–19', null, '10–19', '10–19', '12–22', '12–22'],
  nodira: ['10–19', null, '10–19', '10–19', '12–22', '12–22', '12–22'],
  dilshod: ['08–17', '08–17', '08–17', '08–17', '08–17', null, null],
  bekzod: ['08–20', '08–20', null, '08–20', '08–20', '08–20', null],
  malika: [null, '12–21', '12–21', '12–21', '12–21', '12–21', '12–21'],
  sardor: ['07–15', '07–15', '07–15', '07–15', '07–15', null, null],
};

export default async function ShiftsPage() {
  const [nav, t, staff] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.shifts'),
    getTranslations('console.staff'),
  ]);

  /*
   * The API's week when there is a session, this file's when there is not.
   *
   * The fixture rota is keyed by fixture people, so the two are kept together
   * rather than merged: an API row carries its own name and post, and a
   * fixture row looks its post up in the Staff catalogue.  is what
   * tells the cell below which of the two it is holding.
   */
  const live = await getRota();
  const rows =
    live ??
    STAFF.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      days: ROTA[person.id] ?? [],
      translated: true,
    }));

  return (
    <>
      <PageHead title={nav('shifts')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION_PRIMARY}>
          {t('add')}
        </button>
      </PageHead>

      <section className="bg-surface mb-[18px] overflow-hidden rounded-lg border">
        <div className="border-divider flex flex-wrap items-baseline justify-between gap-4 border-b px-5 pt-4 pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{t('rota')}</h3>
          <span data-num className="text-fg-subtle text-xs">
            {t('rotaSub')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="bg-surface text-fg-subtle sticky left-0 border-b px-5 py-[11px] text-left text-xs font-semibold">
                  {t('who')}
                </th>
                {DAYS.map((day, index) => (
                  <th
                    key={day}
                    className={`border-b px-2 py-[11px] text-center text-xs font-semibold ${
                      index >= 5 ? 'text-fg-brand' : 'text-fg-subtle'
                    }`}
                  >
                    {t(day)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((person) => (
                <tr key={person.id}>
                  <td className="border-divider bg-surface sticky left-0 border-b px-5 py-[11px]">
                    <span className="block text-sm font-semibold">{person.name}</span>
                    {/* The role comes from the Staff catalogue, so the rota and
                        the roster cannot disagree about someone's job. */}
                    <span className="text-fg-subtle mt-0.5 block text-xs">
                      {'translated' in person ? staff(person.role) : person.role}
                    </span>
                  </td>

                  {person.days.map((shift, index) => (
                    <td
                      key={`${person.id}-${index}`}
                      className="border-divider border-b px-1.5 py-[7px] text-center"
                    >
                      <span
                        data-num
                        className={`text-2xs inline-block min-w-[54px] rounded-sm border border-transparent px-[7px] py-1.5 font-semibold ${
                          shift ? 'bg-brand-50 text-brand-700' : 'bg-bg-muted text-fg-subtle'
                        }`}
                      >
                        {shift ?? t('off')}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

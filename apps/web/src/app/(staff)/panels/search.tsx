'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { copy, SHARED, TABLE_STATE } from '@restaurant/surfaces/crew/copy';
import { say, type CrewRole, type Lang, type MenuRow } from '@restaurant/surfaces/crew/data';
import type { FoundTable } from '@restaurant/surfaces/crew/live';

import { Som } from '../crew-money';
import { EmptyState, NotWired, SectionLabel } from './bits';

/**
 * The dock's search, as a screen.
 *
 * **Two things, and it says which two.** The design's own handler is a toast
 * reading "order, table, guest, item"; two of those four have an endpoint that
 * can answer a partial word and two do not, so the field searches the menu and
 * the floor and `searchScope` under it names that reach in the reader's own
 * language. A box that silently searches half of what somebody expects is the
 * thing that teaches them to stop using it.
 *
 * **The field writes the URL; the server does the searching.** A client that
 * fetched for itself would need the shift session, which is httpOnly and stays
 * that way — a staff handset is passed between two people and left on a pass,
 * and a token JavaScript can read is a token that leaves in the first piece of
 * injected script. So this component owns one thing: the address bar.
 *
 * `replace` rather than `push`, because every settled keystroke is not a place
 * in history — with `push`, backing out of a search would mean pressing back
 * once per word typed.
 */
export function SearchPanel({
  lang,
  role,
  term,
  dishes,
  tables,
  live,
}: {
  lang: Lang;
  role: CrewRole;
  term: string;
  dishes: readonly MenuRow[];
  tables: readonly FoundTable[];
  /** False when nothing was asked, or when both reads were refused. */
  live: boolean;
}) {
  const s = copy(SHARED, lang);
  const states = copy(TABLE_STATE, lang);
  const router = useRouter();
  const [typed, setTyped] = useState(term);

  /*
   * A quarter second behind the keyboard.
   *
   * Navigating per keystroke would ask the server for "l", "la", "lag", "lagm"
   * — four renders to be told about most of the menu. The guard against
   * re-navigating to where we already are matters as much: without it, the
   * render caused by the last navigation schedules the same navigation again.
   */
  useEffect(() => {
    if (typed === term) return;

    const timer = setTimeout(() => {
      router.replace(
        typed.trim() === '' ? `/crew/${role}/search` : `?q=${encodeURIComponent(typed)}`,
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [typed, term, role, router]);

  const asked = term.trim().length >= 2;
  const nothing = asked && live && dishes.length + tables.length === 0;

  return (
    <section>
      <p className="text-fg-muted mb-2 text-sm leading-normal">{s.searchScope}</p>

      <input
        type="search"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={s.searchPlaceholder}
        aria-label={s.search}
        autoFocus
        autoCorrect="off"
        autoCapitalize="none"
        /* `h-11` is the 44px floor; the 16px font is the coarse-pointer rule in
           `tokens.css`, which stops iOS Safari zooming the page on focus. */
        className="border-border bg-surface mb-4 h-11 w-full rounded-xl border px-3.5 text-sm font-medium"
      />

      {asked && !live ? <NotWired>{s.searchOffline}</NotWired> : null}

      {/* Tables first. Somebody typing while carrying plates is looking for a
          number far more often than for a price. */}
      {tables.length > 0 ? (
        <div className="mb-5">
          <SectionLabel>{s.searchTables}</SectionLabel>

          <ul>
            {tables.map((table) => (
              <li key={table.id}>
                <Link
                  href={`/crew/${role}/table/${table.id}`}
                  data-press
                  className="border-divider flex items-center justify-between gap-3 border-b py-3"
                >
                  <span className="min-w-0">
                    <span data-num className="block truncate text-sm font-semibold">
                      {table.label}
                    </span>
                    <span className="text-fg-subtle text-2xs mt-0.5 block truncate">
                      {table.zone === '' ? table.seats : `${table.zone} · ${table.seats}`}
                    </span>
                  </span>

                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      table.state === 'free'
                        ? 'bg-success-50 text-success-700'
                        : table.state === 'occupied'
                          ? 'bg-danger-50 text-danger-700'
                          : 'bg-warning-50 text-warning-700'
                    }`}
                  >
                    {states[table.state]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dishes.length > 0 ? (
        <div className="mb-5">
          <SectionLabel>{s.searchDishes}</SectionLabel>

          <ul>
            {dishes.map((dish) => (
              <li
                key={dish.id}
                className={`border-divider flex items-center justify-between gap-3 border-b py-3 ${
                  dish.soldOut ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{say(dish.name, lang)}</p>
                  <p className="text-fg-subtle text-2xs mt-0.5 truncate">
                    {say(dish.category, lang)}
                  </p>
                </div>

                {dish.soldOut ? (
                  <span className="bg-danger-50 text-danger-700 flex-none rounded-full px-2.5 py-1 text-[10px] font-bold">
                    {s.soldOut}
                  </span>
                ) : (
                  <Som tiyin={dish.price} lang={lang} className="flex-none text-sm font-semibold" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {nothing ? <EmptyState>{s.searchNothing}</EmptyState> : null}
    </section>
  );
}

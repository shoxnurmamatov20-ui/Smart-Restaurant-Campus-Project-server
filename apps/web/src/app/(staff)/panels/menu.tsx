import { copy, MENU_COPY, SHARED } from '@restaurant/surfaces/crew/copy';
import { MENU_ROWS, say, type Lang, type MenuRow } from '@restaurant/surfaces/crew/data';
import { Som } from '../crew-money';
import { NotWired } from './bits';

/**
 * The menu as a waiter needs it: what it costs, and what has run out.
 *
 * Not an ordering screen — this is the answer to "what's the lag'mon?" asked
 * across a table, and to "is the Caesar still on?" asked on the way to the
 * kitchen. Read-only on purpose: adding items belongs in the order flow, and a
 * menu that quietly puts things on a bill when tapped is a menu nobody dares
 * open in front of a guest.
 *
 * **The stop list is the point.** A dish that is 86'd and offered anyway costs
 * an apology, a re-order and usually a discount. Dimming it is not enough on
 * its own — dimming reads as "less important" as easily as "unavailable" — so
 * the sold-out row also swaps its price for a red chip that says so in words.
 *
 * Which is exactly why the list is read from `GET /api/v1/menu/items` — a
 * waiter holds `menu.view` and nothing else of that module — rather than drawn
 * from the design's six rows. A stop list is a fact about tonight, and a
 * fixture cannot carry one.
 */
export function MenuPanel({
  lang,
  dishes = MENU_ROWS,
  live = false,
}: {
  lang: Lang;
  dishes?: readonly MenuRow[];
  /**
   * Whether the card came from the server.
   *
   * It matters more here than on most screens: a fixture menu shows one dish
   * as sold out and the rest as available, and a waiter who trusts that will
   * offer something the kitchen pulled an hour ago.
   */
  live?: boolean;
}) {
  const t = copy(MENU_COPY, lang);
  const s = copy(SHARED, lang);

  return (
    <section>
      <p className="text-fg-muted mb-2 text-sm leading-normal">{t.intro}</p>

      {live ? null : <NotWired>{s.notWired}</NotWired>}

      <ul>
        {dishes.map((dish) => (
          <li
            key={dish.id}
            className={`border-divider flex items-center justify-between gap-3 border-b py-3 last:border-b-0 ${
              dish.soldOut ? 'opacity-50' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{say(dish.name, lang)}</p>
              <p className="text-fg-subtle text-2xs mt-0.5">{say(dish.category, lang)}</p>
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
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { flash } from '@restaurant/ui';

import { allergenLabels, type GuestCopy } from '@restaurant/surfaces/guest/copy';
import {
  allDishes,
  searchDishes,
  weightLabel,
  type GuestDish,
  type GuestLocale,
  type GuestMenu,
} from '@restaurant/surfaces/guest/menu-data';
import { addLine, cartCount, cartSubtotal, lineImageFrom, useCart } from '@/lib/guest-cart';
import { DISH_ADDONS } from '@restaurant/surfaces/guest/table-data';
import { DishPhoto } from '@/components/dish-photo';

import { fill, som } from '../../../../guest-session';

/**
 * The board a guest scrolls, searches and taps.
 *
 * Client-side because all three of those are per-keystroke and the whole
 * catalogue is already here — a search that went back to the server would spend a
 * café's Wi-Fi on something the phone can do in a frame.
 *
 * **There is a basket, and it stops at the table.** This file used to argue that
 * a basket should not exist at all, because the platform has no public intake
 * endpoint and a guest who pressed send would wait for food nobody was told
 * about. The premise still holds; the conclusion did not. What the design asks
 * for — and what the catalogue has had copy for all along — is a basket that
 * feeds the **status screen**: `qr.status.yourOrder`, `qr.status.empty` ("dishes
 * you add appear here") and `qr.status.addMore` were written for exactly that.
 *
 * So a guest builds their order on their own phone and the status screen is what
 * they show the waiter. Nothing here claims the kitchen has been told, because
 * nothing has told it. The day `POST /v1/public/orders` exists, the send button
 * on the status screen starts talking to it and no other screen changes.
 */
export function GuestMenuBoard({
  menu,
  locale,
  copy,
  back,
  basket,
  statusHref,
}: {
  menu: GuestMenu;
  locale: GuestLocale;
  copy: GuestCopy;
  back: string;
  /**
   * Which basket this is — `slug:table`, not the phone.
   *
   * Two people at table 14 scanning two phones are ordering one order, so the
   * key is the table. It is passed in rather than derived here because the
   * route already knows both halves and this component should not parse a URL.
   */
  basket: string;
  /** Where the bar goes: the status screen, which is what the waiter is shown. */
  statusHref: string;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [open, setOpen] = useState<GuestDish | null>(null);

  const cart = useCart(basket);
  const inBasket = cartCount(cart);

  /* How many of one dish are in the basket, across however many lines it was
     added on — two teas with different notes are two lines and one answer. */
  const countOf = (dishId: string) =>
    cart.lines
      .filter((line) => line.dishId === dishId)
      .reduce((sum, line) => sum + line.quantity, 0);

  const everything = useMemo(() => allDishes(menu), [menu]);

  /*
   * Search wins over the category chips, and the chips grey out while it runs.
   *
   * Two filters that both narrow, applied together, produce the screen where a
   * guest types "osh", sees nothing, and cannot tell that a category chip three
   * taps ago is the reason. Searching is the stronger intent — it was typed — so
   * it replaces rather than intersects.
   */
  const searching = query.trim() !== '';

  const shown = useMemo(() => {
    if (searching) return searchDishes(everything, query);
    if (categoryId === null) return everything;

    return everything.filter((dish) => dish.categoryId === categoryId);
  }, [searching, query, categoryId, everything]);

  const count = shown.length;

  return (
    <>
      <header data-safe-top className="px-[var(--guest-gutter)] pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
              {copy.qr.menu.title}
            </h1>
            <p data-num className="text-fg-subtle mt-0.5 text-xs">
              {searching
                ? fill(copy.qr.menu.countFor, { count, query: query.trim() })
                : fill(copy.qr.menu.count, { count })}
            </p>
          </div>

          <Link
            href={back}
            aria-label={copy.qr.dish.back}
            className="border-border grid h-[var(--tap-min)] w-[var(--tap-min)] flex-none place-items-center rounded-md border text-lg"
          >
            ‹
          </Link>
        </div>

        {!menu.live ? (
          <p
            role="status"
            className="bg-warning-50 text-warning-700 mt-3 rounded-md px-3 py-2 text-xs font-medium"
          >
            {copy.qr.common.offline}
          </p>
        ) : null}

        <div className="relative mt-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.qr.menu.searchPlaceholder}
            aria-label={copy.qr.menu.search}
            className="border-border bg-surface h-12 w-full rounded-md border pr-11 pl-3.5 text-base"
          />

          {searching ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={copy.qr.menu.clear}
              className="text-fg-subtle absolute top-0 right-0 grid h-12 w-11 place-items-center text-lg"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {/*
       * The category rail scrolls sideways and its chips stay 44px tall even
       * though they read as small — the design's own dimension, and the reason is
       * that this is the control a guest hits most while holding a phone in one
       * hand at a table.
       */}
      <nav
        aria-label={copy.qr.menu.title}
        className={`flex gap-1.5 overflow-x-auto px-[var(--guest-gutter)] pb-3 ${
          searching ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
          {copy.qr.menu.all}
        </Chip>

        {menu.categories.map((category) => (
          <Chip
            key={category.id}
            active={category.id === categoryId}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </Chip>
        ))}
      </nav>

      <div className="flex-1 px-[var(--guest-gutter)] pb-8">
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-md font-semibold">{copy.qr.menu.empty}</p>
            <p className="text-fg-subtle text-sm leading-normal">{copy.qr.menu.emptySub}</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryId(null);
              }}
              className="text-acc mt-2 h-[var(--tap-min)] text-sm font-semibold underline"
            >
              {copy.qr.menu.showAll}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {shown.map((dish) => (
              <li key={dish.id}>
                {/*
                 * The sold-out row — `Mehmon.dc.html:286-311`.
                 *
                 * Dimmed to 55%, chipped, and the add button taken away rather
                 * than the dish removed: a guest who came for the somsa is owed
                 * the word "finished". The chip carries the *return* line, which
                 * the copy catalogue has had all along and nothing rendered —
                 * "back tomorrow" is the whole point of telling somebody at all.
                 */}
                <div
                  className={`border-divider flex items-start gap-3 border-b py-3.5 last:border-0 ${
                    dish.soldOut ? 'opacity-55' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(dish)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-md leading-snug font-semibold">{dish.name}</span>
                        {dish.vegetarian ? <Badge tone="success">{copy.qr.menu.veg}</Badge> : null}
                        {dish.spicy ? <Badge tone="danger">{copy.qr.menu.hot}</Badge> : null}
                        {dish.soldOut ? <Badge tone="danger">{copy.qr.menu.soldOut}</Badge> : null}
                      </span>

                      {dish.soldOut ? (
                        <span className="text-danger-700 mt-1 block text-sm leading-normal">
                          {copy.qr.menu.soldOutNote}
                        </span>
                      ) : dish.description !== '' ? (
                        <span className="text-fg-subtle mt-1 line-clamp-2 block text-sm leading-normal">
                          {dish.description}
                        </span>
                      ) : null}

                      <span data-num className="text-fg mt-1.5 block text-sm font-semibold">
                        {som(dish.price, locale)}
                        {weightLabel(dish) !== null ? (
                          <span className="text-fg-subtle font-normal"> · {weightLabel(dish)}</span>
                        ) : null}
                      </span>

                      {/*
                       * The allergen warning, on the row — `Mehmon.dc.html:197-202`.
                       *
                       * `GuestDish.allergens` has always been a list rather than
                       * a sentence precisely so it could be rendered twice at
                       * two lengths, and the short one was never drawn: a guest
                       * who cannot eat egg had to open every dish to find out
                       * which ones to avoid.
                       */}
                      {dish.allergens.length === 0 ? null : (
                        <span className="text-warning-600 mt-1.5 flex items-center gap-1.5 text-[11px]">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            aria-hidden
                            className="flex-none"
                          >
                            <path d="M12 8v5M12 17h0" />
                            <circle cx="12" cy="12" r="9" />
                          </svg>
                          {dish.allergens
                            .map((slug) => allergenLabels[slug]?.[locale] ?? slug)
                            .join(', ')}
                        </span>
                      )}
                    </span>

                    {/*
                     * 78px, from the design. The slot is drawn even with no image: a
                     * list where some rows have a square and some do not reads as
                     * broken, rather than as a menu that photographs its best-sellers.
                     */}
                    <span className="bg-bg-muted grid size-[78px] flex-none place-items-center overflow-hidden rounded-md">
                      {/*
                       * `sizes="78px"` — the box, not the viewport. The browser
                       * fetches `thumb` (160px) for it at 2× and never the
                       * 1600px file this row used to ask for: forty squares, of
                       * which a guest sees four, on the guest's own data. Lazy
                       * by default, and why it is a plain `<img>` rather than
                       * `next/image` is explained once, on `DishPhoto`.
                       */}
                      <DishPhoto
                        image={dish.image}
                        alt=""
                        sizes="78px"
                        className="size-full"
                        fallback={
                          <span aria-hidden className="text-fg-subtle text-2xl">
                            ▧
                          </span>
                        }
                      />
                    </span>
                  </button>

                  {/*
                   * One tap adds one, from the row. The sheet is still there for
                   * a guest who wants the allergens or a note — but adding a
                   * second tea should not cost two screens.
                   */}
                  {dish.soldOut ? (
                    /* No add button on a dish the kitchen has run out of. The
                       space is held so the rows above and below do not shift. */
                    <span aria-hidden className="size-[var(--tap-min)] flex-none" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        addLine(basket, {
                          dishId: dish.id,
                          name: dish.name,
                          image: lineImageFrom(dish),
                          unitPrice: dish.price,
                          quantity: 1,
                          options: [],
                          note: '',
                        });
                        /*
                         * The design flashes on every add — `Mehmon.dc.html:820`.
                         * The row's `+` gives no other feedback: the basket bar
                         * is pinned to the bottom of a scrolled list, so a
                         * thumb tap two thirds up the menu looked like nothing
                         * happened and got pressed twice.
                         */
                        flash(fill(copy.qr.menu.added, { name: dish.name }));
                      }}
                      aria-label={`${copy.qr.dish.add} ${dish.name}`}
                      /* Filled once there is one in the basket, and it shows
                         how many — `Mehmon.dc.html:807-812`. A plus that looks
                         identical before and after the tap is a plus that gets
                         tapped twice. */
                      className={`grid size-[var(--tap-min)] flex-none place-items-center self-center rounded-full text-lg font-semibold ${
                        countOf(dish.id) > 0
                          ? 'bg-acc text-white'
                          : 'border-border text-fg border bg-transparent'
                      }`}
                    >
                      <span data-num>{countOf(dish.id) > 0 ? countOf(dish.id) : '+'}</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open !== null ? (
        <DishSheet
          dish={open}
          locale={locale}
          copy={copy}
          basket={basket}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {/*
       * The bar the design pins to the bottom once there is something to see.
       * Absent when the basket is empty — an empty bar sits in the thumb zone
       * of a phone and says nothing.
       */}
      {inBasket > 0 ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3"
          style={{
            /* `p-3` is 12px and the home indicator is 34px, so on a phone the
               pill the design floats above the fold ends up half under it — on
               the one surface that is only ever opened on a phone. */
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <Link
            href={statusHref}
            className="bg-acc pointer-events-auto mx-auto flex h-14 max-w-[var(--phone-measure)] items-center justify-center gap-3 rounded-full px-6 text-sm font-semibold text-white"
          >
            <span>{copy.qr.menu.viewOrder}</span>
            <span aria-hidden>·</span>
            <span data-num>{inBasket}</span>
            <span aria-hidden>·</span>
            <span data-num>{som(cartSubtotal(cart), locale)}</span>
          </Link>
        </div>
      ) : null}
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`rounded-pill h-[var(--tap-min)] flex-none px-3.5 text-sm font-semibold ${
        active ? 'bg-acc text-white' : 'bg-bg-muted text-fg-muted'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * How long a note to the kitchen may be — `Mehmon.dc.html:1044`, `slice(0, 90)`.
 *
 * Ninety, and the counter counts up to it rather than down from it, because
 * that is what the design draws: `0 / 90`. A bare "83" beside a box tells a
 * guest nothing about how much room is left.
 */
const NOTE_MAX = 90;

function Badge({ tone, children }: { tone: 'success' | 'danger'; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-pill text-2xs px-1.5 py-0.5 font-bold ${
        tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * One dish, opened.
 *
 * A sheet rather than a page: a guest comparing two dishes taps back and forth,
 * and a navigation each way loses the place in a list they scrolled to.
 *
 * The allergen block is why this screen exists at all. A menu row gets skimmed; an
 * allergen line has to be read, by somebody deciding whether they can eat. So it
 * is a block with a heading rather than small type in a row — and a dish with none
 * says so out loud, because silence under a heading called "Allergens" answers a
 * health question with nothing.
 *
 * **The add-ons are the kitchen's own, when the kitchen has any.**
 * `Mehmon.dc.html:288-301` draws a group — "extra meat + 8 000" and two more —
 * and this screen used to draw the design's four keyed by word, because the
 * note here said `GET /api/v1/public/menu` published no modifier groups. It
 * always did: they are eager-loaded per dish precisely so opening one costs no
 * second request, and `guest/menu-data.ts` now maps them onto `GuestDish.groups`
 * with the catalogue's own numeric ids.
 *
 * That difference is not cosmetic. `POST /api/v1/public/tables/{table}/order`
 * prices every choice through `App\Contracts\Menu\MenuCatalog` and refuses a
 * basket carrying one it never offered, so a word where an id belongs does not
 * quote the guest a wrong number — it loses them the whole order. A live dish
 * therefore draws the kitchen's questions and sends the kitchen's ids; only a
 * dish with no groups at all falls back to `DISH_ADDONS`, and a fixture menu is
 * the only place that now happens.
 *
 * The group's own rules are enforced at the tap as well as on the server:
 * `multi: false` replaces rather than adds, and `max` stops the list. Both are
 * the kitchen's numbers — the point of doing it here is that a guest finds out
 * while choosing rather than when the order is refused.
 */
function DishSheet({
  dish,
  locale,
  copy,
  basket,
  onClose,
}: {
  dish: GuestDish;
  locale: GuestLocale;
  copy: GuestCopy;
  basket: string;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<readonly string[]>([]);

  const addonLabel = copy.qr.dish.addonList;

  /*
   * The kitchen's questions, or the design's four when it asks none.
   *
   * One shape for both so everything below draws once: an id, a label already
   * in the reader's language, and a delta in tiyin. What separates them is
   * `sendable` — a catalogue id can go to the ordering endpoint and a word
   * cannot, and the basket has to carry that distinction rather than rediscover
   * it later.
   */
  const groups: readonly {
    id: string;
    title: string | null;
    multi: boolean;
    min: number;
    max: number;
    choices: readonly { id: string; name: string; price: number }[];
  }[] = dish.groups ?? [
    {
      id: 'addons',
      title: null,
      multi: true,
      min: 0,
      max: DISH_ADDONS.length,
      choices: DISH_ADDONS.map((addon) => ({
        id: addon.key,
        name: addonLabel[addon.key],
        price: addon.price,
      })),
    },
  ];

  const sendable = dish.groups !== undefined;

  const chosen = groups.flatMap((group) =>
    group.choices.filter((choice) => picked.includes(choice.id)),
  );

  /* The dish price is the API's and is never computed. The choices are added to
     it at their own whole deltas, which is the one arithmetic this sheet does
     and the one a guest can check against the printed menu. A delta is signed:
     "no onion" is worth nothing and a small cup can be worth less than zero. */
  const unitPrice = dish.price + chosen.reduce((sum, choice) => sum + choice.price, 0);

  /**
   * Take or drop one choice, respecting the group's own rules.
   *
   * `multi: false` replaces rather than adds — a size is one answer, and a
   * second one would be a line the server refuses. `max` simply stops: silently
   * dropping the oldest pick would move a tick the guest is looking at.
   */
  const toggle = (group: (typeof groups)[number], choiceId: string) =>
    setPicked((current) => {
      if (current.includes(choiceId)) return current.filter((id) => id !== choiceId);

      const mine = group.choices.map((choice) => choice.id);
      const others = current.filter((id) => !mine.includes(id));
      const same = current.filter((id) => mine.includes(id));

      if (!group.multi || group.max <= 1) return [...others, choiceId];

      return same.length >= group.max ? current : [...current, choiceId];
    });

  /*
   * A required question with no answer.
   *
   * The button is held rather than the tap refused, because the guest has not
   * done anything wrong yet — they have simply not finished. The server refuses
   * the same basket, and finding out here costs nothing.
   */
  const unanswered = groups.some(
    (group) =>
      group.min > 0 &&
      group.choices.filter((choice) => picked.includes(choice.id)).length < group.min,
  );

  return (
    <div data-fade className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label={copy.qr.dish.back}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div
        data-sheet
        className="bg-surface relative flex max-h-[88dvh] w-full max-w-[var(--phone-measure)] flex-col overflow-hidden rounded-t-[18px]"
      >
        {/*
         * The photograph band — `dc.html:253-259`, 200px with the back control
         * floating on it. The sheet opened straight onto a heading, which on a
         * menu of forty rows gave a guest no way of telling whether they had
         * opened the right dish.
         */}
        <div className="bg-bg-muted relative h-[200px] flex-none">
          {/*
           * The sheet is the phone's own column — 390px at most — so `sizes`
           * says so: a 3× phone asks for 1170 and gets `full`, a 2× one gets
           * it too, and neither downloads a size the band cannot show. `eager`
           * because the sheet has just been opened and this is the first
           * thing in it.
           */}
          <DishPhoto
            image={dish.image}
            alt=""
            sizes="(min-width: 390px) 390px, 100vw"
            eager
            className="size-full"
            fallback={
              <span className="text-fg-disabled grid size-full place-items-center">
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="1.6" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </span>
            }
          />

          <button
            type="button"
            onClick={onClose}
            aria-label={copy.qr.dish.back}
            className="absolute top-4 left-4 grid size-9 place-items-center rounded-xl backdrop-blur"
            style={{ background: 'rgba(255,255,255,.9)' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--n-900)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-[var(--guest-gutter)] py-5">
          <h2 className="font-display text-2xl leading-tight font-bold tracking-tight">
            {dish.name}
          </h2>

          <p className="mt-1.5 flex items-center gap-2.5">
            <span data-num className="text-lg font-semibold">
              {som(dish.price, locale)}
            </span>
            {weightLabel(dish) === null ? null : (
              <>
                <span aria-hidden className="bg-border h-3 w-px" />
                <span data-num className="text-fg-subtle text-sm">
                  {weightLabel(dish)}
                </span>
              </>
            )}
          </p>

          {dish.description !== '' ? (
            <>
              <h3 className="text-fg-subtle text-2xs tracking-caps mt-5 font-semibold uppercase">
                {copy.qr.dish.ingredients}
              </h3>
              <p className="mt-1.5 text-sm leading-normal">{dish.description}</p>
            </>
          ) : null}

          <h3 className="text-fg-subtle text-2xs tracking-caps mt-5 font-semibold uppercase">
            {copy.qr.dish.allergens}
          </h3>

          {dish.allergens.length === 0 ? (
            <p className="text-fg-subtle mt-1.5 text-sm">{copy.qr.dish.noAllergens}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {dish.allergens.map((slug) => (
                <li
                  key={slug}
                  className="bg-warning-50 text-warning-700 rounded-pill px-2.5 py-1 text-xs font-semibold"
                >
                  {allergenLabels[slug]?.[locale] ?? slug}
                </li>
              ))}
            </ul>
          )}

          {/*
           * The dish sheet's questions — `Mehmon.dc.html:281-300`.
           *
           * A round tick where the kitchen asks for one answer and a square one
           * where it takes several, because the two are different promises: a
           * guest who has ticked "Katta" and taps "O'rta" expects the first to
           * let go. A free choice prints an em dash rather than `+0` — the
           * design's own treatment, and right for the reason it was drawn:
           * "no tail fat" is an instruction to the kitchen, not a purchase.
           */}
          {groups.map((group) => {
            const mine = group.choices.filter((choice) => picked.includes(choice.id)).length;
            const full = group.multi && group.max > 1 && mine >= group.max;

            return (
              <section key={group.id}>
                <div className="mt-5 flex items-baseline justify-between gap-3">
                  <h3 className="text-md font-semibold">{group.title ?? copy.qr.dish.addons}</h3>
                  {group.min > 0 ? null : (
                    <span className="text-fg-subtle text-xs">{copy.qr.dish.optional}</span>
                  )}
                </div>

                <ul className="mt-2.5 flex flex-col gap-2">
                  {group.choices.map((choice) => {
                    const on = picked.includes(choice.id);

                    return (
                      <li key={choice.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          /* Past the ceiling, the unticked options go inert
                             rather than disappearing: a list that shortened as
                             it was used would move the row under a thumb. */
                          disabled={full && !on}
                          onClick={() => toggle(group, choice.id)}
                          className={`flex min-h-[var(--tap-min)] w-full items-center gap-3 rounded-xl border px-3.5 text-left disabled:opacity-45 ${
                            on ? 'border-acc bg-acc-soft' : 'border-border bg-surface'
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`grid size-5 flex-none place-items-center border-[1.6px] text-[11px] font-bold text-white ${
                              group.multi && group.max > 1 ? 'rounded-[6px]' : 'rounded-full'
                            } ${on ? 'border-acc bg-acc' : 'border-border-strong'}`}
                          >
                            {on ? '✓' : ''}
                          </span>
                          <span className="flex-1 text-sm font-medium">{choice.name}</span>
                          <span data-num className="text-fg-muted flex-none text-[13px]">
                            {choice.price === 0 ? '—' : `+${som(choice.price, locale)}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {/* A note to the kitchen, which is the thing a phone can say and a
              waiter's memory cannot. Two rows and a counter, per the design: a
              note is a sentence, and ninety characters is what the ticket
              prints before it starts cutting words off at the pass. */}
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <h3 className="text-md font-semibold">{copy.qr.dish.note}</h3>
            <span data-num className="text-fg-subtle text-xs">
              {note.length} / {NOTE_MAX}
            </span>
          </div>

          <textarea
            value={note}
            maxLength={NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.qr.dish.notePlaceholder}
            rows={2}
            className="bg-surface border-border mt-2.5 w-full resize-none rounded-xl border px-3.5 py-3 text-sm leading-normal"
          />
        </div>

        <footer
          data-sticky-bottom
          className="border-border flex flex-none items-center gap-3 border-t px-[var(--guest-gutter)] pt-3 pb-3"
        >
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={() => setQuantity((n) => Math.max(1, n - 1))}
              aria-label={copy.qr.dish.decrease}
              className="border-border grid size-[var(--tap-min)] place-items-center rounded-md border text-lg font-semibold"
            >
              −
            </button>
            <span data-num className="w-8 text-center text-lg font-bold">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((n) => n + 1)}
              aria-label={copy.qr.dish.increase}
              className="border-border grid size-[var(--tap-min)] place-items-center rounded-md border text-lg font-semibold"
            >
              +
            </button>
          </div>

          {/* The number moves with the stepper — nobody should be multiplying
              a price by three while deciding. */}
          <button
            type="button"
            disabled={unanswered}
            onClick={() => {
              addLine(basket, {
                dishId: dish.id,
                name: dish.name,
                image: lineImageFrom(dish),
                unitPrice,
                quantity,
                /* The choices travel with the line: a basket row reading just
                   "Plov" beside a price with 22 000 of qazi in it is a row the
                   kitchen and the guest read differently. */
                options: chosen.map((choice) => choice.name),
                /*
                 * And the ids beside the words, but only when they are the
                 * catalogue's. A fixture key sent here would be refused for the
                 * whole basket — `MenuCatalog` prices every choice — so an
                 * unsendable pick stays a label the guest can read and nothing
                 * more.
                 */
                modifierIds: sendable ? chosen.map((choice) => choice.id) : [],
                note,
              });
              /* One or many — `Mehmon.dc.html:1058` counts it out, because a
                 sheet closing is the only other sign that four teas landed. */
              flash(
                quantity === 1
                  ? fill(copy.qr.menu.added, { name: dish.name })
                  : fill(copy.qr.menu.addedMany, { count: quantity, name: dish.name }),
              );
              onClose();
            }}
            className="bg-acc h-[var(--tap-lg)] flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-45"
          >
            {copy.qr.dish.add} {som(unitPrice * quantity, locale)}
          </button>
        </footer>
      </div>
    </div>
  );
}

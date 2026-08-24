'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { flash } from '@restaurant/ui';

import { DishPhoto } from '@/components/dish-photo';
import { useCart } from '../../cart-store';
import { copy, DISH, HOME, MENU, SHARED } from '@restaurant/surfaces/customer/copy';
import { CustomerDock } from '../../customer-dock';
import {
  DEFAULT_PORTION,
  MODIFIERS,
  PORTIONS,
  say,
  type Dish,
  type Lang,
  type Modifier,
  type ModifierGroup,
} from '@restaurant/surfaces/customer/data';
import {
  DEMO_MENU,
  dishById,
  dishesOf,
  MENU_POLL_MS,
  searchDishes,
  type CustomerMenu,
} from '@restaurant/surfaces/customer/live';
import { Money, somFigure, somText } from '../../money';

/**
 * The menu a customer orders from.
 *
 * Search beats the category chips rather than intersecting with them — two
 * filters that both narrow produce the screen where somebody types "osh", sees
 * nothing, and has no way to tell that a chip they tapped a minute ago is why.
 * Typing is the stronger intent, so it replaces.
 */
export function MenuBoard({
  lang,
  initialCategory,
  initialDish,
  menu = DEMO_MENU,
}: {
  lang: Lang;
  initialCategory: string | null;
  initialDish: string | null;
  /**
   * The catalogue, from `GET /api/v1/public/menu` — see `customer-server.ts`.
   *
   * Defaulted to the fixtures rather than required, because this component is
   * also the design gallery's specimen and a screen that could not render
   * without a server would be a screen nobody could look at.
   */
  menu?: CustomerMenu;
}) {
  const t = copy(MENU, lang);
  const s = copy(SHARED, lang);
  // `seeAll` is the same word the home screen puts above the category grid —
  // one label for one idea rather than a second key that says "Barchasi" too.
  const everything = copy(HOME, lang).seeAll;
  const cart = useCart();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategory);
  const [open, setOpen] = useState<Dish | null>(() => dishById(menu, initialDish));
  const searching = query.trim() !== '';

  /*
   * Ask again every minute, which is how a stop-list reaches a customer.
   *
   * The 86 sheet broadcasts on `branch.{id}.stoplist` — a private channel, and
   * rightly closed to strangers: there is no version of "let every customer in
   * the city subscribe" that ends well. So a guest surface finds out by asking,
   * and the interval matches the endpoint's own 60-second cache TTL, so a poll
   * that lands early costs one ETag round trip and no query.
   *
   * Only when the menu is live. Re-fetching fixtures is a request that cannot
   * change anything.
   */
  const router = useRouter();

  useEffect(() => {
    if (!menu.live) return;

    const timer = setInterval(() => router.refresh(), MENU_POLL_MS);

    return () => clearInterval(timer);
  }, [menu.live, router]);

  // Both filters live in `@restaurant/surfaces` so the phone applies the same
  // rules to the same payload — a search that matched here and not there would
  // be two menus wearing one name.
  const shown = useMemo(
    () =>
      searching
        ? // The heading counts too — `Mijoz ilovasi:877` searches the category's
          // three names alongside the dish's, so "Ichimliklar" returns the drinks.
          searchDishes(menu.dishes, query, menu.categories)
        : dishesOf(menu.dishes, categoryId),
    [searching, query, categoryId, menu.dishes],
  );

  return (
    <>
      <main className="flex-1 pb-6">
        <header
          className="px-[var(--phone-gutter)] pt-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
            {t.heading}
          </h1>
          <p data-num className="text-fg-subtle mt-0.5 text-xs">
            {shown.length} {searching ? t.countFound : t.countOne}
          </p>

          <div className="relative mt-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={s.search}
              aria-label={s.search}
              className="border-border bg-surface h-12 w-full rounded-md border pr-11 pl-3.5 text-base"
            />

            {searching ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t.clearSearch}
                className="text-fg-subtle absolute top-0 right-0 grid h-12 w-11 place-items-center text-lg"
              >
                ×
              </button>
            ) : null}
          </div>
        </header>

        <nav
          aria-label={t.heading}
          className={`mt-3 flex gap-1.5 overflow-x-auto px-[var(--phone-gutter)] pb-1 ${
            searching ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
            {everything}
          </Chip>

          {menu.categories.map((category) => (
            <Chip
              key={category.id}
              active={category.id === categoryId}
              onClick={() => setCategoryId(category.id)}
            >
              {say(category.name, lang)}
            </Chip>
          ))}
        </nav>

        <div className="mt-2 px-[var(--phone-gutter)]">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-md font-semibold">{t.noHitsHeading}</p>
              <p className="text-fg-subtle text-sm leading-normal">{t.noHitsBody}</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {shown.map((dish) => (
                <li key={dish.id}>
                  {/*
                   * A sold-out dish still opens.
                   *
                   * The row used to be `disabled`, which put the one screen
                   * that explains the state behind a control that refused to be
                   * pressed — `DISH.soldOutBody` ("the kitchen has run out;
                   * it is back tomorrow") had been written and could not be
                   * reached. The add button inside is what is disabled, which
                   * is the thing that actually cannot happen.
                   */}
                  <div
                    className={`border-divider flex items-start gap-3 border-b py-3.5 last:border-0 ${
                      dish.soldOut ? 'opacity-55' : ''
                    }`}
                  >
                    {/*
                     * The 74px photograph the design puts on every row
                     * (`dc.html:281`). It opens the dish, which is what a
                     * picture on a menu is for.
                     *
                     * `sizes="74px"` — the box, so the browser fetches `thumb`
                     * (160px) at 2× and never the 1600px file for thirty rows
                     * on mobile data. The button keeps the `.c-shot` tint
                     * underneath: a fixture dish has no `image` at all and a
                     * live one without a photograph has null, and both are the
                     * empty tinted square the design draws.
                     */}
                    <button
                      type="button"
                      onClick={() => setOpen(dish)}
                      aria-label={say(dish.name, lang)}
                      className="c-shot border-border size-[74px] flex-none rounded-md border"
                    >
                      <DishPhoto
                        image={dish.image ?? null}
                        alt=""
                        sizes="74px"
                        className="size-full"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpen(dish)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-md leading-snug font-semibold">
                          {say(dish.name, lang)}
                        </span>
                        {/* The danger ramp, not the neutral one. "Sold out" is
                            an answer a customer has to notice; a grey chip on a
                            grey row is the same weight as the weight label. */}
                        {dish.soldOut ? (
                          <span className="bg-danger-50 text-danger-700 rounded-pill text-2xs px-1.5 py-0.5 font-bold">
                            {s.soldOut}
                          </span>
                        ) : null}
                      </span>

                      <span className="text-fg-subtle mt-1 line-clamp-2 block text-sm leading-normal">
                        {say(dish.description, lang)}
                      </span>

                      <span className="mt-1.5 flex items-center gap-2">
                        <Money tiyin={dish.price} lang={lang} />
                        {/* Nothing at all when the dish has no rating. There is
                            no per-dish rating endpoint — CRM stores feedback
                            about a visit, not about a plate — and "★  (0)" next
                            to a price reads as a bad dish rather than as a
                            missing column. */}
                        {dish.rating === '' ? null : (
                          <span data-num className="text-fg-subtle text-xs">
                            ★ {dish.rating} ({dish.reviews})
                          </span>
                        )}
                      </span>
                    </button>

                    {/*
                     * Add without opening the dish — `m.add` in the design,
                     * which flashes and never navigates. A menu where every
                     * line costs two screens is a menu somebody abandons at the
                     * third dish; the sheet is for the guest who wants a
                     * different size or no onion, not for everybody.
                     *
                     * The default configuration is the one the sheet opens
                     * with: the regular portion, no extras, no note. So a dish
                     * added from here and the same dish added from the sheet
                     * land on one basket line rather than two.
                     */}
                    {dish.soldOut ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          cart.add({
                            dishId: dish.id,
                            portionId: DEFAULT_PORTION,
                            modifierIds: [],
                            quantity: 1,
                            note: '',
                          });
                          flash(`${say(dish.name, lang)} · ${t.addedToCart}`);
                        }}
                        aria-label={`${say(dish.name, lang)} +`}
                        className="bg-acc mt-1 grid size-8.5 flex-none place-items-center rounded-md text-lg leading-none font-semibold text-white"
                      >
                        +
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {open !== null ? (
        <DishSheet
          dish={open}
          lang={lang}
          onClose={() => setOpen(null)}
          onAdd={(line) => {
            cart.add(line);
            setOpen(null);
            /*
             * The product's own toast — `flash()` in `packages/ui`, bottom
             * centre, 2.8s, one at a time. This screen had rolled its own,
             * which is how a design system ends up with two toasts that agree
             * about nothing.
             */
            flash(`${say(open.name, lang)} · ${copy(DISH, lang).added}`);
          }}
        />
      ) : null}

      <CustomerDock lang={lang} cartCount={cart.count} />
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
 * One dish, with the three questions the design asks about it.
 *
 * Size, extras, and a note for the kitchen — in that order, because the first two
 * change the price and the third does not. The running total is at the bottom
 * beside the button, so a guest adding three extras watches the number they are
 * about to agree to rather than discovering it in the basket.
 *
 * The arithmetic here is a preview of ONE line, not of a bill: dish + size delta
 * + extras. What the order comes to — service, VAT, delivery, rounding — is
 * `pricing.ts` on the cart screen, in one place, mirroring the server.
 */
function DishSheet({
  dish,
  lang,
  onClose,
  onAdd,
}: {
  dish: Dish;
  lang: Lang;
  onClose: () => void;
  onAdd: (line: {
    dishId: string;
    portionId: string;
    modifierIds: readonly string[];
    quantity: number;
    note: string;
  }) => void;
}) {
  const t = copy(DISH, lang);
  const s = copy(SHARED, lang);

  const [portionId, setPortionId] = useState(DEFAULT_PORTION);
  const [modifierIds, setModifierIds] = useState<readonly string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  /*
   * The kitchen's own sheet when there is one, the design's when there is not.
   *
   * `dish.groups` arrives on a LIVE dish and carries the real option ids —
   * numbers, from `menu.modifier_options`. `PORTIONS` and `MODIFIERS` are three
   * sizes and five extras invented for the demo, keyed by word, and the
   * ordering endpoint prices every choice through the catalogue and refuses one
   * it never offered. So they are not two styles of the same control: one can
   * be ordered and the other cannot.
   *
   * A live dish therefore has NO size buttons unless the kitchen offers a size
   * group. That is correct rather than missing — a size is a modifier on this
   * platform, priced by the kitchen — and it is why the cart stops adding
   * `portion.delta` the moment a dish carries groups.
   */
  const groups = dish.groups ?? null;

  const chosen: readonly Modifier[] =
    groups === null
      ? MODIFIERS.filter((modifier) => modifierIds.includes(modifier.id))
      : groups.flatMap((group) =>
          group.choices.filter((choice: Modifier) => modifierIds.includes(choice.id)),
        );

  const portion = groups === null ? PORTIONS.find((entry) => entry.id === portionId) : undefined;
  const unit =
    dish.price + (portion?.delta ?? 0) + chosen.reduce((sum, modifier) => sum + modifier.price, 0);

  /**
   * Take or drop one choice, respecting the group's own rules.
   *
   * `multi: false` replaces rather than adds — a size is one answer, and a
   * checkbox where the kitchen asked a radio produces a line the server
   * refuses. `max` stops the list. Both are the kitchen's numbers, enforced
   * again server-side; this is so the guest finds out at the tap rather than at
   * the checkout.
   */
  const toggle = (group: ModifierGroup, choiceId: string) =>
    setModifierIds((current) => {
      if (current.includes(choiceId)) return current.filter((id) => id !== choiceId);

      const mine = group.choices.map((choice) => choice.id);
      const others = current.filter((id) => !mine.includes(id));
      const same = current.filter((id) => mine.includes(id));

      if (!group.multi) return [...others, choiceId];

      return same.length >= group.max ? current : [...current, choiceId];
    });

  /*
   * A screen, not a bottom sheet — `Mijoz ilovasi.dc.html:300-363`.
   *
   * The design gives a dish the whole viewport with a 236px photograph at the
   * top of it, and the reason is not aesthetics: the sheet capped at 90dvh put
   * the portion picker, three add-ons, a note field and the price footer into
   * roughly 300px of scrollable area on a phone, above a strip of dimmed menu
   * nobody could use. A screen is also what "back" means to a thumb.
   */
  return (
    <div data-sheet className="bg-surface fixed inset-0 z-50 flex flex-col">
      <div className="c-shot relative h-[236px] flex-none" aria-hidden={false}>
        {/*
         * The screen is `fixed inset-0`, so the band is the viewport and
         * `sizes` is `100vw`: a 3× phone gets `full`, a 1× laptop gets `card`.
         * `eager` because the screen has just been opened and this is the
         * first thing on it. No photograph leaves the `.c-shot` tint, as
         * before; the back control floats above either.
         */}
        <DishPhoto image={dish.image ?? null} alt="" sizes="100vw" eager className="size-full" />

        <button
          type="button"
          onClick={onClose}
          aria-label={s.back}
          className="text-fg absolute top-3 left-4 grid size-9 place-items-center rounded-full shadow-md"
          style={{ background: 'rgba(255,255,255,.92)' }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-[var(--phone-gutter)] py-4.5">
          <h2 className="font-display text-2xl leading-tight font-bold tracking-tight">
            {say(dish.name, lang)}
          </h2>

          <p className="mt-1.5 flex items-center gap-1.5">
            {/* The star, its number and the separator all go together when the
                dish is unrated — a lone bullet before the calories is the
                punctuation of a sentence whose first half is missing. */}
            {dish.rating === '' ? null : (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="var(--rating-star)"
                  aria-hidden
                >
                  <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z" />
                </svg>
                <span data-num className="text-sm font-semibold">
                  {dish.rating}
                </span>
                <span data-num className="text-fg-subtle text-sm">
                  ({dish.reviews} {t.ratings})
                </span>
                <span aria-hidden className="bg-fg-disabled size-[3px] rounded-full" />
              </>
            )}
            <span data-num className="text-fg-subtle text-sm">
              {dish.calories} kcal
            </span>
          </p>

          <p className="mt-3 text-sm leading-normal">{say(dish.description, lang)}</p>

          {groups === null ? (
            <Field label={t.size}>
              <div className="flex gap-1.5">
                {PORTIONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setPortionId(entry.id)}
                    aria-current={entry.id === portionId}
                    className={`min-h-[var(--tap-min)] flex-1 rounded-md px-2 text-xs font-semibold ${
                      entry.id === portionId ? 'bg-acc text-white' : 'bg-bg-muted text-fg-muted'
                    }`}
                  >
                    {say(entry.name, lang)}
                    {/* "+12 000", not "+ 12000": the design groups every figure
                      it prints, and an ungrouped five-digit price is the one a
                      reader mis-reads by a factor of ten. */}
                    <span data-num className="text-2xs mt-0.5 block font-normal opacity-80">
                      {entry.delta === 0
                        ? t.base
                        : `${entry.delta > 0 ? '+' : '−'}${somFigure(Math.abs(entry.delta), lang)}`}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          {(
            groups ?? [
              {
                id: 'extras',
                title: null,
                multi: true,
                min: 0,
                max: MODIFIERS.length,
                choices: MODIFIERS,
              },
            ]
          ).map((group) => (
            <Field key={group.id} label={group.title === null ? t.extras : say(group.title, lang)}>
              <ul className="flex flex-col">
                {group.choices.map((modifier) => {
                  const on = modifierIds.includes(modifier.id);

                  return (
                    <li key={modifier.id}>
                      <button
                        type="button"
                        onClick={() =>
                          groups === null
                            ? setModifierIds((current) =>
                                on
                                  ? current.filter((id) => id !== modifier.id)
                                  : [...current, modifier.id],
                              )
                            : toggle(group as ModifierGroup, modifier.id)
                        }
                        aria-pressed={on}
                        className="border-divider flex min-h-[var(--tap-min)] w-full items-center gap-3 border-b py-2 text-left last:border-0"
                      >
                        <span
                          aria-hidden
                          className={`text-2xs grid size-5 flex-none place-items-center rounded border text-white ${
                            on ? 'bg-acc border-acc' : 'border-border'
                          } ${group.multi ? '' : 'rounded-full'}`}
                        >
                          {on ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{say(modifier.name, lang)}</span>
                        {modifier.price === 0 ? null : (
                          <Money tiyin={modifier.price} lang={lang} className="flex-none" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Field>
          ))}

          <Field label={t.note}>
            <input
              type="text"
              value={note}
              maxLength={90}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.notePlaceholder}
              className="border-border h-12 w-full rounded-md border px-3.5 text-base"
            />
          </Field>
        </div>

        <footer
          className="border-border flex-none border-t px-[var(--phone-gutter)] pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center gap-3">
            {/* One stepper, counting down to nothing rather than a bin beside it. */}
            <div className="border-border flex h-12 flex-none items-center rounded-md border">
              <Step onClick={() => setQuantity((n) => Math.max(1, n - 1))} label="−" />
              <span data-num className="w-8 text-center text-base font-semibold">
                {quantity}
              </span>
              <Step onClick={() => setQuantity((n) => Math.min(20, n + 1))} label="+" />
            </div>

            <button
              type="button"
              disabled={dish.soldOut}
              onClick={() => onAdd({ dishId: dish.id, portionId, modifierIds, quantity, note })}
              className="bg-acc flex h-12 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold text-white disabled:opacity-45"
            >
              {t.addToCart}
              <span data-num className="opacity-90">
                · {somText(unit * quantity, lang)}
              </span>
            </button>
          </div>

          {dish.soldOut ? (
            <p className="text-fg-subtle mt-2 text-center text-xs leading-normal">
              {t.soldOutBody}
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-fg-subtle text-2xs tracking-caps mb-2 font-semibold uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Step({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-fg-muted grid h-12 w-10 place-items-center text-lg"
    >
      {label}
    </button>
  );
}

'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { caloriesLabel, weightLabel, type GuestDish } from '@restaurant/surfaces/guest/menu-data';
import { dishImageFrom } from '@restaurant/surfaces/media/image';
import { addLine, lineImageFrom } from '@/lib/guest-cart';
import { SitePhoto } from './site-photo';
import { ADDONS, PORTIONS, type SiteAddon, type SiteOptionGroup } from './venue-data';

/**
 * One dish, opened — `dc.html:672-762`.
 *
 * The price at the bottom moves as the guest chooses. That is the whole reason
 * the add button carries a number rather than saying "add": somebody who has
 * ticked two add-ons and set the quantity to three should not have to work out
 * what they are about to commit to.
 *
 * ---------------------------------------------------------------------------
 * Whose sizes and whose prices
 *
 * The venue's, when the catalogue answered. `GET /api/v1/public/menu` carries
 * `modifier_groups` per dish — the same rows the till reads through
 * `App\Contracts\Menu\ModifierQuestion`, resolved for the reader's language and
 * carrying the option ids `POST /api/v1/public/orders` re-prices a line by. So
 * a sharing plate costs what this kitchen charges for one, and the ids travel
 * with the basket line so the bill agrees with the sheet.
 *
 * The design's three portions and four add-ons are the **fallback**, and only
 * for a sheet opened against a fixture menu. That distinction is the important
 * half, and `groups` carries it in three states rather than two:
 *
 *   `null`  the catalogue did not answer at all. Draw the design's own sheet —
 *           a menu a guest can read is better than a dish with no options, and
 *           nothing can be ordered from it anyway.
 *   `[]`    the catalogue answered and this dish asks nothing. Draw no options.
 *           Offering the design's +35% here would be the one failure this file
 *           was already written to prevent: a surcharge quoted on the sheet that
 *           the server does not know about and will not charge.
 *   groups  the venue's own questions.
 *
 * Nothing here talks to the server. The basket is local until checkout, which
 * is what makes the menu usable on a train — and the dish price is the API's
 * own, never computed.
 */

/** One row of one group, after both sources have been folded into one shape. */
type SheetChoice = {
  id: string;
  title: string;
  /** Tiyin added to the unit price when this one is on. Signed. */
  delta: number;
  /** What the design prints down the right edge — a percentage or a sum. */
  aside: string;
};

type SheetGroup = {
  id: string;
  title: string;
  multi: boolean;
  min: number;
  max: number | null;
  choices: readonly SheetChoice[];
};

export function DishSheet({
  restaurant,
  dish,
  copy,
  money,
  onClose,
  groups = null,
  also = [],
}: {
  restaurant: string;
  dish: GuestDish;
  copy: {
    close: string;
    portion: string;
    portionOne: string;
    portionLarge: string;
    portionTwo: string;
    addons: string;
    addonsMax: string;
    addonQazi: string;
    addonEgg: string;
    addonSalad: string;
    addonBread: string;
    note: string;
    notePlaceholder: string;
    add: string;
    often: string;
    added: string;
  };
  money: (tiyin: number) => string;
  onClose: () => void;
  /** The venue's own questions, `[]` for a dish that asks none, `null` offline. */
  groups?: readonly SiteOptionGroup[] | null;
  /**
   * What the design puts under the sheet — `dc.html:747-761`.
   *
   * Three dishes from other parts of the menu: a salad, a bread and a drink
   * beside a plov. Slim records rather than whole dishes, because this rides in
   * the props of every row's island and a menu is forty rows long — which is
   * also why `image` is one address (the 160px `thumb`) and not the whole set.
   */
  also?: readonly { id: string; name: string; price: number; image: string | null }[];
}) {
  const sheet = groups === null ? designSheet(dish, copy, money) : venueSheet(groups, money);

  const [picked, setPicked] = useState<Readonly<Record<string, readonly string[]>>>(() =>
    openingChoice(sheet),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const chosen = sheet.flatMap((group) =>
    group.choices.filter((choice) => (picked[group.id] ?? []).includes(choice.id)),
  );

  /* The dish's own price plus what was chosen. Both halves are the kitchen's:
     the base comes off the catalogue and every delta off a modifier option, so
     nothing on this sheet is a number a screen worked out for itself. */
  const unitPrice = chosen.reduce((sum, choice) => sum + choice.delta, dish.price);

  const weight = weightLabel(dish);
  const calories = caloriesLabel(dish);

  const toggle = (group: SheetGroup, choiceId: string) => {
    setPicked((current) => {
      const on = current[group.id] ?? [];

      if (!group.multi) {
        // One answer. A group that must be answered cannot be emptied by
        // tapping its own row again — that would leave an add button the guest
        // cannot press and no sentence saying why.
        if (on.includes(choiceId)) return group.min >= 1 ? current : { ...current, [group.id]: [] };

        return { ...current, [group.id]: [choiceId] };
      }

      if (on.includes(choiceId)) {
        return { ...current, [group.id]: on.filter((id) => id !== choiceId) };
      }

      // At the ceiling the kitchen set. The counter beside the heading is what
      // says why nothing happened, which is why it is drawn whenever a cap
      // actually binds.
      if (group.max !== null && on.length >= group.max) return current;

      return { ...current, [group.id]: [...on, choiceId] };
    });
  };

  return (
    <div
      data-fade
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-sheet
        data-scroll
        role="dialog"
        aria-modal="true"
        aria-label={dish.name}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl border sm:rounded-2xl"
      >
        {/*
         * The photograph, `dc.html:685-687`.
         *
         * The design puts it down the left of a 900px two-column sheet. At this
         * width it is a band across the top instead, which is the same decision
         * made for a phone: the sheet is opened with a thumb from a list, and a
         * 380px column beside 140px of text is not a layout a phone has room
         * for. Absent entirely when the dish has no image, rather than a grey
         * block above every name.
         *
         * `sizes` is the sheet's own width — 520px once there is room, the
         * viewport on a phone — so a 3× phone gets `full` and a 1× laptop gets
         * `card`. `eager` because the sheet has just been opened and its band
         * is the first thing in it.
         */}
        {dish.image === null ? null : (
          <div className="bg-bg-muted h-56 w-full overflow-hidden rounded-t-2xl">
            <SitePhoto
              image={dish.image}
              alt={dish.name}
              sizes="(min-width: 520px) 520px, 100vw"
              eager
              className="!rounded-none"
            />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl leading-snug font-semibold tracking-tight">
              {dish.name}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={copy.close}
              className="text-fg-muted hover:bg-bg-muted grid size-9 flex-none place-items-center rounded-md"
            >
              ✕
            </button>
          </div>

          {/* Grams and calories on one 13px line — `dc.html:696-701`. Both
              helpers existed and neither was called, so the sheet showed a
              dish's weight nowhere at all. */}
          {weight === null && calories === null ? null : (
            <p data-num className="text-fg-subtle mt-2 flex items-center gap-3.5 text-[13px]">
              {weight === null ? null : <span>{weight}</span>}
              {calories === null ? null : <span>{calories}</span>}
            </p>
          )}

          {dish.description !== '' ? (
            <p className="text-fg-muted mt-3 text-sm leading-normal">{dish.description}</p>
          ) : null}

          {sheet.map((group, index) => {
            const on = picked[group.id] ?? [];
            /* Drawn only when the ceiling can actually be reached. "Pick as many
               as you like" over a group capped at two is a sentence that is not
               true, and a bare `1/2` says the same thing in every language. */
            const capBinds = group.max !== null && group.max < group.choices.length;

            return (
              <div
                key={group.id}
                className={index === 0 ? 'border-divider mt-4 border-t pt-4' : 'mt-5'}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">{group.title}</h3>

                  {capBinds ? (
                    <span data-num className="text-fg-subtle text-xs">
                      {on.length}/{group.max}
                    </span>
                  ) : group.multi ? (
                    <span className="text-fg-subtle text-xs">{copy.addonsMax}</span>
                  ) : null}
                </div>

                <div className="mt-2 grid gap-2">
                  {group.choices.map((choice) => (
                    <Choice
                      key={choice.id}
                      on={on.includes(choice.id)}
                      round={!group.multi}
                      onClick={() => toggle(group, choice.id)}
                      label={choice.title}
                      aside={choice.aside}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-semibold">{copy.note}</span>
            <textarea
              value={note}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              placeholder={copy.notePlaceholder}
              className="bg-surface border-border-strong w-full resize-y rounded-md border px-3.5 py-2.5 text-sm"
            />
          </label>

          <div className="border-divider mt-6 flex items-center gap-3.5 border-t pt-5">
            <div className="flex flex-none items-center gap-2.5">
              <Step label="−" onClick={() => setQuantity((n) => Math.max(1, n - 1))} />
              <span data-num className="font-display w-7 text-center text-lg font-bold">
                {quantity}
              </span>
              {/* Twenty is the design's ceiling — a basket line above it is a
                  banquet, and the large-order card sends those to the telephone. */}
              <Step label="+" onClick={() => setQuantity((n) => Math.min(20, n + 1))} />
            </div>

            {/* The number moves with every choice above it. */}
            <button
              type="button"
              onClick={() => {
                addLine(restaurant, {
                  dishId: dish.id,
                  name: dish.name,
                  image: lineImageFrom(dish),
                  unitPrice,
                  quantity,
                  /* The portion travels with the line: a basket row reading
                     just "Plov" beside a sharing-plate price is a row the
                     kitchen and the guest read differently. */
                  options: chosen.map((choice) => choice.title),
                  /* And the ids travel beside the words, because the checkout
                     cannot send a label — see `CartLine.modifierIds`. A design
                     sheet's ids are not numbers and are dropped by the payload
                     builder, which is correct: that basket cannot be ordered. */
                  modifierIds: chosen.map((choice) => choice.id),
                  note,
                });
                flash(`${dish.name} · ${copy.added}`);
                onClose();
              }}
              className="bg-acc h-13 flex-1 rounded-md text-[15px] font-semibold text-white"
            >
              {copy.add}{' '}
              <span data-num className="opacity-85">
                · {money(unitPrice * quantity)}
              </span>
            </button>
          </div>
        </div>

        {/*
         * Ordered together — `dc.html:746-761`.
         *
         * The design opens the tapped dish's own sheet; this adds one instead.
         * Swapping the sheet's subject would need the whole dish record for
         * every suggestion — description, allergens, weight — in the props of
         * every row on a forty-row menu. Adding one is the action a guest
         * looking at "usually ordered with" actually wants, and it is a control
         * that does something rather than one that reopens a screen.
         */}
        {also.length === 0 ? null : (
          <div className="border-divider border-t px-6 pt-5 pb-6">
            <h3 className="font-display text-base font-bold tracking-tight">{copy.often}</h3>

            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
              {also.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    addLine(restaurant, {
                      dishId: entry.id,
                      name: entry.name,
                      image: entry.image,
                      unitPrice: entry.price,
                      quantity: 1,
                      options: [],
                      note: '',
                    });
                    flash(`${entry.name} · ${copy.added}`);
                  }}
                  className="border-border bg-surface flex items-center gap-3 rounded-md border p-2.5 text-left"
                >
                  <span className="bg-bg-muted size-11 flex-none overflow-hidden rounded-lg">
                    {/* The slim record carries one address — the `thumb` the
                        menu page chose for it — so it is wrapped back into a
                        one-size photograph rather than given a second `<img>`
                        path of its own. */}
                    <SitePhoto
                      image={dishImageFrom(null, entry.image)}
                      alt={entry.name}
                      sizes="44px"
                      className="!rounded-lg"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{entry.name}</span>
                    <span data-num className="text-fg-subtle mt-0.5 block text-[13px]">
                      {money(entry.price)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The venue's own questions, in the shape the sheet draws.
 *
 * A price delta is printed as money and a zero delta as nothing, which is the
 * design's own grammar for its base portion. Negative is possible and is
 * printed with a minus rather than a plus — a small cup is worth less than the
 * dish, and `+−2 000` is not a price.
 */
function venueSheet(
  groups: readonly SiteOptionGroup[],
  money: (tiyin: number) => string,
): readonly SheetGroup[] {
  return groups.map((group) => ({
    id: group.id,
    title: group.title,
    multi: group.multi,
    min: group.min,
    max: group.max,
    choices: group.choices.map((choice) => ({
      id: choice.id,
      title: choice.title,
      delta: choice.priceDelta,
      aside:
        choice.priceDelta === 0
          ? ''
          : `${choice.priceDelta > 0 ? '+' : '−'}${money(Math.abs(choice.priceDelta))}`,
    })),
  }));
}

/**
 * The design's own sheet — three portions and four add-ons.
 *
 * Two numbers here had drifted from the file before `venue-data.ts` owned them,
 * and both of them are money:
 *
 *   · **the portions.** The design surcharges a *percentage of the dish* —
 *     `[0, p*0.35, p*0.75]` — and this multiplied by 1.4 and 1.9. On a 96 000
 *     so'm sharing plate that quoted 19 200 so'm more than the printed menu.
 *   · **the add-ons.** The design offers four, named and priced: qazi 14 000,
 *     quail egg 5 000, achichuk 12 000, tandoor bread 6 000. This offered one,
 *     labelled with the group's own heading and priced at 8 000 — a figure that
 *     appears nowhere in the design, for a thing the kitchen does not sell.
 *
 * The portion surcharge is folded into a delta here rather than kept as a
 * factor, so both sources price a line the same way. It is the same arithmetic
 * to the tiyin: prices are whole so'm, so `round(p·f)` and `p + round(p·(f−1))`
 * cannot part company. `+35%` stays the label, because that is what the design
 * prints down the right edge and a sum there would be a different drawing.
 */
function designSheet(
  dish: GuestDish,
  copy: {
    portion: string;
    portionOne: string;
    portionLarge: string;
    portionTwo: string;
    addons: string;
    addonQazi: string;
    addonEgg: string;
    addonSalad: string;
    addonBread: string;
  },
  money: (tiyin: number) => string,
): readonly SheetGroup[] {
  const portionLabel: Record<'one' | 'large' | 'two', string> = {
    one: copy.portionOne,
    large: copy.portionLarge,
    two: copy.portionTwo,
  };

  const addonLabel: Record<SiteAddon['key'], string> = {
    qazi: copy.addonQazi,
    egg: copy.addonEgg,
    salad: copy.addonSalad,
    bread: copy.addonBread,
  };

  return [
    {
      id: 'portion',
      title: copy.portion,
      multi: false,
      min: 1,
      max: 1,
      choices: PORTIONS.map((entry) => ({
        id: `portion:${entry.key}`,
        title: portionLabel[entry.key],
        /* Rounded to a whole so'm. A surcharge that landed on a tiyin would
           print a price no till can take. */
        delta: Math.round((dish.price * (entry.factor - 1)) / 100) * 100,
        aside: entry.delta,
      })),
    },
    {
      id: 'addons',
      title: copy.addons,
      multi: true,
      min: 0,
      max: null,
      choices: ADDONS.map((addon) => ({
        id: `addon:${addon.key}`,
        title: addonLabel[addon.key],
        delta: addon.price,
        aside: `+${money(addon.price)}`,
      })),
    },
  ];
}

/**
 * What is already ticked when the sheet opens.
 *
 * The first choice of every group that must be answered, and nothing else. A
 * `min_choices` of one with nothing selected is an add button a guest cannot
 * press; a multi group opening with something ticked is a charge nobody chose.
 */
function openingChoice(sheet: readonly SheetGroup[]): Record<string, readonly string[]> {
  const opening: Record<string, readonly string[]> = {};

  for (const group of sheet) {
    const first = group.choices[0];

    opening[group.id] = group.min >= 1 && !group.multi && first !== undefined ? [first.id] : [];
  }

  return opening;
}

/**
 * One row of a group.
 *
 * `round` draws the portion's radio dot and the square is the add-on's
 * checkbox — the design uses both shapes on this sheet and the difference is
 * the whole grammar of it: one portion, as many add-ons as you like.
 */
function Choice({
  on,
  onClick,
  label,
  aside,
  round = false,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  aside: string;
  round?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[50px] items-center gap-3 rounded-md border px-4 text-left ${
        on ? 'border-acc bg-acc-soft' : 'border-border bg-surface'
      }`}
    >
      <span
        aria-hidden
        className={`grid size-[19px] flex-none place-items-center border-[1.5px] text-[11px] font-bold text-white ${
          round ? 'rounded-full' : 'rounded-[6px]'
        } ${on ? 'border-acc bg-acc' : 'border-border-strong'}`}
      >
        {on ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <span data-num className="text-fg-muted flex-none text-sm font-semibold">
        {aside}
      </span>
    </button>
  );
}

function Step({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border-strong bg-surface grid size-10.5 place-items-center rounded-md border text-lg font-semibold"
    >
      {label}
    </button>
  );
}

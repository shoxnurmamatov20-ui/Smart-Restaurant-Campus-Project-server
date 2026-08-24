<?php

declare(strict_types=1);

namespace App\Contracts\Menu;

/**
 * The one way to read the menu from outside the Menu module.
 *
 * Orders needs a dish to snapshot onto a bill; the Telegram WebApp needs the
 * sellable catalogue. Both used to import `Modules\Menu\Models\MenuItem`
 * directly, which meant a change to Menu's schema could break the POS and the
 * bots at once, and neither module could ever be deployed separately.
 *
 * Implemented by Menu, resolved through the container, and always scoped to the
 * current restaurant by the caller's tenant context.
 */
interface MenuCatalog
{
    /** One dish by id, or null if this restaurant has no such dish. */
    public function find(int $id): ?Dish;

    /** One dish by the code printed on the ticket. */
    public function findBySku(string $sku): ?Dish;

    /**
     * Everything a guest can actually order on this channel right now —
     * active sections, no drafts, no archived dishes, nothing on the stop-list.
     *
     * @return array<int, Section>
     */
    public function sellable(string $channel = 'dine_in'): array;

    /**
     * Everything a till should DRAW on this channel — including what this kitchen
     * has run out of, flagged rather than removed.
     *
     * The difference from `sellable()` is who is looking. A guest offered a dish
     * the kitchen cannot cook is a guest who orders it; a waiter shown the same
     * dish crossed out knows the answer to "do you have Manti" without walking to
     * the pass, and knows they have not misremembered the menu.
     *
     * `sellable()` is this minus the stopped ones. Two names because they answer
     * two questions, and a boolean parameter meaning "actually not sellable" would
     * be a method whose name stopped being true half the time.
     *
     * @return array<int, Section>
     */
    public function board(string $channel = 'dine_in'): array;

    /**
     * What the guest is asked about one dish, with the rules for answering.
     *
     * Separate from `find()` rather than hung off the Dish, and deliberately so.
     * The POS reads the whole sellable menu on every shift — a hundred dishes —
     * and it needs the questions for exactly the one somebody just tapped.
     * Carrying them on every Dish would be a hundred joins for one modifier
     * sheet, and the sheet is opened at most once per line.
     *
     * Empty for a dish nobody is asked anything about, which is most of them.
     *
     * @return array<int, ModifierQuestion>
     */
    public function questionsFor(int $dishId): array;

    /**
     * How long this dish takes to cook, in minutes.
     *
     * Its own method rather than a read of {@see Dish::$cookTimeMinutes},
     * because the caller that needs it has no Dish and does not want one:
     * Orders quotes an ETA from a basket of ids, and pulling a whole dish per
     * line to read one integer is a catalogue round-trip for a number.
     *
     * Answers the module's configured default for a dish this restaurant does
     * not have, never zero. An unknown id is a bug in the caller, and a zero
     * would express itself as "ready immediately" on a guest's tracking screen
     * — the one wrong answer that cannot be told apart from a right one.
     */
    public function prepMinutes(int $dishId): int;

    /**
     * Price a set of answers, refusing any that are not allowed.
     *
     * The client is told the rules by `questionsFor` so it can grey out a sixth
     * checkbox; this is where they are ENFORCED, because a rule a client
     * enforces is a rule an offline queue, an aggregator or a stale bundle does
     * not. It answers the choices with their prices frozen at this moment, and
     * refuses rather than silently dropping: a kitchen ticket that quietly lost
     * "no onion" is worse than an order that failed loudly.
     *
     * @param  array<int, int>  $choiceIds
     * @return array<int, ModifierChoice>
     *
     * @throws \RuntimeException when a choice is unknown, inactive, not offered
     *                           for this dish, or breaks its group's rules
     */
    public function priceChoices(int $dishId, array $choiceIds): array;
}

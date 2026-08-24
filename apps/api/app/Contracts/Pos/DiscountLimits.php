<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

/**
 * How much a role may take off a bill without asking anybody.
 *
 * CLAUDE.md said the ceiling lives in four places at once — this table, the
 * console's `roles.ts`, `TerminalFactory` and `PosDatabaseSeeder` — and that
 * "change the number in four places together" is a rule nobody keeps. It had
 * already drifted: the console drew a chip the server refused, and the cashier
 * concluded the product was broken.
 *
 * So the settings screen writes the number, and it writes it here. The store
 * itself is `Terminal.settings.discount_limits`, which is where ApprovalGate
 * already reads it from — this contract exists only because core must not
 * import a module, and the console's roles screen is core.
 *
 * Percent, not tiyin: it is a ratio, and P9 states the ladder in percents —
 * waiter 0 · cashier 5 · manager 20 · owner 100.
 */
interface DiscountLimits
{
    /**
     * The ceiling each role holds across this restaurant's tills.
     *
     * One number per role even though the store is per-terminal: a restaurant
     * whose bar lets a cashier sign for 20% and whose counter lets them sign
     * for 5% has a policy nobody can explain to the cashier. Where tills
     * disagree the LOWEST wins, because reporting the higher one would draw a
     * chip that the till in front of the person refuses.
     *
     * @return array<string, int> role name => percent
     */
    public function all(): array;

    /**
     * Set one role's ceiling on every till of this restaurant.
     *
     * @return int how many terminals were changed
     */
    public function set(string $role, int $percent): int;
}

<?php

declare(strict_types=1);

namespace App\Support\Settings;

use App\Support\Tenancy\TenantContext;

/**
 * The house rules, read the same way everywhere.
 *
 * The console's settings screen draws ten policy switches. Nine of them used to
 * move, toast and change nothing — the panel said so itself, and named three
 * different reasons. They have paths now (`config/settings.php`, the
 * `policies.*` group) and one reader, which is this.
 *
 * ---------------------------------------------------------------------------
 * Why a class and not `tenant()->setting('policies.x', …)` at each site
 *
 * Because the default is the part that goes wrong. There are eight enforcement
 * points across five modules, and a default typed at each of them is a default
 * that drifts on the first change — the same failure `CLAUDE.md` records about
 * the discount ceilings living in four places and disagreeing in three. Here the
 * fallbacks come from `config('settings.defaults')`, beside the schema that
 * declares the paths, so the contract is one file and the reading is one class.
 *
 * ---------------------------------------------------------------------------
 * Restaurant-wide, not per venue
 *
 * These are decisions about how a business trades — whether a settled table
 * clears itself, whether striking cooked food needs a signature — and a chain
 * that answered them differently in Chilonzor and Yunusobod would be two
 * businesses. Money and hours DO differ per venue and are `branch.settings`
 * (see the schema); nothing here does.
 *
 * ---------------------------------------------------------------------------
 * Zero means "no rule"
 *
 * Six of the nine are numbers and most of them read zero as absent rather than
 * as a limit of zero. That is what lets a restaurant which has never opened the
 * screen behave exactly as this platform behaved before the column existed —
 * and a ceiling of "zero bills per waiter" would otherwise lock every till on
 * the platform the day it shipped.
 */
final readonly class Policies
{
    public function __construct(private TenantContext $tenants) {}

    /** Is this rule switched on for the restaurant in context? */
    public function on(string $name): bool
    {
        return (bool) $this->value($name);
    }

    /**
     * A numeric rule, floored at zero.
     *
     * Floored rather than trusted, because the document is jsonb: a path can
     * hold whatever a migration, a seeder or a hand-edited row put there, and a
     * negative ceiling read as a ceiling would refuse everything.
     */
    public function number(string $name): int
    {
        return max(0, (int) $this->value($name));
    }

    /**
     * The restaurant's own answer, or the platform's.
     *
     * `null` from the document is "not set" and falls through — which is not the
     * same as `false`, and the difference matters for the three booleans: a
     * switch turned OFF is stored as `false` and must beat a default of `true`.
     */
    private function value(string $name): mixed
    {
        $path = 'policies.'.$name;

        /*
         * `config()` cannot be asked for this by path.
         *
         * The defaults are keyed by the dotted path itself — `policies.x` is
         * one array key, not two levels — because that is how the schema beside
         * them is keyed, and the schema is what a reader compares against.
         * `config('settings.defaults.policies.x')` would split on the dots and
         * find nothing, which is a null that reads exactly like "not set".
         *
         * @var array<string, mixed> $defaults
         */
        $defaults = config('settings.defaults', []);

        return $this->tenants->tenant()?->setting($path) ?? ($defaults[$path] ?? null);
    }
}

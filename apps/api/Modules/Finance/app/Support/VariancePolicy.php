<?php

declare(strict_types=1);

namespace Modules\Finance\Support;

use App\Support\Tenancy\TenantContext;

/**
 * What a restaurant does about a drawer that does not agree.
 *
 * The plan states it as three numbers — nothing, a manager's PIN at 20 000 so'm,
 * the owner told at 50 000 — and states the rule above them as "a difference
 * that is not zero does not close". Taken literally that last one locks a till
 * over a hundred so'm and teaches a cashier to type a figure that balances
 * instead of the one they counted, which loses the only signal the count exists
 * to produce. So it is read as: a difference never closes *silently*.
 *
 * Three rungs, and each buys something the one below it cannot:
 *
 *   a reason        The gap gets a name — a guest overpaid, a note torn, change
 *                   given twice. Ten of those in a month is a training problem;
 *                   ten blanks is nothing anybody can act on.
 *
 *   an approval     A second person, and specifically one the cashier cannot be.
 *                   Below this rung the person who caused the gap also clears
 *                   it, which is only acceptable while the amount is too small
 *                   to be worth causing.
 *
 *   the owner told  Tonight rather than at month end. The difference between
 *                   one bad evening and a habit is whether anybody noticed the
 *                   first one.
 *
 * Absolute values throughout. A surplus is as suspicious as a shortfall — the
 * ordinary cause of one is a sale that was taken and never rung up — and a
 * policy that only looked at shortfalls would wave through the half of the
 * problem that is actually theft rather than error.
 */
final class VariancePolicy
{
    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * What has to happen for this shift to close.
     */
    public function verdictFor(int $difference): VarianceVerdict
    {
        $gap = abs($difference);
        $thresholds = $this->thresholds();

        // A drawer that agrees needs nothing, whatever the thresholds say. Every
        // rung below is `>=`, so a threshold configured at zero would otherwise
        // demand a manager for a till that balanced to the tiyin.
        if ($gap === 0) {
            return new VarianceVerdict($difference, false, false, false, $thresholds);
        }

        return new VarianceVerdict(
            difference: $difference,
            needsReason: $gap > $thresholds['reason'],
            needsApproval: $gap >= $thresholds['approval'],
            notifiesOwner: $gap >= $thresholds['owner'],
            thresholds: $thresholds,
        );
    }

    /**
     * The three rungs in tiyin, this restaurant's own if it has set any.
     *
     * `tenants.settings` rather than a table: one row per restaurant and three
     * numbers on it, and a chain that runs a tighter till than the platform
     * default should be one settings edit rather than a migration. Same place
     * and same shape as the acquirer fee overrides.
     *
     * @return array{reason: int, approval: int, owner: int}
     */
    public function thresholds(): array
    {
        $overrides = $this->overrides();

        return [
            'reason' => $this->rung('reason', $overrides),
            'approval' => $this->rung('approval', $overrides),
            'owner' => $this->rung('owner', $overrides),
        ];
    }

    /**
     * One rung, in tiyin.
     *
     * The platform default is already tiyin — `config/config.php` writes it as
     * `20_000 * 100` so the conversion is visible where the number is. A tenant
     * override is written in so'm, because a restaurant owner setting a limit
     * thinks in so'm and a settings blob full of hundred-thousands invites the
     * factor-of-a-hundred mistake. This is the one place that conversion happens.
     *
     * @param  array<string, int|string>  $overrides
     */
    private function rung(string $name, array $overrides): int
    {
        if (array_key_exists($name, $overrides)) {
            return max(0, (int) $overrides[$name]) * 100;
        }

        return max(0, (int) config("finance.variance.{$name}_tiyin", 0));
    }

    /**
     * @return array<string, int|string>
     */
    private function overrides(): array
    {
        $tenant = $this->tenants->tenant();

        if ($tenant === null) {
            return [];
        }

        $configured = ($tenant->settings ?? [])['variance_thresholds_som'] ?? null;

        return is_array($configured) ? $configured : [];
    }
}

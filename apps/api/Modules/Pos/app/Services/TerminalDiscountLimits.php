<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Contracts\Pos\DiscountLimits;
use Modules\Pos\Models\Terminal;

/**
 * The discount ceiling, read from and written to where the till already reads it.
 *
 * `ApprovalGate` asks `Terminal::discountLimitFor()`, so that column is the
 * truth and this class does not invent a second store. What it adds is the
 * restaurant-wide view the settings screen needs: one number per role rather
 * than one per till.
 */
final class TerminalDiscountLimits implements DiscountLimits
{
    /**
     * @return array<string, int>
     */
    public function all(): array
    {
        $limits = [];

        // The tenant scope is already on the model, so this is this restaurant's
        // tills and nobody else's.
        foreach (Terminal::query()->get(['id', 'settings']) as $terminal) {
            $own = $terminal->settings['discount_limits'] ?? [];

            if (! is_array($own)) {
                continue;
            }

            foreach ($own as $role => $percent) {
                if (! is_string($role) || ! is_numeric($percent)) {
                    continue;
                }

                // The lowest wins — see the contract for why reporting the
                // higher one draws a chip the till in front of the person
                // refuses.
                $limits[$role] = isset($limits[$role])
                    ? min($limits[$role], (int) $percent)
                    : (int) $percent;
            }
        }

        ksort($limits);

        return $limits;
    }

    public function set(string $role, int $percent): int
    {
        $changed = 0;

        foreach (Terminal::query()->get() as $terminal) {
            $settings = $terminal->settings ?? [];
            $limits = is_array($settings['discount_limits'] ?? null) ? $settings['discount_limits'] : [];

            if (($limits[$role] ?? null) === $percent) {
                continue;
            }

            $limits[$role] = $percent;
            $settings['discount_limits'] = $limits;

            $terminal->forceFill(['settings' => $settings])->save();
            $changed++;
        }

        return $changed;
    }
}

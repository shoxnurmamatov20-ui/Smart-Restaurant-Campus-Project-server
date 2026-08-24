<?php

declare(strict_types=1);

namespace App\Support\Finance;

/**
 * Rounding cash to notes that exist.
 *
 * DECISIONS Q7. A bill can come to 47 312 tiyin of a so'm; a drawer cannot pay
 * it. So the cash portion is rounded to the smallest unit a cashier can actually
 * hand over, and the difference is recorded rather than lost — `Payment.rounding`
 * — so the expected drawer moves to exactly the rounded figure and a shift still
 * reconciles to the tiyin.
 *
 * **The step is the most dangerous constant in this project.** It is written here
 * once, in tiyin, with the so'm value beside it, because a factor of a hundred
 * either way is silent: at 1 000 tiyin nothing appears to round at all, and at
 * 10 000 000 tiyin every bill rounds to the nearest hundred thousand so'm and the
 * restaurant loses a meal per table. `docs/PLAN-2026-08.md` names it explicitly
 * for that reason, and it is tested from both sides.
 *
 * Rounding is to NEAREST, not down. Down would be a systematic loss to the
 * restaurant on every cash bill, of up to a thousand so'm each — over a service
 * that is a real number, always in the same direction. Nearest averages out, and
 * it is the rule countries that abolished small coins actually adopted. It is
 * also why `Payment.rounding` is signed: half of these are gains.
 */
final class CashRounding
{
    /**
     * 1 000 so'm, in tiyin.
     *
     * 1 so'm = 100 tiyin, so a thousand so'm is 100 000 tiyin. Written as a sum
     * rather than a literal so the conversion is visible at the point of use.
     */
    public const STEP_TIYIN = 1_000 * 100;

    /**
     * What the guest actually hands over.
     *
     * Returns the rounded amount. Pass `$step = 1` (or 0) to disable rounding,
     * which is what a terminal configured for exact cash gets.
     */
    public static function round(int $amountTiyin, int $step = self::STEP_TIYIN): int
    {
        if ($step <= 1 || $amountTiyin <= 0) {
            return $amountTiyin;
        }

        /*
         * intdiv on the half-shifted amount, which is integer rounding to nearest
         * with ties going up. `round()` would return a float, and a float is the
         * one thing no money path in this codebase may contain — at these
         * magnitudes a double is still exact, but the habit is what protects the
         * next person who copies this line somewhere it would not be.
         */
        return intdiv($amountTiyin + intdiv($step, 2), $step) * $step;
    }

    /**
     * The difference rounding introduced, signed.
     *
     * Positive means the guest paid more than the bill and the restaurant keeps
     * it; negative means less. This is the number that goes on the payment row
     * and into expected cash, and it is the only reason the drawer still
     * reconciles after the amount stopped matching the bill.
     */
    public static function difference(int $amountTiyin, int $step = self::STEP_TIYIN): int
    {
        return self::round($amountTiyin, $step) - $amountTiyin;
    }
}

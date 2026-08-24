<?php

declare(strict_types=1);

namespace App\Support\Finance;

/**
 * What the bank keeps.
 *
 * A card sale is not the same amount of money as a cash sale of the same size,
 * and a restaurant that treats them as equal will never reconcile a bank
 * statement. Uzcard and Humo take 1.2%, Visa and Mastercard 2.4%, Click and
 * Payme 1.5%. Cash and a company account take nothing.
 *
 * Rates are basis points — hundredths of a percent — because 1.2% is not
 * representable as an integer percent and the alternative is a float in a money
 * path. 120 bps, applied as `amount × bps ÷ 10 000`, is exact.
 *
 * Configured rather than hard-coded, per tenant: these are negotiated, a chain
 * with volume pays less than a single café, and a restaurant that renegotiates
 * should not need a deploy. The snapshot lands on the payment row, so a rate
 * changed in March does not restate February.
 */
final class AcquirerFees
{
    /**
     * Platform defaults, in basis points.
     *
     * `card` is the pre-P7 generic and deliberately zero: a till still sending it
     * has not told us which scheme was used, and inventing a rate would put a
     * number in a margin report that nobody could trace to a bank statement. A
     * zero is visibly missing; a plausible guess is not.
     */
    private const DEFAULT_BPS = [
        'cash' => 0,
        'uzcard' => 120,
        'humo' => 120,
        'visa' => 240,
        'mastercard' => 240,
        'click' => 150,
        'payme' => 150,
        'uzum' => 150,
        'corporate' => 0,
        'card' => 0,
        /*
         * Nobody's cut. A tab is the restaurant lending its own money — there is no
         * acquirer in the transaction and no bank to take a percentage.
         *
         * Declared rather than left to the `?? 0` fallback below, because
         * `AcquirerFeeTest` asserts that every method in `Payment::METHODS` has an
         * explicit rate here. That assertion exists so a new payment method cannot
         * arrive with a silently-guessed fee in a margin report.
         */
        'credit' => 0,
    ];

    /**
     * @param array<string, int|string> $overrides From tenants.settings, keyed by method.
     */
    public static function bps(string $method, array $overrides = []): int
    {
        if (array_key_exists($method, $overrides)) {
            return max(0, (int) $overrides[$method]);
        }

        return self::DEFAULT_BPS[$method] ?? 0;
    }

    /**
     * The fee on one tender, in tiyin.
     *
     * Rounded down. A fraction of a tiyin is not money, and the bank's own
     * statement is in whole units — erring towards the smaller fee means the
     * restaurant's recorded net is never optimistic.
     */
    public static function on(int $amountTiyin, int $bps): int
    {
        if ($bps <= 0 || $amountTiyin <= 0) {
            return 0;
        }

        return intdiv($amountTiyin * $bps, 10_000);
    }

    /** @return array<string, int> */
    public static function defaults(): array
    {
        return self::DEFAULT_BPS;
    }
}

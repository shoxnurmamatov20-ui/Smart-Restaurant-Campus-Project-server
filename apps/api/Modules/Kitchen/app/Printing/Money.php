<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

/**
 * Tiyin on paper.
 *
 * Integer arithmetic only, all the way to the string. A receipt is the one
 * artefact a guest can hold up and argue with, and the moment a float enters
 * here the paper and the payment row start disagreeing by a tiyin at a time —
 * invisibly per bill, and by real money across a service.
 *
 * The grouping is a thin space rather than a comma or a full stop, because both
 * of those mean something else to somebody: 45.000 is forty-five so'm to a
 * European reader and forty-five thousand to an Uzbek one. A space cannot be
 * misread. It is a plain ASCII space here, not U+00A0 — a thermal printer's
 * codepage has no non-breaking space and would print a question mark in the
 * middle of every price.
 */
final class Money
{
    /**
     * `4 523 400` tiyin becomes `45 234`, and `4 523 450` becomes `45 234,50`.
     *
     * The tiyin part is shown only when there is one. Menu prices are whole
     * so'm, so a receipt that printed `,00` after every line would be adding a
     * column of noise to say nothing — but a rounding difference of 40 tiyin has
     * to be legible or the line does not explain itself.
     */
    public static function som(int $tiyin): string
    {
        $sign = $tiyin < 0 ? '-' : '';
        $absolute = abs($tiyin);

        $whole = intdiv($absolute, 100);
        $fraction = $absolute % 100;

        $grouped = self::group($whole);

        return $fraction === 0
            ? $sign.$grouped
            : $sign.$grouped.','.str_pad((string) $fraction, 2, '0', STR_PAD_LEFT);
    }

    /** Signed, with the plus shown. Rounding of +40 and −40 must not look alike. */
    public static function signed(int $tiyin): string
    {
        return ($tiyin > 0 ? '+' : '').self::som($tiyin);
    }

    private static function group(int $whole): string
    {
        $digits = (string) $whole;
        $out = '';

        for ($i = mb_strlen($digits); $i > 0; $i -= 3) {
            $start = max(0, $i - 3);
            $out = mb_substr($digits, $start, $i - $start).($out === '' ? '' : ' '.$out);
        }

        return $out;
    }
}

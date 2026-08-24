<?php

declare(strict_types=1);

namespace App\Support\Orders;

use InvalidArgumentException;

/**
 * Dividing a bill by money: how the shares fall, and where the rounding lands.
 *
 * A pure calculator like {@see BillTotals} beside it — integers in, integers
 * out, no database and no request — and here for the same reason: four surfaces
 * read these numbers out loud. The till's split sheet shows them before anybody
 * agrees, the guest app's own stepper shows them to the person paying, the
 * receipt prints one of them, and the Z report reconciles all of them. Only one
 * arithmetic can be right.
 *
 * ---------------------------------------------------------------------------
 * The rounding rule, and why it is not a rounding
 *
 * A share is floored to the nearest thousand so'm — the smallest note anybody
 * carries here — and the LAST share takes whatever the flooring left behind.
 * So a 197 000 so'm bill split three ways is 65 000 + 65 000 + 67 000, not
 * three shares of 65 666.67.
 *
 * The property that matters is that the shares always add back up to the total.
 * Rounding each share to nearest would not: three shares of 65 667 come to
 * 197 001, and the extra so'm is money the restaurant collected from nobody and
 * cannot deposit. Flooring and giving the remainder to one payer keeps the
 * family exact, and it is the design's own rule
 * (`Smart Restaurant OS.dc.html:17261`, mirrored in `pos-copy.ts`'s
 * `evenShare()`/`guestShares()`, whose expected values these tests are taken
 * from).
 *
 * Which payer gets the remainder is arbitrary and has to be decided somewhere:
 * the last one, because a cashier reads the list top to bottom and the odd
 * figure at the end is the one they will remember to mention.
 */
final readonly class BillSplit
{
    /**
     * The smallest note in circulation, in tiyin.
     *
     * 1 000 so'm. Shares are floored to a multiple of it so that every figure
     * on the sheet is one a guest can actually hand over. Cash rounding at the
     * till is a separate rule with a separate step — see the terminal's
     * `cash_rounding_tiyin` — and the two must not be confused: that one rounds
     * what is COLLECTED, this one decides what is ASKED.
     */
    public const NOTE_TIYIN = 100_000;

    /** One guest is not a split. */
    public const WAYS_MIN = 2;

    /**
     * Twelve, from the guest app's own stepper.
     *
     * `Math.min(12, …)` in the guest surface and `SPLIT_WAYS.max` in the till's
     * copy: the two settle the same bill, so they cannot disagree about how many
     * people may settle it.
     */
    public const WAYS_MAX = 12;

    /**
     * One head's share of a total, floored to a whole note.
     *
     * The direct port of `evenShare()` in `pos-copy.ts`.
     */
    public static function share(int $totalTiyin, int $ways): int
    {
        if ($ways < 1) {
            return $totalTiyin;
        }

        return intdiv(intdiv($totalTiyin, $ways), self::NOTE_TIYIN) * self::NOTE_TIYIN;
    }

    /**
     * The shares, in order, for a bill divided `ways` between heads.
     *
     * The port of `guestShares()`. Always sums to `$totalTiyin`.
     *
     * @return list<int>
     *
     * @throws InvalidArgumentException when `$ways` is outside 2..12
     */
    public static function evenly(int $totalTiyin, int $ways): array
    {
        self::assertWays($ways);

        $each = self::share($totalTiyin, $ways);

        $shares = array_fill(0, $ways - 1, $each);
        $shares[] = $totalTiyin - $each * ($ways - 1);

        return $shares;
    }

    /**
     * Two shares: what this guest is putting in, and what is left.
     *
     * No flooring. The figure is one a cashier typed because a guest handed it
     * over or read it off a card terminal, and rounding somebody's own money to
     * the nearest thousand would change what they paid.
     *
     * @return list<int>
     *
     * @throws InvalidArgumentException when the amount is not strictly inside the bill
     */
    public static function byAmount(int $totalTiyin, int $amountTiyin): array
    {
        if ($amountTiyin <= 0) {
            throw new InvalidArgumentException('Bo\'linadigan summa noldan katta bo\'lsin.');
        }

        /*
         * Strictly less than the total, not "at most".
         *
         * Paying the whole bill is not a split — it is paying the bill — and
         * allowing it here would mint a sibling worth nothing for somebody to
         * settle, plus a parent worth nothing that the till would then show as
         * unpaid forever.
         */
        if ($amountTiyin >= $totalTiyin) {
            throw new InvalidArgumentException('Bo\'linadigan summa hisob jamidan kam bo\'lsin.');
        }

        return [$amountTiyin, $totalTiyin - $amountTiyin];
    }

    private static function assertWays(int $ways): void
    {
        if ($ways < self::WAYS_MIN || $ways > self::WAYS_MAX) {
            throw new InvalidArgumentException(sprintf(
                'Hisobni %d dan %d gacha bo\'lish mumkin.',
                self::WAYS_MIN,
                self::WAYS_MAX,
            ));
        }
    }
}

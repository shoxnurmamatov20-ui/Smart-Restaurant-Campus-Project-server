<?php

declare(strict_types=1);

namespace Modules\Finance\Support;

use App\Support\Errors\ApiException;
use App\Support\Finance\CashRounding;

/**
 * The notes a cashier can actually hold.
 *
 * A drawer is counted by note, never typed as a total — somebody standing at an
 * open till has banknotes in their hand, and "480 000" is a figure anybody can
 * type without opening the drawer at all. So the total has to be derived from
 * the notes, and deriving it means knowing which notes exist.
 *
 * Written in so'm and converted once, the same shape as {@see CashRounding}: a
 * ladder written directly in tiyin is eight chances to be wrong by a factor of a
 * hundred, and a wrong denomination is silent — the count simply comes out
 * short and the person who counted it gets asked why.
 *
 * Configurable because this platform is multi-country by design, and a ladder
 * hardcoded to the som is the thing that has to be found and edited when it is
 * not. The default is Uzbekistan's eight notes in circulation. There is no coin
 * row: coins exist on paper and no restaurant has seen one in years, and a row
 * nobody fills is a row somebody eventually fills wrongly.
 *
 * The counted totals are stored on the row rather than recomputed from the
 * breakdown at read time, precisely because this list is configuration. A note
 * withdrawn next year must not restate last year's Z-report.
 */
final class CashDenominations
{
    /**
     * Uzbekistan, in so'm, largest first.
     *
     * 200 000 and 100 000 are what an evening's takings are actually made of;
     * 1 000 is the smallest note anyone gives change in, which is why the cash
     * rounding step is exactly that and not smaller.
     *
     * @var list<int>
     */
    public const UZS_SOM = [200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000];

    /**
     * The ladder in tiyin, largest first.
     *
     * @return list<int>
     */
    public static function ladder(): array
    {
        /** @var list<int|string> $configured */
        $configured = config('finance.cash.denominations_som', self::UZS_SOM);

        $tiyin = array_map(static fn (int|string $som): int => (int) $som * 100, $configured);
        $tiyin = array_values(array_unique(array_filter($tiyin, static fn (int $note): bool => $note > 0)));

        rsort($tiyin);

        return $tiyin === [] ? self::inTiyin(self::UZS_SOM) : $tiyin;
    }

    /**
     * Whether a value is a note this restaurant can hold.
     */
    public static function knows(int $tiyin): bool
    {
        return in_array($tiyin, self::ladder(), true);
    }

    /**
     * What a counted drawer comes to.
     *
     * Refuses a denomination outside the ladder rather than skipping it or
     * trusting it. Both alternatives are worse than a refusal: skipping makes
     * the drawer read short by exactly the notes somebody miskeyed, and trusting
     * makes a fat-fingered `250000` into a quarter-million so'm surplus that the
     * Z-report reports as fact.
     *
     * @param array<array-key, int|string> $breakdown Denomination in tiyin => how many notes.
     *
     * @throws ApiException when a key is not a note, or a count is negative
     */
    public static function total(array $breakdown): int
    {
        $total = 0;

        foreach (self::normalise($breakdown) as $note => $pieces) {
            $total += $note * $pieces;
        }

        return $total;
    }

    /**
     * The same breakdown with the noise taken out: integer keys and counts,
     * zero rows dropped, largest note first.
     *
     * Zero rows are dropped rather than kept because a client renders the whole
     * ladder and posts it whole — storing `{"200000": 0}` eight times over would
     * make every stored count mostly padding, and a reader could not tell a note
     * that was counted as none from one that was never offered.
     *
     * @param array<array-key, int|string> $breakdown
     *
     * @return array<int, int>
     *
     * @throws ApiException
     */
    public static function normalise(array $breakdown): array
    {
        $clean = [];

        foreach ($breakdown as $note => $pieces) {
            $note = (int) $note;
            $pieces = (int) $pieces;

            if (! self::knows($note)) {
                throw ApiException::of('finance.unknown_denomination', field: 'denominations', meta: [
                    'denomination' => $note,
                    'accepted' => self::ladder(),
                ]);
            }

            if ($pieces < 0) {
                throw ApiException::of('finance.negative_note_count', field: 'denominations', meta: [
                    'denomination' => $note,
                    'count' => $pieces,
                ]);
            }

            if ($pieces > 0) {
                $clean[$note] = $pieces;
            }
        }

        krsort($clean);

        return $clean;
    }

    /**
     * The smallest note in circulation.
     *
     * The reason it matters: cash is rounded so the drawer can pay in notes that
     * exist, so a rounding step smaller than this note would round a bill to a
     * figure nobody can hand over. DayCloseLadderTest asserts the two agree.
     */
    public static function smallest(): int
    {
        $ladder = self::ladder();

        return (int) end($ladder);
    }

    /**
     * @param list<int> $som
     *
     * @return list<int>
     */
    private static function inTiyin(array $som): array
    {
        return array_map(static fn (int $note): int => $note * 100, $som);
    }
}

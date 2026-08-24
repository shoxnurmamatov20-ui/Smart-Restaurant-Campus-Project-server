<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use RuntimeException;

/**
 * What a human found in the drawer.
 *
 * A value object rather than an integer, because "45 000 000 tiyin" and "nine
 * 50 000 notes" are not the same claim. The second can be checked — nine times
 * 50 000 is 450 000 so'm, and if the cashier typed a total that disagrees with
 * their own denominations, one of the two is wrong and the system knows it before
 * the drawer is locked. The first can only be believed.
 *
 * That distinction is the whole reason for counting by denomination, and it is why
 * `isCounted()` exists: a Z-report should be able to say whether the figure it is
 * reconciling against was counted note by note or typed in as a round number. They
 * are two different levels of confidence and a manager reading a 30 000 so'm
 * shortfall deserves to know which one they are looking at.
 *
 * Every amount is tiyin. The denominations are the notes in circulation — nothing
 * below 1 000 so'm is worth counting, because DECISIONS Q7 rounds cash to that
 * boundary and no drawer holds anything smaller.
 */
final readonly class CashCount
{
    /**
     * @param array<int, int> $breakdown Denomination in tiyin => how many of them.
     */
    private function __construct(
        public array $breakdown,
        private ?int $flat,
    ) {}

    /**
     * Counted note by note.
     *
     * @param array<int, int> $breakdown Denomination in tiyin => count.
     *
     * @throws RuntimeException on a negative count or a denomination of zero — both
     *                          are a client sending nonsense, and a drawer total
     *                          quietly reduced by a negative "count" is the shape a
     *                          theft would take.
     */
    public static function ofNotes(array $breakdown): self
    {
        foreach ($breakdown as $denomination => $count) {
            if ($denomination <= 0) {
                throw new RuntimeException('Nominal noldan katta bo\'lishi kerak.');
            }

            if ($count < 0) {
                throw new RuntimeException('Dona manfiy bo\'la olmaydi.');
            }
        }

        return new self($breakdown, null);
    }

    /**
     * A total with no denominations behind it.
     *
     * The lesser form, and named so it reads as one at the call site. It exists for
     * the paths that predate counting — an API client sending a figure, a test
     * setting one up — and for a venue that genuinely does not count by note. What
     * it cannot do is be checked against itself.
     */
    public static function ofTotal(int $total): self
    {
        if ($total < 0) {
            throw new RuntimeException('Sanalgan naqd manfiy bo\'la olmaydi.');
        }

        return new self([], $total);
    }

    /**
     * The counted total, in tiyin.
     *
     * Multiplied out rather than summed: `array_sum` over the counts would add the
     * QUANTITIES — nine notes becoming nine tiyin — and the result would look like a
     * catastrophic shortfall rather than a bug.
     */
    public function total(): int
    {
        if ($this->flat !== null) {
            return $this->flat;
        }

        $total = 0;

        foreach ($this->breakdown as $denomination => $count) {
            $total += $denomination * $count;
        }

        return $total;
    }

    /** Whether this was counted note by note, or merely stated. */
    public function isCounted(): bool
    {
        return $this->flat === null;
    }

    /**
     * Whether a total the client also sent agrees with the notes it listed.
     *
     * The check the whole type exists for. A disagreement means the tablet's own
     * arithmetic and its inputs have diverged — a mistyped count, a stale field, a
     * denomination the client does not know about — and the right answer is to
     * refuse and make somebody look, not to pick one of the two numbers.
     */
    public function agreesWith(?int $claimedTotal): bool
    {
        return $claimedTotal === null || $claimedTotal === $this->total();
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'total' => $this->total(),
            'counted' => $this->isCounted(),
            'breakdown' => $this->breakdown,
        ];
    }
}

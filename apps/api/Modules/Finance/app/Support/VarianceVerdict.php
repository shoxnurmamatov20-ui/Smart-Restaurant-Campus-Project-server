<?php

declare(strict_types=1);

namespace Modules\Finance\Support;

/**
 * What one difference demands, decided once and read everywhere.
 *
 * The till asks for this before it shows the count screen — so the cashier is
 * told "this needs the manager" while the manager is still on the floor, rather
 * than after the drawer is counted and the refusal arrives with a queue waiting.
 * The closing path asks for the same verdict again and enforces it, because a
 * client that was told what is required is not the same as a server that checked
 * it.
 */
final readonly class VarianceVerdict
{
    /**
     * @param  int  $difference  Counted − expected, in tiyin. Signed: negative is short.
     * @param  array{reason: int, approval: int, owner: int}  $thresholds  The rungs in tiyin,
     *                                                                     so a client can say
     *                                                                     how far over the line
     *                                                                     a drawer is.
     */
    public function __construct(
        public int $difference,
        public bool $needsReason,
        public bool $needsApproval,
        public bool $notifiesOwner,
        public array $thresholds = ['reason' => 0, 'approval' => 0, 'owner' => 0],
    ) {}

    public function isClean(): bool
    {
        return $this->difference === 0;
    }

    /** Short by this much, or zero when the drawer is over. */
    public function shortfall(): int
    {
        return $this->difference < 0 ? -$this->difference : 0;
    }

    /** Over by this much, or zero when the drawer is short. */
    public function surplus(): int
    {
        return max(0, $this->difference);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'difference' => $this->difference,
            'is_clean' => $this->isClean(),
            'shortfall' => $this->shortfall(),
            'surplus' => $this->surplus(),
            'needs_reason' => $this->needsReason,
            'needs_approval' => $this->needsApproval,
            'notifies_owner' => $this->notifiesOwner,
            'thresholds' => $this->thresholds,
        ];
    }
}

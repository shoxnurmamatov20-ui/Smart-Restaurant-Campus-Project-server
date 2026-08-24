<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * One ingredient and how much of it went, over a window.
 *
 * `quantity` is in the ingredient's own base unit and `unit` travels with it,
 * because a store holds grams, millilitres and pieces and a number without its
 * unit is a number somebody will re-enter wrong.
 *
 * `costTiyin` is what it cost at today's `cost_per_unit`, not at the price it
 * was bought for. That is a deliberate simplification and worth naming: proper
 * costing is FIFO over receipt batches, which this platform does not keep yet,
 * so the figure moves when a supplier's price does. It is honest for "what did
 * the kitchen eat this week" and it is NOT a valuation.
 */
final readonly class ConsumedLine
{
    public function __construct(
        public int $ingredientId,
        public string $name,
        public string $unit,
        public int $quantity,
        public int $costTiyin,
    ) {}
}

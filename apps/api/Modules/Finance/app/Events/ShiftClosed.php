<?php

declare(strict_types=1);

namespace Modules\Finance\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Finance\Models\CashShift;

/**
 * A till was counted and shut.
 *
 * The end of a trading day for one drawer, and the moment several other parts of
 * the business have something to do: analytics can close the day's revenue,
 * the owner's phone can show the evening's figure, a rota can mark the cashier
 * off. Finance publishes it and knows about none of them.
 */
final class ShiftClosed extends DomainEvent
{
    public function __construct(private readonly CashShift $shift) {}

    public function name(): string
    {
        return 'finance.shift_closed';
    }

    /**
     * Ids and values, never the model — a subscriber that received a CashShift
     * would be coupled to this module's schema, which is what the bus exists to
     * prevent.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'cash_shift_id' => (int) $this->shift->getKey(),
            'number' => (string) $this->shift->number,
            'branch_id' => $this->shift->branch_id,
            'opened_by_user_id' => $this->shift->opened_by_user_id,
            'closed_by_user_id' => $this->shift->closed_by_user_id,
            'opened_at' => $this->shift->opened_at->toIso8601String(),
            'closed_at' => $this->shift->closed_at?->toIso8601String(),
            'expected_cash' => (int) $this->shift->expected_cash,
            'counted_cash' => (int) $this->shift->counted_cash,
            'difference' => (int) $this->shift->difference,
            'currency' => 'UZS',
        ];
    }

    /** Narrowed from the parent's `?Model`: this event always has its shift. */
    public function aggregate(): Model
    {
        return $this->shift;
    }

    public function tenantId(): ?int
    {
        return $this->shift->tenant_id;
    }
}

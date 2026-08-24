<?php

declare(strict_types=1);

namespace Modules\Finance\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Support\VarianceVerdict;

/**
 * A drawer was out by enough that the owner hears about it tonight.
 *
 * The last rung of the closing ladder. Below it a difference is explained and,
 * past the middle rung, authorised by a manager — both of which happen inside
 * the restaurant. This one leaves it: the person who carries the loss is told
 * the same evening rather than at the end of the month, because the difference
 * between one bad night and a habit is whether anybody noticed the first one.
 *
 * Published rather than notified directly. Finance does not know whether this
 * restaurant's owner reads Telegram, email or a dashboard, and it must not have
 * to — that decision belongs to whatever subscribes.
 */
final class ShiftVarianceFlagged extends DomainEvent
{
    public function __construct(
        private readonly CashShift $shift,
        private readonly VarianceVerdict $verdict,
    ) {}

    public function name(): string
    {
        return 'finance.shift_variance_flagged';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'cash_shift_id' => (int) $this->shift->getKey(),
            'number' => (string) $this->shift->number,
            'branch_id' => $this->shift->branch_id,
            'closed_by_user_id' => $this->shift->closed_by_user_id,
            'approved_by_user_id' => $this->shift->approved_by_user_id,
            'closed_at' => $this->shift->closed_at?->toIso8601String(),
            'expected_cash' => (int) $this->shift->expected_cash,
            'counted_cash' => (int) $this->shift->counted_cash,
            // Signed, and the sign is the story: short is money gone, over is
            // usually a sale that was taken and never rung up. A subscriber that
            // only alerted on shortfalls would ignore the half that is theft.
            'difference' => $this->verdict->difference,
            'shortfall' => $this->verdict->shortfall(),
            'surplus' => $this->verdict->surplus(),
            'reason' => $this->shift->difference_reason,
            'threshold' => $this->verdict->thresholds['owner'],
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

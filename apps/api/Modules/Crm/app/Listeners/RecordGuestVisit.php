<?php

declare(strict_types=1);

namespace Modules\Crm\Listeners;

use App\Support\Events\ProcessedEvents;
use App\Support\Events\ReceivedEvent;
use Modules\Crm\Models\Customer;

/**
 * Credits a settled bill to the guest who ate it.
 *
 * Subscribes to `orders.paid` by name. Nothing here imports anything from
 * Orders, and Orders has never heard of loyalty — which is what lets either
 * module change, or move to its own service, without touching the other.
 */
final readonly class RecordGuestVisit
{
    public function __construct(private ProcessedEvents $processed) {}

    public function handle(ReceivedEvent $event): void
    {
        $customerId = $event->get('customer_id');

        // A walk-in who never gave a phone number. Most bills are this.
        if (! is_int($customerId)) {
            return;
        }

        $total = $event->integer('total');

        if ($total <= 0) {
            return;
        }

        // Delivery is at-least-once, and counting one dinner twice would move a
        // guest into a tier they did not earn.
        $this->processed->once($event, self::class, function () use ($customerId, $total): void {
            // Locked because the same guest can settle two bills at once — one
            // at the table, one at the bar — and a read-modify-write on an
            // unlocked row silently drops the smaller of them.
            $customer = Customer::query()->lockForUpdate()->find($customerId);

            if ($customer === null) {
                return;
            }

            $customer->forceFill([
                'visits_count' => $customer->visits_count + 1,
                'total_spent' => $customer->total_spent + $total,
            ])->save();

            $customer->recalculateTier();
        });
    }
}

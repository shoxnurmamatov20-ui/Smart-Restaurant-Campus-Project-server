<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use App\Contracts\Orders\BillRegistry;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\CustomerDish;
use Modules\Crm\Models\TriggerSend;

/**
 * Everything a settled bill teaches CRM about the guest who ate it.
 *
 * Three answers come out of one event, and they are here rather than in the
 * listener because two of them are wanted from a seeder as well: a demo
 * restaurant whose guests have no last visit and no usual order draws exactly
 * the screens this wave was built to stop drawing.
 *
 * ---------------------------------------------------------------------------
 * The lines come from the contract, not from the payload
 *
 * `orders.paid` carries totals and ids and no lines, and adding them would put
 * a copy of a bill inside an event envelope — every subscriber that only wanted
 * the total would carry it, and the envelope is stored forever. `BillRegistry`
 * is the contract that exists for exactly this: CRM asks Orders a question
 * without importing anything from it, and gets `null` when Orders is switched
 * off, at which point the tally simply does not move.
 */
final readonly class GuestVisits
{
    public function __construct(private BillRegistry $bills) {}

    /**
     * Credit one settled bill to one guest.
     *
     * Called once per bill — the caller is responsible for that, and the
     * listener uses `ProcessedEvents::once` because delivery is at-least-once
     * and counting one dinner twice moves somebody into a tier they did not
     * earn.
     */
    public function record(Customer $customer, int $total, ?int $orderId, ?Carbon $at = null): void
    {
        $when = $at ?? now();

        $customer->forceFill([
            'visits_count' => $customer->visits_count + 1,
            'total_spent' => $customer->total_spent + $total,
            /*
             * Never moved backwards. A bill settled late out of an offline queue
             * arrives after a dinner that happened after it, and "last seen" has
             * to mean the most recent visit rather than the most recent write.
             */
            'last_visit_at' => $customer->last_visit_at !== null && $customer->last_visit_at->gt($when)
                ? $customer->last_visit_at
                : $when,
        ])->save();

        $customer->recalculateTier();

        if ($orderId !== null) {
            $this->tallyDishes($customer, $orderId, $when);
        }

        $this->markConversions($customer, $when);
    }

    /**
     * Move this guest's dish tally by the bill they just paid.
     *
     * Counted per bill rather than per portion: a family ordering six plov once
     * is not a plov regular. `distinct` on the menu item id is what makes that
     * true — two lines of the same dish on one ticket are one bill's worth.
     */
    private function tallyDishes(Customer $customer, int $orderId, Carbon $when): void
    {
        $bill = $this->bills->find($orderId);

        if ($bill === null) {
            return;
        }

        /** @var array<int, string> $titles */
        $titles = [];

        foreach ($bill->lines as $line) {
            // A void is not an order. A line the guest sent back must not
            // become the thing an operator offers them next time they ring.
            if ($line->menuItemId === null || $line->status === 'void') {
                continue;
            }

            $titles[$line->menuItemId] = $line->title;
        }

        if ($titles === []) {
            return;
        }

        foreach ($titles as $menuItemId => $title) {
            /*
             * Upsert rather than find-or-create: two bills of the same guest can
             * settle at the same second — one at the table, one at the bar — and
             * a read-modify-write on an unlocked row silently drops one of them.
             */
            CustomerDish::query()->upsert(
                [[
                    'tenant_id' => $customer->tenant_id,
                    'customer_id' => $customer->id,
                    'menu_item_id' => $menuItemId,
                    'title' => $title,
                    'times' => 1,
                    'last_at' => $when,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]],
                ['tenant_id', 'customer_id', 'menu_item_id'],
                [
                    'times' => DB::raw('crm.customer_dishes.times + 1'),
                    // The name follows the menu: a dish renamed last spring
                    // should not be read out to a guest under its old name.
                    'title' => DB::raw('excluded.title'),
                    'last_at' => DB::raw('excluded.last_at'),
                    'updated_at' => DB::raw('excluded.updated_at'),
                ],
            );
        }

        $this->refreshUsualOrder($customer);
    }

    /**
     * Write the top of the tally onto the guest.
     *
     * Denormalised for the two reads that have somebody waiting on them — the
     * console's page of a hundred guests, and the caller card an operator is
     * looking at with a telephone in their hand. Ties are broken by the most
     * recent, so a guest who has switched what they order says so.
     */
    public function refreshUsualOrder(Customer $customer): void
    {
        $top = CustomerDish::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('times')
            ->orderByDesc('last_at')
            ->first();

        if ($top === null) {
            return;
        }

        $customer->forceFill([
            'usual_order' => $top->title,
            'usual_order_item_id' => $top->menu_item_id,
        ])->save();
    }

    /**
     * A guest who came in after an automated message came in because of it.
     *
     * Only inside the attribution window, and only the sends that have not been
     * counted yet. Both halves matter: without the window every trigger would
     * eventually claim every regular, and without the `converted` flag a guest
     * who ate four times in a fortnight would be four conversions of one
     * message.
     */
    private function markConversions(Customer $customer, Carbon $when): void
    {
        $window = (int) config('crm.campaigns.attribution_days');

        TriggerSend::query()
            ->where('customer_id', $customer->id)
            ->where('converted', false)
            ->where('created_at', '>=', $when->copy()->subDays($window))
            ->where('created_at', '<=', $when)
            ->update(['converted' => true, 'converted_at' => $when, 'updated_at' => now()]);
    }
}

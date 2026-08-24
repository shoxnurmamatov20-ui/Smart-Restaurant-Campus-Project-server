<?php

declare(strict_types=1);

namespace App\Contracts\Kitchen;

use App\Contracts\Orders\Bill;

/**
 * Firing a bill at the kitchen, from a module that may not know the kitchen.
 *
 * This pays a debt the architecture test has been carrying in writing:
 *
 *     'Kitchen' => ['Orders' => 'A ticket is opened from a bill.
 *                               To become a subscriber to orders.confirmed.']
 *
 * Kitchen imported `Modules\Orders\Models\Order` and read its items directly,
 * which meant every column Orders renamed was a column Kitchen broke on, and
 * neither module could be deployed without the other. The direction is now the
 * other way and through a contract: Orders hands over a `Bill` — the shape it
 * already publishes to everyone else — and Kitchen decides what a docket is.
 *
 * Called from inside `BillRegistry::send()`'s transaction, which is the point.
 * A bill that reached `placed` without its dockets is an order the kitchen
 * never heard about, and it happened: firing was two calls, and a tablet that
 * lost signal between them left a bill looking sent with nothing on any pass.
 * One transaction means both or neither.
 */
interface TicketWriter
{
    /**
     * Open or update the dockets for a bill, one per station.
     *
     * Grouped by station because that is how a kitchen is laid out: the grill
     * does not want the salad's lines and cannot see the pastry's screen.
     *
     * Re-firing an edited bill updates the existing docket in place rather than
     * printing a second one — a cook holding two pieces of paper for one table
     * has to reconcile them by hand, mid-service, and will get it wrong.
     *
     * @return array<int, int> The ticket ids that were opened or updated.
     */
    public function fire(Bill $bill): array;
}

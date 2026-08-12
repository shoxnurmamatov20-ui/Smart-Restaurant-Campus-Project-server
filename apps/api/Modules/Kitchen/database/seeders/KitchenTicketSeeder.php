<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Modules\Kitchen\Models\KitchenTicket;

/**
 * A board with something on it.
 *
 * The chef is the one role whose entire workspace is a single screen, and until
 * now that screen was empty on a seeded database: KitchenDatabaseSeeder creates
 * the five stations and nothing to put on them. A demo where the kitchen has no
 * tickets cannot show the thing the kitchen module is for.
 *
 * Tickets are derived from the orders that already exist rather than invented,
 * so the board and the order list agree: every ticket names an order that is
 * really there, at the table it is really at, holding the lines that were
 * really ordered. A board that disagreed with the floor would be worse than an
 * empty one — it would teach the wrong thing about how the two connect.
 *
 * One ticket per (order, station): that is the rule the real dispatcher
 * follows. An order of soup and a steak becomes two tickets, one on each
 * screen, because two people cook them.
 */
final class KitchenTicketSeeder extends Seeder
{
    /**
     * Where each ticket sits in its life, spread so the board is worth looking
     * at: some just fired, some being cooked, some up and waiting for a runner.
     *
     * Late ones are the point of the screen — the design colours a ticket past
     * its SLA red — so the oldest are deliberately left `cooking`.
     */
    private const SPREAD = ['new', 'new', 'cooking', 'cooking', 'ready'];

    public function run(): void
    {
        // Read through the query builder rather than the Orders models: a
        // module never imports another module's classes (ModuleBoundaryTest),
        // and the two tables live in different schemas on purpose.
        $orders = DB::table('orders.orders')
            ->whereIn('status', ['placed', 'accepted', 'cooking', 'ready'])
            ->orderBy('id')
            ->get(['id', 'tenant_id', 'number', 'channel', 'table_label', 'placed_at']);

        if ($orders->isEmpty()) {
            $this->command?->warn('⏭  Kitchen: ochiq buyurtma yo\'q — avval OrdersDatabaseSeeder.');

            return;
        }

        $slas = DB::table('kitchen.kitchen_stations')->pluck('sla_minutes', 'code');
        $created = 0;

        foreach ($orders as $index => $order) {
            $lines = DB::table('orders.order_items')
                ->where('order_id', $order->id)
                ->get(['sku', 'title', 'station', 'quantity', 'note']);

            if ($lines->isEmpty()) {
                continue;
            }

            foreach ($lines->groupBy('station') as $station => $stationLines) {
                $station = (string) ($station ?: 'hot');
                $status = self::SPREAD[($index + $created) % count(self::SPREAD)];
                $placed = $order->placed_at === null ? now()->subMinutes(12) : now()->parse($order->placed_at);

                KitchenTicket::query()->updateOrCreate(
                    ['order_id' => $order->id, 'station' => $station],
                    [
                        'tenant_id' => $order->tenant_id,
                        'order_number' => $order->number,
                        // The order carries the label itself — a table can be
                        // renamed or retired and the ticket should still say
                        // where the food goes.
                        'table_label' => $order->table_label,
                        'channel' => $order->channel,
                        'status' => $status,
                        'lines' => $stationLines->map(fn ($line): array => [
                            'sku' => $line->sku,
                            'title' => $line->title,
                            'quantity' => (int) $line->quantity,
                            'note' => $line->note,
                        ])->all(),
                        'sla_minutes' => (int) ($slas[$station] ?? 20),
                        // The clocks the board reads. A `cooking` ticket has
                        // started and not finished; a `ready` one has both, and
                        // the gap between them is the prep time the analytics
                        // screen averages.
                        'started_at' => $status === 'new' ? null : $placed->copy()->addMinutes(2),
                        'ready_at' => $status === 'ready' ? $placed->copy()->addMinutes(11) : null,
                        'served_at' => null,
                    ],
                );

                $created++;
            }
        }

        $this->command?->info("✅ Kitchen: {$created} ta chipta sexlarga tarqatildi.");
    }
}

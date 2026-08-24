<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Seeders;

use App\Support\Counters\BranchCounters;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Modules\Inventory\Models\Ingredient;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\PurchaseOrderItem;
use Modules\Suppliers\Models\Supplier;

/**
 * What the restaurant ordered, and what turned up.
 *
 * SuppliersDatabaseSeeder writes four companies and buys nothing from them,
 * which leaves the purchase-order table empty — and an empty purchase-order
 * table is why the storekeeper's screen still shows a column of em dashes where
 * a supplier's name belongs. Every ingredient on the shelf came from somebody;
 * this is the paperwork that says who.
 *
 * Orders are built from what already exists rather than invented beside it:
 * each supplier's basket is the ingredients they plausibly sell, the quantities
 * are a share of what that ingredient's shelf holds, and the price is the
 * ingredient's own `cost_per_unit`. So a delivery of eighteen kilograms of lamb
 * costs what eighteen kilograms of lamb are carried at, and the stock valuation
 * and the payable agree by construction.
 *
 * Suppliers may read Inventory — the edge is recorded in ModuleBoundaryTest and
 * is exactly this: receiving a delivery raises stock.
 *
 * Four received, three open, one cancelled. The cancelled one is not filler: it
 * is the state a list of orders is most likely to draw wrongly, because it is
 * the only one that has an expected date in the past and will never arrive.
 */
final class PurchaseOrderSeeder extends Seeder
{
    /**
     * Which supplier sells what. Keyed by the codes SuppliersDatabaseSeeder
     * writes and the SKUs InventoryDatabaseSeeder writes, so a change to either
     * list shows up here as a missing basket rather than a silent mismatch.
     *
     * @var array<string, array<int, string>>
     */
    private const BASKETS = [
        'SUP-001' => ['ING-0001', 'ING-0002', 'ING-0003'],
        'SUP-002' => ['ING-0005', 'ING-0006', 'ING-0009'],
        'SUP-003' => ['ING-0004', 'ING-0007'],
        'SUP-004' => ['ING-0008', 'ING-0010'],
    ];

    /**
     * The book. Days are relative to today; `share` is the percentage of the
     * ingredient's current shelf the line is sized at.
     *
     * A received order's share stays under a half deliberately. The stock
     * ledger is derived from these deliveries and has to reach today's balance
     * without ever passing through a negative one — see StockMovementSeeder,
     * which cannot hold that promise if a single delivery is larger than the
     * shelf it landed on.
     *
     * @var array<int, array{number: string, supplier: string, status: string, expected: array{int, int}, received: ?array{int, int}, share: int, note: ?string}>
     */
    private const ORDERS = [
        [
            'number' => 'PO-0001', 'supplier' => 'SUP-001', 'status' => 'received',
            'expected' => [-4, 9], 'received' => [-4, 8], 'share' => 40, 'note' => null,
        ],
        [
            'number' => 'PO-0002', 'supplier' => 'SUP-002', 'status' => 'received',
            'expected' => [-3, 8], 'received' => [-3, 7], 'share' => 40, 'note' => null,
        ],
        [
            // Ordered for Tuesday, arrived Thursday. The on-time column on the
            // suppliers screen is computed from exactly this gap, so the demo
            // needs at least one supplier who is not perfect.
            'number' => 'PO-0003', 'supplier' => 'SUP-003', 'status' => 'received',
            'expected' => [-4, 10], 'received' => [-2, 9], 'share' => 40,
            'note' => 'Ikki kun kechikdi — omborda un tugagan edi',
        ],
        [
            'number' => 'PO-0004', 'supplier' => 'SUP-004', 'status' => 'received',
            'expected' => [-1, 11], 'received' => [-1, 11], 'share' => 40, 'note' => null,
        ],
        [
            'number' => 'PO-0005', 'supplier' => 'SUP-001', 'status' => 'confirmed',
            'expected' => [1, 9], 'received' => null, 'share' => 60, 'note' => null,
        ],
        [
            'number' => 'PO-0006', 'supplier' => 'SUP-002', 'status' => 'sent',
            'expected' => [0, 15], 'received' => null, 'share' => 60, 'note' => null,
        ],
        [
            'number' => 'PO-0007', 'supplier' => 'SUP-003', 'status' => 'draft',
            'expected' => [3, 10], 'received' => null, 'share' => 60,
            'note' => 'Narx so\'ralmoqda',
        ],
        [
            'number' => 'PO-0008', 'supplier' => 'SUP-004', 'status' => 'cancelled',
            'expected' => [-5, 12], 'received' => null, 'share' => 40,
            'note' => 'Yetkazib beruvchi narxni ikki barobar oshirdi',
        ],
    ];

    /**
     * How an order is rounded up to something a supplier will actually send.
     *
     * Nobody delivers 18 437 grams. Weight and volume go out in whole kilos and
     * litres; pieces go out in tens, because eggs come in trays.
     */
    private const PACK = ['g' => 1000, 'ml' => 1000, 'pcs' => 10];

    public function run(): void
    {
        /** @var Collection<string, Supplier> $suppliers */
        $suppliers = Supplier::query()->get()->keyBy('code');

        if ($suppliers->isEmpty()) {
            $this->command?->warn('⏭  Suppliers: yetkazib beruvchi yo\'q — avval SuppliersDatabaseSeeder.');

            return;
        }

        /** @var Collection<string, Ingredient> $ingredients */
        $ingredients = Ingredient::query()->get()->keyBy('sku');

        if ($ingredients->isEmpty()) {
            $this->command?->warn('⏭  Suppliers: ingredient yo\'q — avval InventoryDatabaseSeeder.');

            return;
        }

        $written = 0;
        $lines = 0;

        foreach (self::ORDERS as $row) {
            $supplier = $suppliers->get($row['supplier']);

            // A supplier the demo does not have — nothing to order from.
            // The basket is not guarded: every code in ORDERS is a key of
            // BASKETS, and PHPStan proves it, so a check here would be dead
            // code pretending to be defensive.
            if ($supplier === null) {
                continue;
            }

            $basket = self::BASKETS[$row['supplier']];

            $order = PurchaseOrder::query()->updateOrCreate(
                ['number' => $row['number']],
                [
                    'tenant_id' => $supplier->tenant_id,
                    'supplier_id' => $supplier->id,
                    'status' => $row['status'],
                    'expected_at' => self::at($row['expected']),
                    'received_at' => $row['received'] === null ? null : self::at($row['received']),
                    'note' => $row['note'],
                ],
            );

            foreach ($basket as $sku) {
                $ingredient = $ingredients->get($sku);

                if ($ingredient === null) {
                    continue;
                }

                $quantity = self::quantityFor($ingredient, $row['share']);

                PurchaseOrderItem::query()->updateOrCreate(
                    ['purchase_order_id' => $order->id, 'ingredient_id' => $ingredient->id],
                    [
                        'tenant_id' => $supplier->tenant_id,
                        'name' => $ingredient->name,
                        // The document states its own units. `ingredient_id` is
                        // nullable by design, so a delivery note that leaned on
                        // the ingredient row would stop meaning anything the
                        // first time a product was delisted.
                        'unit' => $ingredient->unit,
                        'quantity' => $quantity,
                        'unit_price' => $ingredient->cost_per_unit,
                        'total_price' => $quantity * $ingredient->cost_per_unit,
                    ],
                );

                $lines++;
            }

            // Never written by hand: the header total is the sum of the lines,
            // so a line added later cannot leave the order claiming a figure
            // its own contents disagree with.
            $order->recalculateTotal();
            $written++;

            /*
             * The column the supplier list reads, kept in step with the book.
             *
             * `receive()` writes it on every real delivery; a seeded one never
             * goes through that call, so without this the demo shows four
             * suppliers who have delivered four times each and never once.
             */
            if ($row['received'] !== null && $order->received_at !== null) {
                $latest = $supplier->last_delivery_at;

                if ($latest === null || $latest->lessThan($order->received_at)) {
                    $supplier->forceFill(['last_delivery_at' => $order->received_at])->save();
                }
            }
        }

        $this->claimTheNumbersAlreadyUsed();

        $this->command?->info(sprintf(
            '✅ Suppliers: %d ta xarid buyurtmasi, %d qator (%d tasi ochiq).',
            $written,
            $lines,
            PurchaseOrder::query()->open()->count(),
        ));
    }

    /**
     * Tell the counter which document numbers this file has already spent.
     *
     * `PurchaseOrder::nextNumber()` takes from `branch_counters`, which starts
     * at zero on a fresh database — so the first order a buyer raises in the
     * console would be PO-0001, collide with the seeded one, and answer 500 on
     * a unique index. Advancing the counter by hand is the honest fix: this
     * seeder took eight numbers, so it says so.
     *
     * `next()` one at a time rather than writing the row: the counter's
     * atomicity is the database's guarantee and there is no second door into it.
     */
    private function claimTheNumbersAlreadyUsed(): void
    {
        $counters = app(BranchCounters::class);
        $highest = count(self::ORDERS);

        for ($taken = 0; $taken < $highest; $taken++) {
            if ($counters->next('purchase_order.number') >= $highest) {
                return;
            }
        }
    }

    /**
     * A quantity a supplier would recognise: a share of the shelf, rounded up
     * to a whole pack, and never zero — an order line for nothing is not an
     * order line.
     */
    private static function quantityFor(Ingredient $ingredient, int $sharePercent): int
    {
        $pack = self::PACK[$ingredient->unit] ?? 1;
        $raw = intdiv($ingredient->stock_quantity * $sharePercent, 100);

        return max($pack, intdiv($raw, $pack) * $pack);
    }

    /** @param  array{int, int}  $dayAndHour */
    private static function at(array $dayAndHour): Carbon
    {
        [$day, $hour] = $dayAndHour;

        return now()->startOfDay()->addDays($day)->addHours($hour);
    }
}

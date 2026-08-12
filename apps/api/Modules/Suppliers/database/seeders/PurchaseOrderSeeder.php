<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\PurchaseOrderItem;
use Modules\Suppliers\Models\Supplier;

/**
 * Orders out to suppliers, in the four states a storekeeper resolves.
 *
 * SuppliersDatabaseSeeder creates four suppliers and no orders, so the
 * purchasing screen shows a contact list. What a storekeeper does on that
 * screen is chase the orders: one still being written, one sent and waiting,
 * one confirmed for tomorrow, one already received and needing checking off
 * against the delivery note.
 *
 * Line items are real ingredients at their recorded cost, so the order total is
 * the total of its lines — a figure a manager can query and a supplier can be
 * held to. Inventing a total would make the one number on the screen the one
 * number nobody can reproduce.
 */
final class PurchaseOrderSeeder extends Seeder
{
    /**
     * @var array<int, array{status: string, days: int, note: ?string, ingredients: array<int, int>}>
     */
    private const ORDERS = [
        [
            'status' => 'received', 'days' => -2,
            'note' => 'Yuk xati bilan solishtirildi, farq yo\'q',
            // ingredient id => quantity in base units (grams, millilitres, pieces)
            'ingredients' => [1 => 30_000, 2 => 25_000, 3 => 20_000],
        ],
        [
            'status' => 'confirmed', 'days' => 1,
            'note' => 'Ertaga ertalab 08:00 gacha yetkaziladi',
            'ingredients' => [5 => 40_000, 6 => 35_000, 9 => 15_000],
        ],
        [
            'status' => 'sent', 'days' => 3,
            'note' => null,
            'ingredients' => [4 => 100_000, 7 => 50_000],
        ],
        [
            'status' => 'draft', 'days' => 5,
            'note' => 'Narxlar tasdiqlanmagan',
            'ingredients' => [8 => 30_000, 10 => 300],
        ],
    ];

    public function run(): void
    {
        $suppliers = Supplier::query()->where('is_active', true)->orderBy('id')->get();

        if ($suppliers->isEmpty()) {
            $this->command?->warn('⏭  Suppliers: yetkazib beruvchi yo\'q — avval SuppliersDatabaseSeeder.');

            return;
        }

        // Query builder, not the Inventory models: a module never imports
        // another module's classes — see tests/Architecture/ModuleBoundaryTest.
        $ingredients = DB::table('inventory.ingredients')
            ->get(['id', 'name', 'cost_per_unit'])
            ->keyBy('id');

        if ($ingredients->isEmpty()) {
            $this->command?->warn('⏭  Suppliers: ingredient yo\'q — avval InventoryDatabaseSeeder.');

            return;
        }

        $created = 0;

        foreach (self::ORDERS as $index => $spec) {
            $supplier = $suppliers[$index % $suppliers->count()];
            $number = sprintf('PO-%04d', $index + 1);

            $order = PurchaseOrder::query()->updateOrCreate(
                ['number' => $number],
                [
                    'tenant_id' => $supplier->tenant_id,
                    'supplier_id' => $supplier->id,
                    'status' => $spec['status'],
                    'expected_at' => now()->addDays($spec['days'])->setTime(8, 0),
                    // Only a received order has a received date. A `sent` one
                    // carrying one would make the screen's "still waiting"
                    // filter quietly wrong.
                    'received_at' => $spec['status'] === 'received'
                        ? now()->addDays($spec['days'])->setTime(9, 20)
                        : null,
                    'total' => 0,
                    'note' => $spec['note'],
                ],
            );

            $total = 0;

            foreach ($spec['ingredients'] as $ingredientId => $quantity) {
                $ingredient = $ingredients[$ingredientId] ?? null;

                if ($ingredient === null) {
                    continue;
                }

                $unitPrice = (int) $ingredient->cost_per_unit;
                $linePrice = $unitPrice * $quantity;

                PurchaseOrderItem::query()->updateOrCreate(
                    ['purchase_order_id' => $order->id, 'ingredient_id' => $ingredientId],
                    [
                        'tenant_id' => $supplier->tenant_id,
                        // The name is copied rather than joined: a supplier's
                        // document names what was ordered on the day it was
                        // ordered, and renaming an ingredient later must not
                        // rewrite history.
                        'name' => $ingredient->name,
                        'quantity' => $quantity,
                        'unit_price' => $unitPrice,
                        'total_price' => $linePrice,
                    ],
                );

                $total += $linePrice;
            }

            // The total is the sum of the lines, written after them.
            $order->forceFill(['total' => $total])->save();
            $created++;
        }

        $this->command?->info("✅ Suppliers: {$created} ta xarid arizasi yozildi.");
    }
}

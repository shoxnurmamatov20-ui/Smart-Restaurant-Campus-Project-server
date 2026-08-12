<?php

declare(strict_types=1);

namespace Modules\Orders\Database\Seeders;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use Illuminate\Database\Seeder;
use Modules\Orders\Models\Order;

/**
 * A day of trading built from the real seeded menu, so Analytics has something
 * to chew on the moment the app boots.
 */
final class OrdersDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Through the platform contract, like any other read of another
        // module's data — a seeder is not an excuse to reach past the boundary.
        $dishes = collect(app(MenuCatalog::class)->sellable())
            ->flatMap(static fn (Section $section): array => $section->dishes);

        if ($dishes->isEmpty()) {
            $this->command?->warn('⚠️  Orders: menyu bo\'sh — avval MenuDatabaseSeeder ni ishga tushiring.');

            return;
        }

        // Bill numbers are unique per restaurant, so a second run would collide
        // rather than top up. Demo trading is generated once; re-seeding is for
        // picking up new *reference* data, not for doubling yesterday's takings.
        if (Order::query()->exists()) {
            $this->command?->line('⏭  Orders: buyurtmalar allaqachon mavjud.');

            return;
        }

        $created = 0;

        for ($i = 1; $i <= 25; $i++) {
            $order = Order::query()->create([
                'number' => sprintf('A-%04d', $i),
                'channel' => $i % 5 === 0 ? 'delivery' : 'dine_in',
                'status' => $i % 4 === 0 ? 'paid' : 'placed',
                'table_label' => $i % 5 === 0 ? null : sprintf('A-%d', ($i % 12) + 1),
                'guests_count' => random_int(1, 5),
                'placed_at' => now()->subMinutes(random_int(5, 600)),
            ]);

            foreach ($dishes->random(min(3, $dishes->count())) as $dish) {
                $quantity = random_int(1, 3);
                $order->items()->create([
                    'menu_item_id' => $dish->id,
                    'sku' => $dish->sku,
                    'title' => $dish->title,
                    'station' => $dish->station,
                    'quantity' => $quantity,
                    'unit_price' => $dish->price,
                    'total_price' => $dish->price * $quantity,
                    'status' => 'served',
                ]);
            }

            $order->recalculateTotals();
            $created++;
        }

        $this->command?->info(sprintf('✅ Orders: %d buyurtma yaratildi.', $created));
    }
}

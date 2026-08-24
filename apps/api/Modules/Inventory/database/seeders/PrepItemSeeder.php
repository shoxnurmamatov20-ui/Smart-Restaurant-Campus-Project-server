<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\PrepItem;

/**
 * The four things this kitchen makes before service.
 *
 * The same four the operations screen has drawn since it was built, moved out
 * of `stock-ops-data.ts` and into rows. Their numbers are the design's own —
 * a batch of zirvak is a kilo of ingredients that yields 880 g after twelve per
 * cent loss — so the console's arithmetic and the server's answer the same
 * question with the same figures.
 *
 * Deterministic, like every seeder here: the same seed produces the same
 * kitchen, which is what lets a test assert a batch cost rather than a shape.
 *
 * Runs after `InventoryDatabaseSeeder` because every component is an ingredient
 * looked up by SKU. A card whose beef does not exist yet is a card with no
 * cost, which is worse than no card.
 */
final class PrepItemSeeder extends Seeder
{
    /**
     * @var array<int, array{code: string, uz: string, ru: string, en: string, unit: string, batch: int, loss: int, shelf: int, on_hand: int, lines: array<string, int>}>
     */
    private const CARDS = [
        [
            'code' => 'zirvak',
            'uz' => 'Zirvak', 'ru' => 'Зирвак', 'en' => 'Zirvak',
            'unit' => 'g', 'batch' => 1000, 'loss' => 12, 'shelf' => 2, 'on_hand' => 2400,
            // Beef, onion, tomato, oil — grams and millilitres per batch.
            'lines' => ['ING-0002' => 400, 'ING-0006' => 250, 'ING-0009' => 150, 'ING-0008' => 120],
        ],
        [
            'code' => 'broth',
            'uz' => 'Qaynatma, mol', 'ru' => 'Бульон говяжий', 'en' => 'Beef broth',
            'unit' => 'ml', 'batch' => 8000, 'loss' => 18, 'shelf' => 2, 'on_hand' => 1600,
            'lines' => ['ING-0002' => 1200, 'ING-0006' => 300, 'ING-0009' => 200],
        ],
        [
            'code' => 'dough',
            'uz' => 'Xamir', 'ru' => 'Тесто', 'en' => 'Dough',
            // Zero on hand deliberately: one card the screen has to draw as
            // "make some", because a demo where everything is stocked never
            // proves the empty state renders.
            'unit' => 'g', 'batch' => 12_000, 'loss' => 4, 'shelf' => 1, 'on_hand' => 0,
            'lines' => ['ING-0007' => 8000, 'ING-0008' => 250],
        ],
        [
            'code' => 'mince',
            'uz' => 'Qiyma, aralash', 'ru' => 'Фарш смешанный', 'en' => 'Mixed mince',
            'unit' => 'g', 'batch' => 5000, 'loss' => 8, 'shelf' => 1, 'on_hand' => 3200,
            'lines' => ['ING-0002' => 3000, 'ING-0001' => 1500, 'ING-0006' => 600],
        ],
    ];

    public function run(): void
    {
        $bySku = Ingredient::query()->get()->keyBy('sku');

        foreach (self::CARDS as $card) {
            $item = PrepItem::query()->updateOrCreate(
                ['code' => $card['code']],
                [
                    'name' => ['uz' => $card['uz'], 'ru' => $card['ru'], 'en' => $card['en']],
                    'unit' => $card['unit'],
                    'batch_quantity' => $card['batch'],
                    'loss_percent' => $card['loss'],
                    'shelf_life_days' => $card['shelf'],
                    'on_hand' => $card['on_hand'],
                    'is_active' => true,
                ],
            );

            foreach ($card['lines'] as $sku => $quantity) {
                /** @var Ingredient|null $ingredient */
                $ingredient = $bySku->get($sku);

                if ($ingredient === null) {
                    continue;
                }

                $item->components()->updateOrCreate(
                    ['ingredient_id' => $ingredient->id],
                    ['tenant_id' => $item->tenant_id, 'quantity' => $quantity],
                );
            }
        }

        $this->command?->info(sprintf('✅ Inventory: %d yarim tayyor mahsulot kartasi.', count(self::CARDS)));
    }
}

<?php

declare(strict_types=1);

namespace Modules\Orders\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Orders\Models\OrderItem;
use Modules\Orders\Models\OrderItemModifier;

/**
 * @extends Factory<OrderItemModifier>
 */
final class OrderItemModifierFactory extends Factory
{
    protected $model = OrderItemModifier::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'order_item_id' => OrderItem::factory(),
            'name' => ['uz' => 'Qo\'shimcha go\'sht', 'ru' => 'Доп. мясо', 'en' => 'Extra meat'],
            // Tiyin. 14 000 so'm, the design's own figure.
            'price_delta' => 1_400_000,
        ];
    }
}

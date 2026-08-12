<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Requests;

use App\Rules\DishExists;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Orders\Models\OrderItem;

final class UpdateOrderItemRequest extends FormRequest
{
    /**
     * Route middleware (`permission:orders.update`) enforces authorisation.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'order_id' => ['sometimes', 'integer', 'exists:orders,id'],
            'menu_item_id' => ['nullable', 'integer', app(DishExists::class)],
            'sku' => ['sometimes', 'string', 'max:48'],
            'title' => ['sometimes', 'string', 'max:160'],
            'station' => ['nullable', 'string', 'max:32'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:99'],
            'unit_price' => ['sometimes', 'integer', 'min:0'],
            'status' => ['nullable', Rule::in(OrderItem::STATUSES)],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class UpdatePurchaseOrderItemRequest extends FormRequest
{
    /**
     * Route middleware (`permission:suppliers.update`) enforces authorisation.
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
            'purchase_order_id' => ['sometimes', 'integer', 'exists:purchase_orders,id'],
            'ingredient_id' => ['nullable', 'integer', 'exists:ingredients,id'],
            'name' => ['sometimes', 'string', 'max:160'],
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'unit_price' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}

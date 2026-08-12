<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class StorePurchaseOrderItemRequest extends FormRequest
{
    /**
     * Route middleware (`permission:suppliers.create`) enforces authorisation.
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
            'purchase_order_id' => ['required', 'integer', 'exists:purchase_orders,id'],
            'ingredient_id' => ['nullable', 'integer', 'exists:ingredients,id'],
            'name' => ['required', 'string', 'max:160'],
            'quantity' => ['required', 'integer', 'min:1'],
            'unit_price' => ['required', 'integer', 'min:0'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Inventory\Models\StockMovement;

final class UpdateStockMovementRequest extends FormRequest
{
    /**
     * Route middleware (`permission:inventory.update`) enforces authorisation.
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
            'ingredient_id' => ['sometimes', 'integer', 'exists:ingredients,id'],
            'kind' => ['sometimes', Rule::in(StockMovement::KINDS)],
            'quantity' => ['sometimes', 'integer', 'not_in:0'],
            'reason' => ['nullable', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:64'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Inventory\Models\Ingredient;

final class StoreIngredientRequest extends FormRequest
{
    /**
     * Route middleware (`permission:inventory.create`) enforces authorisation.
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
        $tenantId = app(TenantContext::class)->id();

        return [
            'sku' => ['required', 'string', 'max:48', Rule::unique('ingredients', 'sku')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['required', 'string', 'max:160'],
            'unit' => ['nullable', Rule::in(Ingredient::UNITS)],
            'stock_quantity' => ['nullable', 'integer'],
            'min_quantity' => ['nullable', 'integer', 'min:0'],
            'cost_per_unit' => ['nullable', 'integer', 'min:0'],
            'storage' => ['nullable', Rule::in(Ingredient::STORAGES)],
            'shelf_life_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'sku.unique' => 'Bu ingredient kodi allaqachon mavjud.',
        ];
    }
}

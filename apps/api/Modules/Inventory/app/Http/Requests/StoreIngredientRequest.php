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
            'barcode' => ['nullable', 'string', 'max:32', Rule::unique('ingredients', 'barcode')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'unit' => ['nullable', Rule::in(Ingredient::UNITS)],
            'purchase_unit' => ['nullable', Rule::in(Ingredient::PURCHASE_UNITS)],
            // At least one: an ingredient whose purchase unit holds nothing
            // would divide a shelf by zero on the way to the screen.
            'units_per_purchase' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'stock_quantity' => ['nullable', 'integer'],
            'min_quantity' => ['nullable', 'integer', 'min:0'],
            'cost_per_unit' => ['nullable', 'integer', 'min:0'],
            'storage' => ['nullable', Rule::in(Ingredient::STORAGES)],
            'store' => ['nullable', Rule::in(Ingredient::STORES)],
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

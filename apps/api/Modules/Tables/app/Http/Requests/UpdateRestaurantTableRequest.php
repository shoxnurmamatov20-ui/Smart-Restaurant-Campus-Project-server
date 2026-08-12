<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Tables\Models\RestaurantTable;

final class UpdateRestaurantTableRequest extends FormRequest
{
    /**
     * Route middleware (`permission:tables.update`) enforces authorisation.
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
            'hall_id' => ['sometimes', 'integer', 'exists:halls,id'],
            'label' => ['sometimes', 'string', 'max:32', Rule::unique('restaurant_tables', 'label')->ignore($this->route('table'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'seats' => ['nullable', 'integer', 'min:1', 'max:100'],
            'kind' => ['nullable', Rule::in(RestaurantTable::KINDS)],
            'status' => ['nullable', Rule::in(RestaurantTable::STATUSES)],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Tables\Models\RestaurantTable;

final class StoreRestaurantTableRequest extends FormRequest
{
    /**
     * Route middleware (`permission:tables.create`) enforces authorisation.
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
            'hall_id' => ['required', 'integer', 'exists:halls,id'],
            'label' => ['required', 'string', 'max:32', Rule::unique('restaurant_tables', 'label')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'seats' => ['nullable', 'integer', 'min:1', 'max:100'],
            'kind' => ['nullable', Rule::in(RestaurantTable::KINDS)],
            'status' => ['nullable', Rule::in(RestaurantTable::STATUSES)],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'label.required' => 'Stol raqami majburiy.',
            'seats.max' => "Bitta stolda 100 dan ortiq joy bo'lishi mumkin emas.",
        ];
    }
}

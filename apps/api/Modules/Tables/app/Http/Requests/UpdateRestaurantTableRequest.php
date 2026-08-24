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
            /*
             * Where the tile sits in its hall — the console's layout editor.
             *
             * A place in a sequence rather than an (x, y): the design's plan is
             * a wrapping grid of equal tiles, not a scale drawing of the room.
             * Capped at the column's own ceiling so a slipped keypress cannot
             * push a table past every other one and off the end of the plan.
             */
            'position' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'status' => ['nullable', Rule::in(RestaurantTable::STATUSES)],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateKitchenStationRequest extends FormRequest
{
    /**
     * Route middleware (`permission:kitchen.update`) enforces authorisation.
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
            'code' => ['sometimes', 'string', 'max:32', 'regex:/^[a-z_]+$/', Rule::unique('kitchen_stations', 'code')->ignore($this->route('station'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['sometimes', 'string', 'max:120'],
            'sla_minutes' => ['nullable', 'integer', 'min:1', 'max:240'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}

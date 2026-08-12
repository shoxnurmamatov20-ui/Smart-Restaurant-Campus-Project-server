<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreKitchenStationRequest extends FormRequest
{
    /**
     * Route middleware (`permission:kitchen.create`) enforces authorisation.
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
            'code' => ['required', 'string', 'max:32', 'regex:/^[a-z_]+$/', Rule::unique('kitchen_stations', 'code')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['required', 'string', 'max:120'],
            'sla_minutes' => ['nullable', 'integer', 'min:1', 'max:240'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.regex' => 'Sex kodi faqat kichik harf va pastki chiziqdan iborat.',
        ];
    }
}

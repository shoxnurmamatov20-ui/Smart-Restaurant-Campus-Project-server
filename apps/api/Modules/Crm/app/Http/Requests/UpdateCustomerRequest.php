<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Customer;

final class UpdateCustomerRequest extends FormRequest
{
    /**
     * Route middleware (`permission:crm.update`) enforces authorisation.
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
            'phone' => ['sometimes', 'string', 'max:32', Rule::unique('customers', 'phone')->ignore($this->route('customer'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['nullable', 'string', 'max:160'],
            'birthday' => ['nullable', 'date', 'before:today'],
            'tier' => ['nullable', Rule::in(Customer::TIERS)],
            'allergens' => ['nullable', 'array'],
            'allergens.*' => ['string', 'max:40'],
            'note' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}

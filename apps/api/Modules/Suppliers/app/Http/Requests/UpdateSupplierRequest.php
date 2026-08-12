<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateSupplierRequest extends FormRequest
{
    /**
     * Route middleware (`permission:suppliers.update`) enforces authorisation.
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
            'code' => ['sometimes', 'string', 'max:32', Rule::unique('suppliers', 'code')->ignore($this->route('supplier'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['sometimes', 'string', 'max:160'],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'payment_terms_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}

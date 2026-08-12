<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Suppliers\Models\PurchaseOrder;

final class StorePurchaseOrderRequest extends FormRequest
{
    /**
     * Route middleware (`permission:suppliers.create`) enforces authorisation.
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
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'number' => ['required', 'string', 'max:24', Rule::unique('purchase_orders', 'number')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'status' => ['nullable', Rule::in(PurchaseOrder::STATUSES)],
            'expected_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

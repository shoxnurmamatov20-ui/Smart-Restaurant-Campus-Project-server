<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Suppliers\Models\PurchaseOrder;

final class UpdatePurchaseOrderRequest extends FormRequest
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
            'supplier_id' => ['sometimes', 'integer', 'exists:suppliers,id'],
            'number' => ['sometimes', 'string', 'max:24', Rule::unique('purchase_orders', 'number')->ignore($this->route('purchaseOrder'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'status' => ['nullable', Rule::in(PurchaseOrder::STATUSES)],
            'expected_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

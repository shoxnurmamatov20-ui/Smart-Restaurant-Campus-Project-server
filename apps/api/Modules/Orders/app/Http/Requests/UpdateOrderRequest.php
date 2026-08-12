<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Orders\Models\Order;

final class UpdateOrderRequest extends FormRequest
{
    /**
     * Route middleware (`permission:orders.update`) enforces authorisation.
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
            'number' => ['nullable', 'string', 'max:24', Rule::unique('orders', 'number')->ignore($this->route('order'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'channel' => ['nullable', Rule::in(Order::CHANNELS)],
            'status' => ['nullable', Rule::in(Order::STATUSES)],
            'restaurant_table_id' => ['nullable', 'integer', 'min:1'],
            'table_label' => ['nullable', 'string', 'max:32'],
            'waiter_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'customer_id' => ['nullable', 'integer', 'min:1'],
            'guests_count' => ['nullable', 'integer', 'min:1', 'max:200'],
            'discount_total' => ['nullable', 'integer', 'min:0'],
            'service_charge' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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

            /*
             * Optional now, and it was not before.
             *
             * The console raises an order from a shelf that is running low and
             * from the "new order" tab, and neither screen has any business
             * inventing a document number — two buyers on two tills would
             * invent the same one. Left out, the server takes the next value
             * from the branch counter, which is the only place in this codebase
             * that issues numbers. Still accepted when sent, because an order
             * imported from a supplier's own system arrives with theirs.
             */
            'number' => ['sometimes', 'string', 'max:24', Rule::unique('purchase_orders', 'number')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],

            /*
             * A new order is a draft or is on its way, and nothing else. An
             * order that could be POSTed straight to `received` would be a
             * delivery booked in with no stock behind it — receiving is a call
             * of its own for exactly that reason.
             */
            'status' => ['nullable', Rule::in(['draft', 'sent'])],
            'expected_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:2000'],

            /*
             * Lines, in the same request as the header.
             *
             * A buyer picks a supplier, ticks nine ingredients and presses send;
             * ten round trips would leave nine chances to end up with a header
             * and no lines when the tablet drops the network. One request, one
             * transaction, one idempotency key.
             */
            'items' => ['sometimes', 'array', 'max:200'],
            'items.*.ingredient_id' => ['nullable', 'integer', 'exists:ingredients,id'],
            'items.*.name' => ['required', 'string', 'max:160'],
            'items.*.unit' => ['nullable', 'string', 'max:8'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            // Tiyin, per unit. Zero is allowed: a supplier does throw in a
            // sample crate, and a line priced at nothing is still a line the
            // storekeeper has to receive.
            'items.*.unit_price' => ['required', 'integer', 'min:0'],
        ];
    }
}

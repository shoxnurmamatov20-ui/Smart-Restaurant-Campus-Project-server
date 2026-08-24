<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Moving an order along the ladder: draft → sent → confirmed, or cancelled.
 *
 * `received` is not on this list and cannot be. Marking a delivery arrived is
 * `POST purchase-orders/{id}/receive`, which raises stock and grows the payable
 * in one transaction — a status endpoint that could write it would be a way to
 * close a delivery with none of it landing on a shelf.
 */
final class TransitionPurchaseOrderRequest extends FormRequest
{
    /** Route middleware (`permission:suppliers.update`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in(['sent', 'confirmed', 'cancelled'])],
            // Why an order was called off is the only thing anybody asks about
            // it afterwards, so it is kept where the order is rather than in a
            // separate note nobody opens.
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}

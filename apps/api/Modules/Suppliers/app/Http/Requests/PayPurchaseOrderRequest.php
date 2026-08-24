<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Settling a supplier's invoice, in full or in part.
 *
 * `amount` is optional and means "all of it" when absent, because that is what
 * the button on the payables screen does — a buyer pressing "To'landi" against a
 * row is not entering a figure. Sending one is the part-payment case, and it is
 * checked against what is actually outstanding in the controller rather than
 * here: this class cannot see the order.
 */
final class PayPurchaseOrderRequest extends FormRequest
{
    /** Route middleware (`permission:suppliers.manage`) enforces authorisation. */
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
            'amount' => ['nullable', 'integer', 'min:1'],
            'paid_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

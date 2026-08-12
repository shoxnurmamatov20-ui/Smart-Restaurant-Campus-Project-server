<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\Payment;

final class StorePaymentRequest extends FormRequest
{
    /**
     * Route middleware (`permission:finance.create`) enforces authorisation.
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
        return [
            'cash_shift_id' => ['nullable', 'integer', 'exists:cash_shifts,id'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'order_number' => ['nullable', 'string', 'max:24'],
            'method' => ['required', Rule::in(Payment::METHODS)],
            'amount' => ['required', 'integer', 'min:1'],
            'fiscal_receipt_no' => ['nullable', 'string', 'max:64'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'amount.min' => "To'lov summasi noldan katta bo'lishi kerak.",
        ];
    }
}

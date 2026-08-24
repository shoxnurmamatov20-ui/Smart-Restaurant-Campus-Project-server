<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\PaymentMethod;

/**
 * Changing how a tender is offered.
 *
 * `method` is absent on purpose: recoding a row would silently re-file every
 * payment ever taken through it. A restaurant that wants a different tender adds
 * a row and switches this one off, which leaves the Z-reports that already
 * mention it still readable.
 */
final class UpdatePaymentMethodRequest extends FormRequest
{
    /** Route middleware (`permission:finance.manage`) enforces authorisation. */
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
            'name' => ['sometimes', 'array'],
            'name.uz' => ['required_with:name', 'string', 'max:80'],
            'name.ru' => ['nullable', 'string', 'max:80'],
            'name.en' => ['nullable', 'string', 'max:80'],
            'kind' => ['sometimes', Rule::in(PaymentMethod::KINDS)],
            'is_fiscal' => ['sometimes', 'boolean'],
            'fee_bps' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000'],
            'gateway' => ['sometimes', 'nullable', 'string', 'max:32'],
            'is_enabled' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ];
    }
}

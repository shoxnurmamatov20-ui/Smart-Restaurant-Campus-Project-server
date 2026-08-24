<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentMethod;

/**
 * Offering a tender this restaurant had not offered before.
 *
 * `method` is checked against `Payment::METHODS` and that is the whole point of
 * this class. A row naming something outside that set would draw a button on a
 * till which then cannot capture a payment through it — nothing downstream has
 * ever heard of it: not the Z-report's per-method split, not `AcquirerFees`, not
 * the ledger. A label the till cannot take money through is worse than no row.
 */
final class StorePaymentMethodRequest extends FormRequest
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
            'method' => [
                'required',
                Rule::in(Payment::METHODS),
                // One row per tender per restaurant. The partial unique index
                // says the same thing; this says it as a 422 with the field
                // named, rather than as a 500 from the driver.
                Rule::unique('payment_methods', 'method')
                    ->where('tenant_id', app(TenantContext::class)->id()),
            ],
            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:80'],
            'name.ru' => ['nullable', 'string', 'max:80'],
            'name.en' => ['nullable', 'string', 'max:80'],
            'kind' => ['required', Rule::in(PaymentMethod::KINDS)],
            'is_fiscal' => ['nullable', 'boolean'],
            /*
             * Basis points, and 10 000 of them is 100%.
             *
             * The ceiling is deliberately not a plausible one: a restaurant
             * negotiating 2.4% types 240, and somebody typing 240 meaning 2.4%
             * into a PERCENT field would have been the bug. Refusing anything
             * above 100% is the only bound that is certainly wrong.
             */
            'fee_bps' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'gateway' => ['nullable', 'string', 'max:32'],
            'is_enabled' => ['nullable', 'boolean'],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
        ];
    }
}

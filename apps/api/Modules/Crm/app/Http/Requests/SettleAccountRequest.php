<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Money handed over against a tab.
 *
 * `amount` is tiyin and an integer, like every other amount in this platform —
 * `integer` and not `numeric`, because `numeric` accepts "340000.5" and the cast
 * that follows would silently keep 340 000. Half a tiyin is not money, but the
 * guest who typed it meant something, and quietly deciding what is how a
 * settlement stops matching the receipt it was written from.
 *
 * How much may be taken is NOT decided here. The ceiling is the guest's own
 * balance, it is read under a lock in EloquentGuestAccounts::settle(), and a
 * validator that re-checked it against a balance read a moment earlier would be
 * two tills' worth of race condition wearing a rule's clothes.
 */
final class SettleAccountRequest extends FormRequest
{
    /**
     * Route middleware (`permission:crm.update`) enforces authorisation.
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
            'amount' => ['required', 'integer', 'min:1'],

            // The finance.payments row the money arrived on, when it came through
            // a till rather than a bank transfer. Not a foreign key and never
            // resolved here: Finance is another module and another schema.
            'payment_id' => ['nullable', 'integer', 'min:1'],

            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

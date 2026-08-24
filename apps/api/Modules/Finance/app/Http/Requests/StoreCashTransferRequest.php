<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Money moving from one place to another, both named.
 *
 * Each end is a drawer or an account, and exactly one of the two per end. The
 * rule below says "one of these two is present" rather than "both are optional",
 * because a transfer whose destination was silently null is precisely the
 * one-legged write this endpoint exists to replace.
 */
final class StoreCashTransferRequest extends FormRequest
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
            'from_shift_id' => ['nullable', 'required_without:from_account_id', 'integer', 'exists:cash_shifts,id'],
            'from_account_id' => ['nullable', 'required_without:from_shift_id', 'integer', 'exists:cash_accounts,id'],
            'to_shift_id' => ['nullable', 'required_without:to_account_id', 'integer', 'exists:cash_shifts,id'],
            'to_account_id' => ['nullable', 'required_without:to_shift_id', 'integer', 'exists:cash_accounts,id'],
            'amount' => ['required', 'integer', 'min:1'],
            // Never optional. A movement with no reason is indistinguishable
            // from a mistake when it is read back in an audit — the same rule
            // `cash_movements.reason` has carried since it was created.
            'reason' => ['required', 'string', 'max:255'],
        ];
    }
}

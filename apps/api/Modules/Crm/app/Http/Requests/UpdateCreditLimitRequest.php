<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * How far a guest is allowed to go.
 *
 * One field, and it is the most dangerous number in this module: it is the only
 * thing standing between a friendly regular and a debt nobody decided to extend.
 * Which is why the route asks for `crm.manage` and not `crm.update` — the cashier
 * being asked for the credit is never the person who may raise the ceiling on it.
 */
final class UpdateCreditLimitRequest extends FormRequest
{
    /**
     * A ceiling on the ceiling, and a typo guard rather than a policy.
     *
     * 100 000 000 so'm. Nothing about a restaurant tab reaches it — a corporate
     * canteen account running a month of lunches is an order of magnitude below —
     * so the only thing that ever trips it is a hand that held the zero key down.
     * A limit is entered by a person once and lived with for a year, and there is
     * no second screen where a wrong one becomes obvious.
     */
    private const MAX_CREDIT_LIMIT = 10_000_000_000;

    /**
     * Route middleware (`permission:crm.manage`) enforces authorisation.
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
            /*
             * Zero is a value, not an absence: it closes the tab. It is the column
             * default, so every guest already on file is not a credit customer
             * until somebody decides otherwise — and setting it back to zero is how
             * that decision is taken away again, without touching what is still owed.
             */
            'credit_limit' => ['required', 'integer', 'min:0', 'max:'.self::MAX_CREDIT_LIMIT],
        ];
    }
}

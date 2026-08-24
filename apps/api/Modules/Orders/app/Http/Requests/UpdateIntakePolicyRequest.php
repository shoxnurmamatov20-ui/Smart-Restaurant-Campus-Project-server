<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Orders\Models\IntakePolicy;

/**
 * Changing how the intake desk behaves.
 *
 * Every field is `sometimes`, and that is the contract rather than laziness:
 * the screen has four switches and a picker in three separate cards, and each
 * one is written the moment it is pressed. A request that had to carry all six
 * values would mean a switch flipped in one card silently rewriting the picker
 * in another with whatever the browser last happened to hold.
 *
 * The bounds are here rather than on the table for the reason the migration
 * gives: a check constraint answers a 500 with no error envelope, and every
 * other refusal in this console arrives as `error.code` with three languages.
 *
 *  - **`prep_minutes` 5–180.** Below five is not a kitchen, above three hours
 *    is not a takeaway; both ends are numbers a guest is shown on the site and
 *    at the aggregators, which is why they are bounded at all rather than
 *    trusted.
 *  - **`peak_ticket_limit` 1–200.** Zero would mean "stop taking online orders
 *    the moment one docket is open", which is a restaurant that never trades
 *    online again — and the switch beside it is the way to say that instead.
 */
final class UpdateIntakePolicyRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The route carries `orders.manage`; a second check here would be a
        // second place for the two to disagree.
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [
            'peak_ticket_limit' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'prep_minutes' => ['sometimes', 'integer', 'min:5', 'max:180'],
            /*
             * Which venue this is about. Absent means the business, which is
             * what an owner with no branch selected means — and what a
             * single-venue restaurant always means.
             */
            'branch_id' => ['sometimes', 'nullable', 'integer', Rule::exists('branches', 'id')],
        ];

        foreach (IntakePolicy::RULES as $rule) {
            $rules[$rule] = ['sometimes', 'boolean'];
        }

        return $rules;
    }
}

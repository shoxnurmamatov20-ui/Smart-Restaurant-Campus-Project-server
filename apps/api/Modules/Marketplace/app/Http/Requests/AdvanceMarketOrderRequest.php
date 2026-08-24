<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * The merchant moving an order one rung.
 *
 * `Rule::in(MarketOrderState::values())` says the value is a rung that exists.
 * Whether it is a rung this order may REACH is a different question and belongs
 * to the ladder — `canBecome()` — because it depends on where the order is now
 * and a form request has no order. Answering it here would be a second copy of
 * the ladder, and the two would part company the first time a rung was added.
 */
final class AdvanceMarketOrderRequest extends FormRequest
{
    /** Route middleware (`permission:marketplace.update`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|In|string>>
     */
    public function rules(): array
    {
        return [
            /*
             * Required unless the panel is only revising the promise. The
             * "+5 minutes" button on a cooking order moves nothing on the
             * ladder — the food is still cooking — so demanding a rung would
             * force the panel to re-send `cooking`, which `canBecome()`
             * correctly refuses as a move to where the order already is.
             */
            'state' => ['required_without:eta_minutes', 'nullable', Rule::in(MarketOrderState::values())],
            // Required in spirit for a rejection and impossible to require here
            // for the same reason as above: the form request cannot see which
            // move this is. The controller passes it through and the column
            // records whatever was given.
            'reason' => ['nullable', 'string', 'max:255'],
            'courier_id' => ['nullable', 'integer', 'min:1'],
            /*
             * How long the merchant now says it will take, from acceptance.
             * Four hours is the ceiling: past that the honest answer to the
             * guest is a cancellation, not a longer wait.
             */
            'eta_minutes' => ['nullable', 'integer', 'min:1', 'max:240'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * Changing an offer that already exists — its state, or its budget.
 *
 * Two fields and nothing else, and the omissions are the design. The code, the
 * discount and the dates are frozen once an offer is live: a guest who has been
 * shown "OSH2026 — 20 000 chegirma" and comes back on Thursday to find it means
 * ten thousand has been lied to, and the honest way to change those is a new
 * offer beside the old one.
 *
 * `state` moves along `Promotion::STATES`, and which moves are legal is the
 * controller's — a request cannot know what the row currently says.
 *
 * `running` is deliberately absent from the states a merchant may SET to
 * anything other than from `paused`; the controller enforces that too. Setting
 * a scheduled offer straight to running would start a campaign on a day nobody
 * budgeted for.
 */
final class UpdatePromotionRequest extends FormRequest
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
             * Four of the five states. `ended` is not here: an offer ends
             * because its last day passed, and a merchant who could set it
             * would be back-dating a campaign that ran.
             */
            'state' => ['sometimes', Rule::in(['running', 'paused', 'cancelled'])],

            /*
             * Re-budgeting, which is the whole reason this endpoint exists —
             * the merchant sheet is reached from a scheduled offer and says
             * "Byudjetni o'zgartirish". Sending the create endpoint instead
             * would leave two offers on the same three days.
             *
             * The floor against what has already been spent is the
             * controller's: a request cannot see `spent_tiyin`.
             */
            'budget_tiyin' => ['sometimes', 'integer', 'min:0', 'max:100000000000'],
        ];
    }
}

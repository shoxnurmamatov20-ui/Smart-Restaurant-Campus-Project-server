<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\ComplaintCase;

/**
 * A complaint being opened.
 *
 * `number`, `status`, `due_at` and every outcome column are absent, and each for
 * the same reason: none of them is something the person taking the complaint
 * knows. The number comes from a counter, the deadline from the restaurant's own
 * service level, and the outcome from a decision that has not been made yet. A
 * request that could set them would let a complaint be opened already answered.
 *
 * Nothing here is required except the channel and the kind. A guest ringing to
 * say their food was cold may not know their order number, may not give a name,
 * and may not be able to put a figure on it — and a form that demanded those
 * would collect fewer complaints, which reads on a dashboard as a better week.
 * The same reasoning `StoreFeedbackRequest` already carries.
 */
final class StoreCaseRequest extends FormRequest
{
    /** Route middleware (`permission:crm.create`) enforces authorisation. */
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
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'channel' => ['required', Rule::in(ComplaintCase::CHANNELS)],
            'kind' => ['required', Rule::in(ComplaintCase::KINDS)],

            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'guest_name' => ['nullable', 'string', 'max:160'],
            'guest_phone' => ['nullable', 'string', 'max:32'],

            'order_id' => ['nullable', 'integer', 'min:1'],
            'order_number' => ['nullable', 'string', 'max:32'],

            'amount_tiyin' => ['nullable', 'integer', 'min:0'],
            'amount_note' => ['nullable', 'string', 'max:160'],
            'quote' => ['nullable', 'string', 'max:2000'],
            'photos' => ['nullable', 'array', 'max:10'],
            'photos.*' => ['string', 'max:255'],

            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'feedback_id' => ['nullable', 'integer', 'exists:feedbacks,id'],
        ];
    }
}

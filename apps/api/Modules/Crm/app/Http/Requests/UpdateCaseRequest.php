<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\ComplaintCase;

/**
 * Working a complaint: who has it, and what has been learned since.
 *
 * `status` may be moved to `open`, `in_progress` or `closed` and never to
 * `resolved`. Resolved is what `decide` writes, and it writes it together with
 * the outcome, the amount and the name of whoever chose — a PATCH that could set
 * it alone would produce a complaint marked answered with no answer recorded,
 * which is the exact row a guest rings back about.
 */
final class UpdateCaseRequest extends FormRequest
{
    /** Route middleware (`permission:crm.update`) enforces authorisation. */
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
            'status' => ['sometimes', Rule::in(['open', 'in_progress', 'closed'])],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'kind' => ['sometimes', Rule::in(ComplaintCase::KINDS)],
            'amount_tiyin' => ['sometimes', 'integer', 'min:0'],
            'amount_note' => ['nullable', 'string', 'max:160'],
            'quote' => ['nullable', 'string', 'max:2000'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

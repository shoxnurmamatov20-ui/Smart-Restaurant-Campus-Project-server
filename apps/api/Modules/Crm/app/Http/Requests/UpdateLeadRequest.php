<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Lead;

/**
 * What an operator changes about a lead: where it is and who has it.
 *
 * Not the name, the phone or the message. Those are what the person typed, and
 * an enquiry that can be edited by the people it is about is an enquiry nobody
 * can be held to — "they said they had forty covers" stops meaning anything the
 * moment somebody can make it say so.
 */
final class UpdateLeadRequest extends FormRequest
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
            'status' => ['sometimes', Rule::in(Lead::STATUSES)],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}

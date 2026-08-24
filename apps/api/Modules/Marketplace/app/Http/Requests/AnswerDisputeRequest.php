<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * A restaurant answering a complaint.
 *
 * Two answers only. `accepted` refunds the guest; `contested` sends it to the
 * platform, which is a person rather than a rule. `resolved` is not offered —
 * that is what the platform writes when it has finished with a contested one,
 * and a merchant who could write it would close their own cases.
 */
final class AnswerDisputeRequest extends FormRequest
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
            'state' => ['required', Rule::in(['accepted', 'contested'])],
            // Required in practice for a contest — "why not" is the whole of the
            // platform's case file — and left optional here because an
            // acceptance needs no explanation and refusing one without a note
            // would slow down the answer everybody wants.
            'resolution' => ['nullable', 'string', 'max:255'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\ComplaintCase;

/**
 * One of the four answers.
 *
 * `amount_tiyin` is optional and means "the obvious amount for this outcome":
 * the whole disputed sum for a full refund, half of it for a partial, nothing
 * for a decline. Optional rather than required because the console's buttons
 * arrive with the number already computed and a client that had to send it
 * would be a second place the halving rounds — `cases-data.ts` rounds to the
 * nearest thousand so'm and so does the model, and the two must not disagree
 * about 44 000 versus 44 500 in front of a guest.
 *
 * A value that IS sent is honoured, because a manager settling on 30 000 of a
 * disputed 88 000 is a real conversation and the queue has to be able to record
 * what was actually agreed.
 */
final class DecideCaseRequest extends FormRequest
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
            'outcome' => ['required', Rule::in(ComplaintCase::OUTCOMES)],
            'amount_tiyin' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

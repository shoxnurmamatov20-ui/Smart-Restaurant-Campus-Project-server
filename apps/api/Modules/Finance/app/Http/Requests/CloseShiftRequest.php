<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Counting the drawer at the end of a service.
 *
 * `counted_cash` and `denominations` are both optional and at least one is
 * required, which is the whole shape of the rule: the drawer has to be counted
 * somehow, and counting it by note is the way that means anything. A till that
 * sends both gets them checked against each other rather than one of them
 * quietly winning — see ShiftCloser::countedTotal().
 *
 * Nothing here can state the expected cash. That is derived server-side from
 * what was taken and paid out, because a client that could send both figures
 * could make the difference zero, and the difference is the only number anybody
 * actually reads.
 */
class CloseShiftRequest extends FormRequest
{
    /** Route middleware (`permission:finance.update`) enforces authorisation. */
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
            'counted_cash' => ['required_without:denominations', 'nullable', 'integer', 'min:0'],

            /*
             * Denomination in TIYIN => how many notes.
             *
             * The keys are checked in App-land rather than here, by
             * CashDenominations, because "is 250 000 a note?" is a question about
             * the currency in circulation and not about this request — and the
             * refusal it produces names the notes that ARE accepted, which a
             * validation message about `denominations.250000` could not.
             */
            'denominations' => ['sometimes', 'array'],
            'denominations.*' => ['integer', 'min:0'],

            'reason' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:2000'],

            // The second signature on the Z. Nullable because a single-till café
            // at midnight has one person in the building, and a column that
            // forced a second name would be filled in with the first.
            'witnessed_by_user_id' => ['nullable', 'integer', 'exists:users,id'],

            // Who authorised the difference. Whether it is *needed* is the
            // policy's decision, not a validation rule — the threshold depends on
            // a figure this request does not know.
            'approved_by_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ];
    }

    /**
     * The notes, keyed by denomination in tiyin.
     *
     * @return array<array-key, int|string>
     */
    public function denominations(): array
    {
        /** @var array<array-key, int|string> $notes */
        $notes = $this->validated('denominations', []);

        return $notes;
    }
}

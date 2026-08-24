<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A count that decides nothing.
 *
 * A manager checking the drawer at eight o'clock, or the notes going to the safe
 * being counted on the way out. Both are records rather than decisions, which is
 * why there is no reason field and no approver: nothing is being authorised.
 */
final class CountDrawerRequest extends FormRequest
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
            'denominations' => ['required', 'array', 'min:1'],
            'denominations.*' => ['integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
            'witnessed_by_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ];
    }

    /**
     * @return array<array-key, int|string>
     */
    public function denominations(): array
    {
        /** @var array<array-key, int|string> $notes */
        $notes = $this->validated('denominations', []);

        return $notes;
    }
}

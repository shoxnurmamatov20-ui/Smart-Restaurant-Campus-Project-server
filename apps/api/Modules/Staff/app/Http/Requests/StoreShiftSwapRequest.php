<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * "I cannot work this one."
 *
 * Route middleware asks for `staff.update`, which a waiter holds and which is
 * deliberately weaker than the `staff.manage` the verdict needs. Asking is not
 * deciding — the same asymmetry the till's approval ladder runs on.
 */
final class StoreShiftSwapRequest extends FormRequest
{
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
            'shift_id' => ['required', 'integer', 'exists:shifts,id'],
            /*
             * Optional, and left out is the common case: somebody with a
             * wedding to go to posts the shift to whoever will take it rather
             * than naming a colleague and waiting on them. A manager assigns it
             * when they approve.
             */
            'offered_to_id' => ['nullable', 'integer', 'exists:staff_members,id'],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}

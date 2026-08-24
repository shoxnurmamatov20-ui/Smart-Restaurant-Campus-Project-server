<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A manager's verdict on a swap.
 *
 * `offered_to_id` is accepted here as well as on the request, and that is not
 * duplication: most requests arrive open — "can anybody take Thursday" — and
 * the manager is the one who decides who. Approving without naming somebody is
 * refused in the controller, because a shift that changed hands to nobody is a
 * Saturday with a gap in it that reads as covered.
 */
final class DecideShiftSwapRequest extends FormRequest
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
            'offered_to_id' => ['nullable', 'integer', 'exists:staff_members,id'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

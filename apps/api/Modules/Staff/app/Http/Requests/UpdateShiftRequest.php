<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Staff\Models\Shift;

final class UpdateShiftRequest extends FormRequest
{
    /**
     * Route middleware (`permission:staff.update`) enforces authorisation.
     */
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
            'staff_member_id' => ['sometimes', 'integer', 'exists:staff_members,id'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['sometimes', 'date', 'after:starts_at'],
            'role' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', Rule::in(Shift::STATUSES)],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

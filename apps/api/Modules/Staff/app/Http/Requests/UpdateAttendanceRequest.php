<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Staff\Models\Attendance;

final class UpdateAttendanceRequest extends FormRequest
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
            'checked_in_at' => ['sometimes', 'date'],
            'checked_out_at' => ['nullable', 'date', 'after:checked_in_at'],
            'method' => ['nullable', Rule::in(Attendance::METHODS)],
            'is_late' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

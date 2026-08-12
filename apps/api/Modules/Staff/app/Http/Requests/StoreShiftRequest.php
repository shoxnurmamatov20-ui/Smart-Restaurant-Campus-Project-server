<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Staff\Models\Shift;

final class StoreShiftRequest extends FormRequest
{
    /**
     * Route middleware (`permission:staff.create`) enforces authorisation.
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
            'staff_member_id' => ['required', 'integer', 'exists:staff_members,id'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'role' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', Rule::in(Shift::STATUSES)],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'ends_at.after' => "Smena tugashi boshlanishidan keyin bo'lishi kerak.",
        ];
    }
}

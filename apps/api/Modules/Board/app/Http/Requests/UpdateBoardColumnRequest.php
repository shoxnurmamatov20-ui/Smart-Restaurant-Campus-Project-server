<?php

declare(strict_types=1);

namespace Modules\Board\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateBoardColumnRequest extends FormRequest
{
    /**
     * Route middleware (`permission:board.update`) enforces authorisation.
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
        /*
         * `menu_category_id` is deliberately absent.
         *
         * Repointing a column at a different section is not an edit, it is a
         * different column: the accent was chosen for those dishes and the
         * position was chosen for that heading. Allowing it here would also mean
         * re-running the "one heading per section" uniqueness check with an
         * ignore clause, which is three lines to support an action a manager
         * expresses as delete-and-add anyway.
         */
        return [
            'accent' => ['sometimes', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_visible' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'accent.regex' => 'Rang #RRGGBB ko\'rinishida bo\'lishi kerak.',
        ];
    }
}

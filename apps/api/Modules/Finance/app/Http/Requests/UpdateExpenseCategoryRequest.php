<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Renaming or reordering a heading.
 *
 * Neither `code` nor `direction` is here, and for the same reason: both are what
 * the rows already filed under this heading point at. Changing either would
 * leave last year's statement with a total under a name that no longer exists —
 * archiving and starting a new heading is the honest way to say the same thing.
 */
final class UpdateExpenseCategoryRequest extends FormRequest
{
    /** Route middleware (`permission:finance.manage`) enforces authorisation. */
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
            'name' => ['sometimes', 'array'],
            'name.uz' => ['required_with:name', 'string', 'max:80'],
            'name.ru' => ['nullable', 'string', 'max:80'],
            'name.en' => ['nullable', 'string', 'max:80'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:999'],
            // Putting an archived heading back. Sent as a boolean rather than a
            // timestamp: the client is saying "in use again", not choosing when.
            'is_archived' => ['sometimes', 'boolean'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Splitting, merging and moving a bill around the room.
 */
final class MoveBillRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // split
            'line_ids' => ['sometimes', 'array', 'min:1'],
            'line_ids.*' => ['integer', 'min:1'],
            // merge
            'target_bill_id' => ['sometimes', 'integer', 'min:1'],
            // transfer
            'table_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'table_label' => ['sometimes', 'nullable', 'string', 'max:32'],
            'waiter_user_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ];
    }
}

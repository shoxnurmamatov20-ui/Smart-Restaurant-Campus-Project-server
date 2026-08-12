<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class AddLineRequest extends FormRequest
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
            'menu_item_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:999'],
            'note' => ['nullable', 'string', 'max:255'],
            // No unit price. The catalogue decides what a dish costs; a manager
            // who genuinely needs to override it goes through an approval, and
            // happy hour goes through a price rule.
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A tier's price and its ceilings.
 *
 * Every limit is `nullable` and null means "no ceiling" — not zero, and not a
 * large number. The console prints the word for it and branches on `=== null`;
 * a zero would read as "no branches allowed", which is the opposite.
 */
final class UpdatePlanRequest extends FormRequest
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
            // Tiyin. 2 400 000 so'm a month is 240 000 000 here — the same
            // convention as every other amount on the platform.
            'price_tiyin' => ['sometimes', 'integer', 'min:0'],
            'branch_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'user_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'terminal_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'order_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'features' => ['sometimes', 'array'],
            'features.*' => ['string', 'in:kds,delivery,loyalty,multiBranch'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}

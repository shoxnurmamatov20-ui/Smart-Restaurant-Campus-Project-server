<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * What one role should hold inside this restaurant.
 *
 * The whole effective list, not a diff — the console draws a row of ticks and
 * sends what the row looks like after the edit. The server turns that into a
 * diff against the platform baseline; see App\Support\Auth\TenantRoleOverlay
 * for why the diff is what gets stored.
 */
final class UpdateRoleRequest extends FormRequest
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
            'permissions' => ['required', 'array'],
            // Every name has to be a permission that exists. Without this a
            // typo would be stored as a grant nothing ever checks, and the
            // console would draw a tick that means nothing for years.
            'permissions.*' => ['string', Rule::exists('permissions', 'name')],

            // Optional: a save that only moves ticks leaves the ceiling alone.
            // `present`-style absence is checked with has() in the controller,
            // because 0 is a real ceiling and `filled()` would drop it.
            'discount_limit_percent' => ['sometimes', 'integer', 'min:0', 'max:100'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The whole address book, as it should be after this request.
 *
 * A PUT of the list rather than four CRUD endpoints, and the reason is written
 * up on the controller: a marketplace consumer has no tenant, so
 * `EnsureIdempotency` cannot claim a key for them, and a POST that adds a row is
 * a double-tap that adds two. Replacing the list is idempotent by construction.
 *
 * Six is the ceiling. Not a technical limit — it is the length at which a
 * dropdown at a checkout stops being a choice and starts being a search, and a
 * person with seven delivery addresses is using the wrong feature.
 */
final class SaveAddressBookRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            'addresses' => ['present', 'array', 'max:6'],
            'addresses.*.label' => ['required', 'string', 'max:40'],
            'addresses.*.address' => ['required', 'string', 'max:255'],
            'addresses.*.note' => ['nullable', 'string', 'max:255'],
            // Degrees, converted to microdegrees on the way in. Bounded, so a
            // typo cannot store a point off the planet and break a distance sort.
            'addresses.*.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'addresses.*.longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'addresses.*.is_default' => ['nullable', 'boolean'],
        ];
    }
}

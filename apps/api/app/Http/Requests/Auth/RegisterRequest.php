<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * A restaurant signing itself up. No auth — this is the public door.
 */
final class RegisterRequest extends FormRequest
{
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
            'restaurant_name' => ['required', 'string', 'max:160'],
            'name' => ['required', 'string', 'max:160'],

            // Email is unique per tenant in the schema, but a brand-new tenant
            // has no rows yet, so a global check here would be wrong: the same
            // person may legitimately own two restaurants.
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],

            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],

            'country_code' => ['nullable', 'string', 'size:2'],
            'locale' => ['nullable', 'in:uz,ru,en'],
            'timezone' => ['nullable', 'string', 'max:64'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'restaurant_name.required' => 'Restoran nomi majburiy.',
            'password.confirmed' => 'Parol tasdig\'i mos kelmadi.',
        ];
    }
}

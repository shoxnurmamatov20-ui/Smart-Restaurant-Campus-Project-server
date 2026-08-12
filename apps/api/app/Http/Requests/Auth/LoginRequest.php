<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Sign in by email or by phone — in Uzbekistan the phone is often the only
 * identifier a waiter actually remembers.
 */
final class LoginRequest extends FormRequest
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
            'email' => ['required_without:phone', 'nullable', 'email', 'max:255'],
            'phone' => ['required_without:email', 'nullable', 'string', 'max:32'],
            'password' => ['required', 'string'],

            // Names the token so a tablet can be signed out on its own.
            'device_name' => ['nullable', 'string', 'max:64'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.required_without' => 'Email yoki telefon raqamini kiriting.',
            'phone.required_without' => 'Email yoki telefon raqamini kiriting.',
        ];
    }
}

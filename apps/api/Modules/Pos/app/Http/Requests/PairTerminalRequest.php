<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The only unauthenticated write in the module.
 *
 * Nothing here identifies a restaurant: the code does that, and it is the whole
 * reason this request is allowed through without a token.
 */
final class PairTerminalRequest extends FormRequest
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
            'code' => ['required', 'string', 'min:4', 'max:32'],
            'device_fingerprint' => ['required', 'string', 'min:8', 'max:128'],
            'app_version' => ['nullable', 'string', 'max:32'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.required' => 'Ulash kodini kiriting.',
            'device_fingerprint.required' => 'Qurilma identifikatori yuborilmadi.',
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class PinLoginRequest extends FormRequest
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
        $length = (int) config('pos.pin.length', 4);

        return [
            // The person identifies themselves by tapping their name, then
            // proves it. See PinAuthenticator for why round the other way is
            // both slower and weaker.
            'user_id' => ['required', 'integer', 'min:1'],
            'pin' => ['required', 'string', 'size:'.$length, 'regex:/^[0-9]+$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'pin.size' => 'PIN '.config('pos.pin.length', 4).' ta raqamdan iborat bo\'lishi kerak.',
            'pin.regex' => 'PIN faqat raqamlardan iborat bo\'ladi.',
        ];
    }
}

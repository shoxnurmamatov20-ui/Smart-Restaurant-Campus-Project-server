<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class RotatePinRequest extends FormRequest
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
            // Omitted means "mine". Naming somebody else is a manager action and
            // is checked in the controller, not here.
            'user_id' => ['sometimes', 'integer', 'min:1'],
            'pin' => ['required', 'string', 'size:'.$length, 'regex:/^[0-9]+$/', 'not_in:0000,1111,1234'],
            'current_pin' => ['sometimes', 'string', 'size:'.$length, 'regex:/^[0-9]+$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'pin.not_in' => 'Bu PIN juda oson. Boshqasini tanlang.',
            'pin.size' => 'PIN '.config('pos.pin.length', 4).' ta raqamdan iborat bo\'lishi kerak.',
        ];
    }
}

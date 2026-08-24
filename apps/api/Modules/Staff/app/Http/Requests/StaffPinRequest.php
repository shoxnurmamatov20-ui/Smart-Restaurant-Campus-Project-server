<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Four digits from an enrolled phone.
 *
 * No `user_id`, and that is the whole design rather than an omission: the device
 * token already says whose phone this is, so the PIN authenticates a person the
 * server has already identified. A `user_id` in the body would let a phone
 * enrolled to a dishwasher try PINs against the owner's account.
 *
 * The length comes from `config('auth.pin.*')` — core, shared with the till,
 * because the two surfaces ask the same person for the same secret.
 */
final class StaffPinRequest extends FormRequest
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
        $length = (int) config('auth.pin.length', 4);

        return [
            'pin' => ['required', 'string', 'size:'.$length, 'regex:/^\d+$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'pin.size' => 'PIN '.config('auth.pin.length', 4).' ta raqamdan iborat bo\'lishi kerak.',
            'pin.regex' => 'PIN faqat raqamlardan iborat bo\'ladi.',
        ];
    }
}

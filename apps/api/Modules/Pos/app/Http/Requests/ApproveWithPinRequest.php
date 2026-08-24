<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The manager who *is* standing at the till.
 *
 * `decide` already answers the other case — the manager in the office, on their
 * own token, from their own phone — and that is the case the queue was built
 * around. This is the one a restaurant actually does forty times a shift: the
 * waiter calls the manager over, the manager leans in and types four digits on
 * the tablet already in the waiter's hand.
 *
 * Two fields, and `user_id` is not redundant. The till's session belongs to the
 * cashier, so the server has to be told whose PIN this is — and it must be told
 * rather than work it out, because searching four digits against a branch's
 * roster is both a bcrypt per employee and a guessing surface where roughly one
 * attempt in three hundred lands on somebody. See PinAuthenticator's own note.
 */
final class ApproveWithPinRequest extends FormRequest
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
            'user_id' => ['required', 'integer', 'min:1'],
            'pin' => ['required', 'string', 'size:'.$length, 'regex:/^[0-9]+$/'],
            /*
             * A refusal is typed too.
             *
             * Optional and defaulting to true would make "no" the harder answer
             * to give, and a manager who cannot conveniently refuse learns to
             * approve. It is required so the tablet has to say which button was
             * pressed.
             */
            'approved' => ['required', 'boolean'],
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

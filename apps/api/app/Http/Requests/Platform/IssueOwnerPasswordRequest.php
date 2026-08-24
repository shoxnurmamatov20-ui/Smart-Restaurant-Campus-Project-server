<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * The owner's next password — typed by the operator, or left to the generator.
 *
 * This used to refuse a typed one outright, and the reason it gave was a real
 * one: an operator who *can* choose would choose the same string for every
 * restaurant they open, and that string ends up in a notebook beside a list of
 * customer names.
 *
 * It is allowed now because the case it was blocking is the ordinary one. An
 * owner rings and says "change my password to X" — they have it written down,
 * or they want one they can actually remember — and refusing left the operator
 * reading sixteen random characters down a phone line, which is how a password
 * ends up written on the side of a till.
 *
 * So the failure the old rule was aimed at is prevented by the rule below
 * rather than by removing the ability. `Password::min(12)->letters()->numbers()`
 * refuses the weak repeat every time: not the restaurant's name, not `12345678`,
 * not the operator's usual. `uncompromised()` is deliberately NOT added — it
 * calls haveibeenpwned over the network, and a credential screen that hangs or
 * fails when an outside service is down is worse than the leak it screens for.
 *
 * Symbols are not required, and that is a decision about how this is used: the
 * password is read out loud on a call, and "was that an underscore or a dash"
 * is a support call of its own. Length and a mix of letters and digits carry the
 * strength here.
 *
 * Leaving it empty still generates one. That is the right default and stays the
 * default in the console.
 */
final class IssueOwnerPasswordRequest extends FormRequest
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
            'password' => ['nullable', 'string', 'max:72', Password::min(12)->letters()->numbers()],
        ];
    }

    /**
     * The three languages, because a Russian operator reads the same refusal.
     *
     * Laravel's own message names the rules in English and lists them in a
     * sentence an operator has to decode. This says the thing to do.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'password.min' => __('Parol kamida 12 belgidan iborat bo\'lishi kerak.'),
            'password.max' => __('Parol 72 belgidan uzun bo\'lmasligi kerak.'),
            'password.letters' => __('Parolda harf ham, raqam ham bo\'lishi kerak.'),
            'password.numbers' => __('Parolda harf ham, raqam ham bo\'lishi kerak.'),
        ];
    }
}

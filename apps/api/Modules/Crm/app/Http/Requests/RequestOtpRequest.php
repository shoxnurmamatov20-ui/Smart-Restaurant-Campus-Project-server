<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A phone number, and nothing a client could use to decide anything.
 *
 * No `channel`, no `length`, no "send it to me by Telegram instead". Every one
 * of those is a knob a stranger could turn on an endpoint that costs the
 * restaurant money per call.
 */
final class RequestOtpRequest extends FormRequest
{
    /** Anonymous by design — the whole point is that there is no session yet. */
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
            /*
             * E.164, and specifically Uzbek: `+998` and nine digits.
             *
             * Narrow on purpose. This gateway delivers to Uzbek networks, so a
             * `+7` number is not a customer we can reach — it is a paid message
             * that goes nowhere, and a validation rule is cheaper than finding
             * that out on the balance. The regex accepts the number with or
             * without spaces and the plus; the controller normalises it before
             * anything reads it.
             */
            'phone' => ['required', 'string', 'max:24', 'regex:/^\+?9?9?8?[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$/'],

            // Which language to write the message in. Advisory: a guest who has
            // already chosen one on their profile keeps it.
            'locale' => ['nullable', 'string', 'in:uz,ru,en'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'phone.regex' => 'Telefon raqami +998 bilan boshlanadigan 9 xonali raqam bo\'lishi kerak.',
        ];
    }
}

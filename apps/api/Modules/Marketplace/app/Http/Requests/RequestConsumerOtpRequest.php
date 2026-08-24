<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * A phone number asking for a sign-in code.
 *
 * Nothing here proves anything — that is what the code is for — so the only job
 * is to keep the gateway from being handed nonsense. The number is validated
 * loosely on purpose: nine digits or twelve, with or without a plus, with or
 * without spaces, because that is how people type their own number and
 * `Consumer::normalisePhone()` is what makes them one shape.
 */
final class RequestConsumerOtpRequest extends FormRequest
{
    /** The route is anonymous and throttled; there is no permission to check. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|In|string>>
     */
    public function rules(): array
    {
        return [
            'phone' => ['required', 'string', 'min:9', 'max:20', 'regex:/^[\d\s()+-]+$/'],
            'locale' => ['nullable', Rule::in(['uz', 'ru', 'en'])],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'phone.regex' => 'Telefon raqami faqat raqamlardan iborat bo\'lishi kerak.',
        ];
    }
}

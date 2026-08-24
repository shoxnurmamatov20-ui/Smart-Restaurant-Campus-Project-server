<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use App\Support\Auth\OtpCredentials;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * A code, for a token.
 *
 * The code's length comes from `OtpCredentials` rather than being written here.
 * A configured six-digit code with a `size:4` rule in front of it would refuse
 * every correct answer, and it would do so before the counter that makes a
 * short code defensible ever saw the attempt.
 */
final class VerifyConsumerOtpRequest extends FormRequest
{
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
            'code' => ['required', 'string', 'size:'.OtpCredentials::length(), 'regex:/^\d+$/'],
            'name' => ['nullable', 'string', 'max:120'],
            'locale' => ['nullable', Rule::in(['uz', 'ru', 'en'])],
            'device_name' => ['nullable', 'string', 'max:80'],
        ];
    }
}

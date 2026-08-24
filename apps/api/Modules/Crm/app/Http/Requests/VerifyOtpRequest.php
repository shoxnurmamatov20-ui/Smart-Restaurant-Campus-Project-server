<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use App\Support\Auth\OtpCredentials;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The number and the digits that came back.
 *
 * `device_name` is accepted so a guest can be shown which phone a session
 * belongs to when they revoke one. It is a label and nothing else: it names no
 * ability and grants no scope, so a client writing "admin" into it gets a
 * session called "admin" with a customer's permissions.
 */
final class VerifyOtpRequest extends FormRequest
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
        $length = OtpCredentials::length();

        return [
            'phone' => ['required', 'string', 'max:24', 'regex:/^\+?9?9?8?[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$/'],

            /*
             * Exactly the length the platform is currently issuing.
             *
             * Read from config rather than written as `4`, because the design
             * draws four cells and a tenant with a stricter appetite may be
             * issuing six — and a validator that disagreed with the issuer
             * would reject every correct code, which looks from the outside
             * like the SMS never arrived.
             */
            'code' => ['required', 'string', 'digits:'.$length],

            'name' => ['nullable', 'string', 'max:120'],
            'locale' => ['nullable', 'string', 'in:uz,ru,en'],
            'device_name' => ['nullable', 'string', 'max:60'],
        ];
    }
}

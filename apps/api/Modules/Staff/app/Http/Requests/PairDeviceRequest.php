<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The only unauthenticated write in this module.
 *
 * A phone with no credentials sends eight characters and a fingerprint. There is
 * no tenant header to check, because the phone does not know which restaurant it
 * is joining yet — that is what the code answers.
 *
 * The fingerprint is required and is not a security control. It is what makes a
 * manager's device list readable a month later ("iPhone, last seen Tuesday")
 * and what makes a duplicate enrolment visible. Anything a client can generate,
 * a client can lie about; the credential is the code.
 */
final class PairDeviceRequest extends FormRequest
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
            // Eight characters from an alphabet with no I, O, 0 or 1 — see
            // DevicePairing. Case-insensitive because it is read aloud.
            'code' => ['required', 'string', 'size:8', 'regex:/^[A-Za-z2-9]+$/'],
            'device_fingerprint' => ['required', 'string', 'max:128'],
            'app_version' => ['nullable', 'string', 'max:32'],
        ];
    }
}

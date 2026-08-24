<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A manager giving an employee a code for their own phone.
 *
 * Authenticated and permissioned at the route — this only checks the shape.
 * The employee is named by user id rather than by staff member id on purpose:
 * the thing being enrolled signs in, and only a `users` row can do that. A staff
 * member with no linked account has nothing to enrol, and saying so by refusing
 * an unknown user id is clearer than a null join two layers down.
 */
final class IssueDeviceCodeRequest extends FormRequest
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
            'user_id' => ['required', 'integer', 'min:1'],
            /*
             * What the person calls this phone. Required, because a manager
             * revoking one from a list of three needs to know which is which,
             * and "Device 2" is not a thing anybody can recognise.
             */
            'label' => ['required', 'string', 'max:120'],
            'branch_code' => ['nullable', 'string', 'max:32'],
        ];
    }
}

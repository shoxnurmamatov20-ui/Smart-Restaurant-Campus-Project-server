<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The marketing site's contact form.
 *
 * Two required fields and nothing else, because every field added to a form on
 * the open internet is a field somebody abandons it at. A name and a number are
 * enough to ring back, and ringing back is the entire purpose of the row.
 *
 * `status`, `assigned_to_user_id` and `contacted_at` are absent by design: they
 * are a sales team's state, and a form that could set them would be a form that
 * could mark itself dealt with.
 */
final class StoreLeadRequest extends FormRequest
{
    /** Anonymous: this is how a restaurant that has no account asks for one. */
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
            'name' => ['required', 'string', 'min:2', 'max:120'],

            // Deliberately looser than the OTP form's rule: a lead may be a
            // chain calling from Kazakhstan, and refusing them because the
            // number is not `+998` refuses a customer.
            'phone' => ['required', 'string', 'min:7', 'max:24', 'regex:/^\+?[0-9\s\-()]{7,24}$/'],

            'email' => ['nullable', 'email:filter', 'max:160'],
            'restaurant' => ['nullable', 'string', 'max:160'],
            'city' => ['nullable', 'string', 'max:80'],
            'message' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'phone.regex' => 'Telefon raqamini tekshiring.',
        ];
    }
}

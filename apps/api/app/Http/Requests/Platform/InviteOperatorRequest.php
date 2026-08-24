<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A new platform operator.
 *
 * No `tenant_id` field, and none is accepted: an operator who belonged to a
 * restaurant would be scoped to it by `ResolveTenant` like anybody else, which
 * is a support person who cannot see the customer they were hired to help.
 */
final class InviteOperatorRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            'locale' => ['nullable', 'string', 'in:uz,ru,en'],
        ];
    }
}

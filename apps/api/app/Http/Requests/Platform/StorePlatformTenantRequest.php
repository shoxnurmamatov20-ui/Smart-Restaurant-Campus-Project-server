<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A new restaurant, as an operator types it.
 *
 * The email is unique across the whole platform rather than per tenant: it is
 * how somebody signs in, and two accounts sharing one would make the login
 * ambiguous at the exact moment there is no tenant context to disambiguate it.
 */
final class StorePlatformTenantRequest extends FormRequest
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
            'restaurant' => ['required', 'string', 'max:160'],
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^\+?[0-9]{9,15}$/'],
            /*
             * Optional: left empty, one is generated and shown once.
             *
             * No minimum, matching `IssueOwnerPasswordRequest` — the operator
             * types what the restaurant asked for. `max:72` is not a policy but
             * a fact about bcrypt, which reads the first 72 bytes and ignores
             * the rest: a longer one would be stored and then match anything
             * sharing that prefix, so refusing is the honest answer.
             */
            'password' => ['nullable', 'string', 'max:72'],
            'locale' => ['nullable', 'string', 'in:uz,ru,en'],
            'timezone' => ['nullable', 'string', 'max:64', 'timezone'],
            'country' => ['nullable', 'string', 'size:2'],
            // Not stored on the tenant — a restaurant has no address — but on
            // the first venue it is provisioned with. See TenantProvisioner.
            'city' => ['nullable', 'string', 'max:80'],
            'plan_key' => ['nullable', 'string', Rule::exists('platform_plans', 'key')],
            'trial_days' => ['nullable', 'integer', 'min:0', 'max:365'],
        ];
    }
}

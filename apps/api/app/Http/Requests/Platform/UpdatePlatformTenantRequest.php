<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Suspend, resume, re-plan or annotate a restaurant.
 *
 * `status` is the whole suspension mechanism: `ResolveTenant` resolves active
 * tenants only, so a suspended one keeps every row and loses every login on the
 * next request. Nothing is deleted, which is what makes it reversible.
 */
final class UpdatePlatformTenantRequest extends FormRequest
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
            'status' => ['sometimes', 'string', Rule::in(['active', 'suspended', 'archived'])],
            'plan_key' => ['sometimes', 'nullable', 'string', Rule::exists('platform_plans', 'key')],
            'trial_ends_at' => ['sometimes', 'nullable', 'date'],
            'operator_note' => ['sometimes', 'nullable', 'string', 'max:500'],
            'name' => ['sometimes', 'string', 'max:160'],
        ];
    }
}

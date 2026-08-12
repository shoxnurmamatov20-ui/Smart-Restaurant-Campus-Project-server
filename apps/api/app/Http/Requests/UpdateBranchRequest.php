<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Branch;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateBranchRequest extends FormRequest
{
    /**
     * Route middleware (`permission:branches.manage`) enforces authorisation.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();
        $branch = $this->route('branch');
        $branchId = $branch instanceof Branch ? $branch->id : null;

        return [
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'slug' => [
                'sometimes', 'required', 'string', 'max:64', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('public.branches', 'slug')
                    ->ignore($branchId)
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))
                    ->whereNull('deleted_at'),
            ],
            'code' => ['sometimes', 'nullable', 'string', 'max:16', 'regex:/^[A-Za-z0-9_-]+$/'],
            'city' => ['sometimes', 'nullable', 'string', 'max:80'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'timezone' => ['sometimes', 'string', 'max:64', 'timezone'],
            'status' => ['sometimes', 'string', Rule::in(['active', 'suspended', 'archived'])],
            'opened_at' => ['sometimes', 'nullable', 'date'],
            'settings' => ['sometimes', 'nullable', 'array'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slug.regex' => "Filial manzili faqat kichik harf, raqam va tiredan iborat bo'lishi mumkin.",
            'slug.unique' => 'Bu restoranda shunday manzilli filial allaqachon bor.',
        ];
    }
}

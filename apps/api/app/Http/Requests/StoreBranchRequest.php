<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreBranchRequest extends FormRequest
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

        return [
            'name' => ['required', 'string', 'max:120'],
            // Unique per restaurant, not globally: two chains may each open a
            // venue in Chilonzor and both are entitled to the slug.
            'slug' => [
                'required', 'string', 'max:64', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('public.branches', 'slug')
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))
                    ->whereNull('deleted_at'),
            ],
            'code' => ['nullable', 'string', 'max:16', 'regex:/^[A-Za-z0-9_-]+$/'],
            'city' => ['nullable', 'string', 'max:80'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'timezone' => ['nullable', 'string', 'max:64', 'timezone'],
            'status' => ['nullable', 'string', Rule::in(['active', 'suspended', 'archived'])],
            'opened_at' => ['nullable', 'date'],
            'settings' => ['nullable', 'array'],
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
            'code.regex' => "Filial kodi faqat harf, raqam, tire va pastki chiziqdan iborat bo'lishi mumkin.",
        ];
    }
}

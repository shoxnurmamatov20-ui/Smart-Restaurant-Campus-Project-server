<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Branch;
use App\Support\Settings\SettingsSchema;
use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Validation\Validator;
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
                // Unqualified on purpose: the validator reads a dotted name as
                // "connection.table", so 'public.branches' asked for a database
                // connection called [public] and threw a 500 on the first
                // request that ever reached this rule. search_path resolves the
                // bare name to the same table.
                Rule::unique('branches', 'slug')
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

            /*
             * The venue's own overrides — a monthly target, its hours, its
             * service charge. Declared rather than "any array": `settings` used
             * to accept whatever was sent, which meant the console's ± stepper
             * could store a target as a string, as so'm, or under a misspelled
             * key, and every reader downstream would quietly fall back to the
             * business default. See config/settings.php, group `branch`.
             */
            'settings' => ['sometimes', 'nullable', 'array'],
            ...self::nested(SettingsSchema::rules('branch')),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $settings = $this->input('settings');

            if (! is_array($settings)) {
                return;
            }

            foreach (SettingsSchema::undeclared('branch', $settings) as $path) {
                $validator->errors()->add("settings.{$path}", __(
                    "':path' — bunday filial sozlamasi yo'q.",
                    ['path' => $path],
                ));
            }
        });
    }

    /**
     * The branch group's paths, rooted at the `settings` key the request sends.
     *
     * @param array<string, list<string>> $rules
     *
     * @return array<string, list<string>>
     */
    private static function nested(array $rules): array
    {
        $nested = [];

        foreach ($rules as $path => $rule) {
            $nested["settings.{$path}"] = $rule;
        }

        return $nested;
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

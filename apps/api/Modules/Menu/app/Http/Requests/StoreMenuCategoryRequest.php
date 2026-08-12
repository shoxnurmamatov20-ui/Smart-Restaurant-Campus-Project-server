<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreMenuCategoryRequest extends FormRequest
{
    /**
     * Route middleware (`permission:menu.create`) enforces authorisation.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, ValidationRule|string>|string>
     */
    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();

        return [
            'parent_id' => ['nullable', 'integer', 'exists:menu_categories,id'],

            'slug' => [
                'required', 'string', 'max:96', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('menu_categories', 'slug')
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId)),
            ],

            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:120'],
            'name.ru' => ['nullable', 'string', 'max:120'],
            'name.en' => ['nullable', 'string', 'max:120'],

            'description' => ['nullable', 'array'],
            'description.uz' => ['nullable', 'string', 'max:1000'],
            'description.ru' => ['nullable', 'string', 'max:1000'],
            'description.en' => ['nullable', 'string', 'max:1000'],

            'icon' => ['nullable', 'string', 'max:64'],
            'image_url' => ['nullable', 'url', 'max:500'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slug.unique' => 'Bu slug allaqachon band.',
            'slug.regex' => "Slug faqat kichik harf, raqam va tiredan iborat bo'lishi kerak.",
            'name.uz.required' => "Kategoriya nomi (o'zbekcha) majburiy.",
        ];
    }
}

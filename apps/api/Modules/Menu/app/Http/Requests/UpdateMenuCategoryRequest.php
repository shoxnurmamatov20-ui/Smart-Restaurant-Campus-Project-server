<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Modules\Menu\Models\MenuCategory;

final class UpdateMenuCategoryRequest extends FormRequest
{
    /**
     * Route middleware (`permission:menu.update`) enforces authorisation.
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
        $category = $this->route('category');
        $categoryId = $category instanceof MenuCategory ? $category->id : $category;

        return [
            'parent_id' => ['nullable', 'integer', 'exists:menu_categories,id'],

            'slug' => [
                'sometimes', 'string', 'max:96', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('menu_categories', 'slug')
                    ->ignore($categoryId)
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId)),
            ],

            'name' => ['sometimes', 'array'],
            'name.uz' => ['required_with:name', 'string', 'max:120'],
            'name.ru' => ['nullable', 'string', 'max:120'],
            'name.en' => ['nullable', 'string', 'max:120'],

            'description' => ['nullable', 'array'],
            'description.uz' => ['nullable', 'string', 'max:1000'],
            'description.ru' => ['nullable', 'string', 'max:1000'],
            'description.en' => ['nullable', 'string', 'max:1000'],

            'icon' => ['nullable', 'string', 'max:64'],
            'image_url' => ['nullable', 'url', 'max:500'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * A category can never be its own parent — that would make the menu tree
     * infinite and hang every render of the guest-facing QR menu.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $category = $this->route('category');
                $categoryId = $category instanceof MenuCategory ? $category->id : (int) $category;

                if ($this->filled('parent_id') && (int) $this->input('parent_id') === $categoryId) {
                    $validator->errors()->add(
                        'parent_id',
                        "Kategoriya o'ziga o'zi ota-kategoriya bo'la olmaydi."
                    );
                }
            },
        ];
    }
}

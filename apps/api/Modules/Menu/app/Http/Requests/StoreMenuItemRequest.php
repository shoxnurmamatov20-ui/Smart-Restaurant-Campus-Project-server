<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Menu\Models\MenuItem;

final class StoreMenuItemRequest extends FormRequest
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
            'menu_category_id' => ['required', 'integer', 'exists:menu_categories,id'],

            // SKU is unique per restaurant, not globally — two tenants may both
            // sell "OSH-001".
            'sku' => [
                'required', 'string', 'max:48', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('menu_items', 'sku')
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId)),
            ],

            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:160'],
            'name.ru' => ['nullable', 'string', 'max:160'],
            'name.en' => ['nullable', 'string', 'max:160'],

            'description' => ['nullable', 'array'],
            'description.uz' => ['nullable', 'string', 'max:2000'],
            'description.ru' => ['nullable', 'string', 'max:2000'],
            'description.en' => ['nullable', 'string', 'max:2000'],

            'kind' => ['nullable', Rule::in(MenuItem::KINDS)],

            // Money arrives as an integer in tiyin — never a float.
            'price' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'cost_price' => ['nullable', 'integer', 'min:0', 'lte:price'],
            'currency' => ['nullable', 'string', 'size:3'],

            'cook_time_minutes' => ['nullable', 'integer', 'min:0', 'max:600'],
            'station' => ['nullable', Rule::in(MenuItem::STATIONS)],

            'weight_grams' => ['nullable', 'integer', 'min:0', 'max:20000'],
            'calories' => ['nullable', 'integer', 'min:0', 'max:20000'],
            'allergens' => ['nullable', 'array'],
            'allergens.*' => ['string', 'max:40'],

            'is_halal' => ['nullable', 'boolean'],
            'is_vegetarian' => ['nullable', 'boolean'],
            'spice_level' => ['nullable', 'integer', 'min:0', 'max:3'],

            'is_available' => ['nullable', 'boolean'],
            'status' => ['nullable', Rule::in(MenuItem::STATUSES)],

            'image_url' => ['nullable', 'url', 'max:500'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],

            'channels' => ['nullable', 'array'],
            'channels.*' => [Rule::in(MenuItem::CHANNELS)],

            'metadata' => ['nullable', 'array'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'sku.unique' => 'Bu SKU allaqachon band — har bir taom kodi restoran ichida yagona.',
            'sku.regex' => 'SKU faqat harf, raqam, nuqta, tire va pastki chiziqdan iborat bo\'lishi mumkin.',
            'name.uz.required' => "Taom nomi (o'zbekcha) majburiy.",
            'price.integer' => "Narx tiyinda butun son bo'lishi kerak (45 000 so'm = 4500000).",
            'cost_price.lte' => "Tannarx sotuv narxidan katta bo'lishi mumkin emas.",
        ];
    }
}

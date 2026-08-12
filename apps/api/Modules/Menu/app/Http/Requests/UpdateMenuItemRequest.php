<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Modules\Menu\Models\MenuItem;

final class UpdateMenuItemRequest extends FormRequest
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
        $item = $this->route('item');
        $itemId = $item instanceof MenuItem ? $item->id : $item;

        return [
            'menu_category_id' => ['sometimes', 'integer', 'exists:menu_categories,id'],

            'sku' => [
                'sometimes', 'string', 'max:48', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('menu_items', 'sku')
                    ->ignore($itemId)
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId)),
            ],

            'name' => ['sometimes', 'array'],
            'name.uz' => ['required_with:name', 'string', 'max:160'],
            'name.ru' => ['nullable', 'string', 'max:160'],
            'name.en' => ['nullable', 'string', 'max:160'],

            'description' => ['nullable', 'array'],
            'description.uz' => ['nullable', 'string', 'max:2000'],
            'description.ru' => ['nullable', 'string', 'max:2000'],
            'description.en' => ['nullable', 'string', 'max:2000'],

            'kind' => ['sometimes', Rule::in(MenuItem::KINDS)],

            'price' => ['sometimes', 'integer', 'min:0', 'max:1000000000'],
            'cost_price' => ['nullable', 'integer', 'min:0'],
            'currency' => ['sometimes', 'string', 'size:3'],

            'cook_time_minutes' => ['sometimes', 'integer', 'min:0', 'max:600'],
            'station' => ['sometimes', Rule::in(MenuItem::STATIONS)],

            'weight_grams' => ['nullable', 'integer', 'min:0', 'max:20000'],
            'calories' => ['nullable', 'integer', 'min:0', 'max:20000'],
            'allergens' => ['nullable', 'array'],
            'allergens.*' => ['string', 'max:40'],

            'is_halal' => ['sometimes', 'boolean'],
            'is_vegetarian' => ['sometimes', 'boolean'],
            'spice_level' => ['sometimes', 'integer', 'min:0', 'max:3'],

            'is_available' => ['sometimes', 'boolean'],
            'status' => ['sometimes', Rule::in(MenuItem::STATUSES)],

            'image_url' => ['nullable', 'url', 'max:500'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],

            'channels' => ['nullable', 'array'],
            'channels.*' => [Rule::in(MenuItem::CHANNELS)],

            'metadata' => ['nullable', 'array'],
        ];
    }

    /**
     * Cost price must never exceed the (possibly updated) menu price.
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $item = $this->route('item');
                $price = $this->integer('price', $item instanceof MenuItem ? $item->price : 0);
                $cost = $this->input('cost_price');

                if ($cost !== null && (int) $cost > $price) {
                    $validator->errors()->add(
                        'cost_price',
                        "Tannarx sotuv narxidan katta bo'lishi mumkin emas."
                    );
                }
            },
        ];
    }
}

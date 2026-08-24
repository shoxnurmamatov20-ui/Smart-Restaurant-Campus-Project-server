<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Promotion;

/**
 * A basket rule.
 *
 * Two rules carry the weight. `value` is capped at 100 for the two kinds where
 * it is a percentage, for the same reason `StorePromoCodeRequest` caps it:
 * somebody meaning "50 000 so'm off" and choosing `nth_off` would write a
 * discount of five hundred times the basket.
 *
 * And the hour window is minutes past midnight, 0..1439, with no ordering rule
 * between the two — `ends_minute` BELOW `starts_minute` is not a mistake, it is
 * a happy hour that ends at one in the morning, and refusing it would make a
 * bar unable to describe its own offer.
 */
final class StorePromotionRequest extends FormRequest
{
    /** Route middleware (`permission:crm.create`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $percent = in_array($this->input('kind'), ['nth_off', 'basket_off'], true);

        return [
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],

            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:160'],
            'name.ru' => ['nullable', 'string', 'max:160'],
            'name.en' => ['nullable', 'string', 'max:160'],
            'rule_text' => ['nullable', 'array'],
            'rule_text.uz' => ['nullable', 'string', 'max:300'],
            'rule_text.ru' => ['nullable', 'string', 'max:300'],
            'rule_text.en' => ['nullable', 'string', 'max:300'],

            'kind' => ['required', Rule::in(Promotion::KINDS)],
            'value' => ['required', 'integer', 'min:0', $percent ? 'max:100' : 'max:100000000000'],
            'min_tiyin' => ['nullable', 'integer', 'min:0'],
            'quantity' => ['nullable', 'integer', 'min:0', 'max:99'],

            'dishes' => ['nullable', 'array', 'max:100'],
            'dishes.*' => ['integer', 'min:1'],

            'days' => ['nullable', 'array', 'max:7'],
            'days.*' => ['integer', 'min:1', 'max:7'],
            'starts_minute' => ['nullable', 'integer', 'min:0', 'max:1439'],
            'ends_minute' => ['nullable', 'integer', 'min:0', 'max:1439'],

            'channels' => ['nullable', 'array', 'max:4'],
            'channels.*' => [Rule::in(Promotion::CHANNELS)],

            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'value.max' => 'Foizli aksiya 100 dan oshmasligi kerak.',
        ];
    }
}

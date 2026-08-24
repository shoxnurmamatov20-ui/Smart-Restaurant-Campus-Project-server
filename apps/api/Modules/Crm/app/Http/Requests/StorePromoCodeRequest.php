<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\PromoCode;

/**
 * A new campaign.
 *
 * The one rule worth reading twice is on `value`: a percentage is capped at 100
 * and a fixed amount is not. A campaign written as `percent` with a value of
 * 15 000 — somebody meaning 15 000 so'm and choosing the wrong kind — would
 * take a hundred and fifty times the basket off every bill it touched, and
 * `discountFor()` floors the result at the basket rather than the truth. So it
 * is refused here, where somebody can still fix it.
 */
final class StorePromoCodeRequest extends FormRequest
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
        $percent = $this->input('kind', 'percent') === 'percent';

        return [
            // Letters and digits only. A code with a space in it is a code
            // somebody reads off a poster and cannot type.
            'code' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9_-]+$/'],
            'title' => ['nullable', 'array'],
            'title.uz' => ['nullable', 'string', 'max:120'],
            'title.ru' => ['nullable', 'string', 'max:120'],
            'title.en' => ['nullable', 'string', 'max:120'],

            'kind' => ['required', Rule::in(PromoCode::KINDS)],
            'value' => ['required', 'integer', 'min:1', $percent ? 'max:100' : 'max:100000000000'],
            'min_tiyin' => ['nullable', 'integer', 'min:0'],
            'max_discount_tiyin' => ['nullable', 'integer', 'min:1'],

            'starts_at' => ['nullable', 'date'],
            // `after_or_equal` rather than `after`: a one-day campaign is
            // written with the same date twice more often than it is written
            // wrong.
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],

            'max_uses' => ['nullable', 'integer', 'min:1'],
            'per_customer_limit' => ['nullable', 'integer', 'min:0', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'value.max' => 'Foizli chegirma 100 dan oshmasligi kerak.',
        ];
    }
}

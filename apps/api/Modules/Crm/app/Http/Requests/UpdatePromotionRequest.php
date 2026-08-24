<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Promotion;

/**
 * Editing a basket rule, including the one edit that happens most: the pause.
 *
 * `is_active` is on its own route as well (`POST promotions/{promotion}/pause`),
 * and both exist on purpose — the console's pause button is one tap with no
 * form behind it, and making it send a PATCH carrying the whole rule would mean
 * a stale form could quietly rewrite an offer while switching it off.
 */
final class UpdatePromotionRequest extends FormRequest
{
    /** Route middleware (`permission:crm.update`) enforces authorisation. */
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

            'name' => ['sometimes', 'array'],
            'name.uz' => ['sometimes', 'string', 'max:160'],
            'name.ru' => ['nullable', 'string', 'max:160'],
            'name.en' => ['nullable', 'string', 'max:160'],
            'rule_text' => ['nullable', 'array'],
            'rule_text.uz' => ['nullable', 'string', 'max:300'],
            'rule_text.ru' => ['nullable', 'string', 'max:300'],
            'rule_text.en' => ['nullable', 'string', 'max:300'],

            'kind' => ['sometimes', Rule::in(Promotion::KINDS)],
            'value' => ['sometimes', 'integer', 'min:0', $percent ? 'max:100' : 'max:100000000000'],
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
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}

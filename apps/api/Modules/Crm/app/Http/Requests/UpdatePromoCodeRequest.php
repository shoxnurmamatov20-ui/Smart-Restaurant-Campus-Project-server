<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\PromoCode;

/**
 * Editing a campaign that may already have been used.
 *
 * `code` is absent, and that is the whole difference from the store request.
 * The word is printed on posters, sent in a broadcast and typed by people who
 * wrote it down — renaming it silently breaks every one of those, and every
 * redemption already recorded against it now names a campaign that says
 * something else. Ending this one and starting another is the honest version
 * of that edit.
 *
 * Written out rather than inherited from `StorePromoCodeRequest`: that class is
 * `final`, as everything in this codebase is unless there is a reason not to
 * be, and the two rule sets differ in three places anyway — every field is
 * `sometimes` here, and the ceiling on `value` has to be judged against the
 * campaign as it will be after the edit rather than as the body describes it.
 */
final class UpdatePromoCodeRequest extends FormRequest
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
        return [
            'title' => ['nullable', 'array'],
            'title.uz' => ['nullable', 'string', 'max:120'],
            'title.ru' => ['nullable', 'string', 'max:120'],
            'title.en' => ['nullable', 'string', 'max:120'],

            'kind' => ['sometimes', Rule::in(PromoCode::KINDS)],
            'value' => ['sometimes', 'integer', 'min:1', $this->ceiling()],
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

    /**
     * The ceiling for the kind that will be in force after this edit, not the
     * one the request happened to mention.
     *
     * A PATCH that raises a `fixed` campaign's value and says nothing about
     * `kind` would otherwise be judged against the percentage ceiling and
     * refused at 101 tiyin.
     */
    private function ceiling(): string
    {
        $existing = $this->route('promoCode');
        $kind = (string) $this->input('kind', $existing instanceof PromoCode ? $existing->kind : 'percent');

        return $kind === 'percent' ? 'max:100' : 'max:100000000000';
    }
}

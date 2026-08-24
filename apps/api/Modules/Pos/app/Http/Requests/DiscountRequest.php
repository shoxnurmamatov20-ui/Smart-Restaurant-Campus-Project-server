<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Taking money off a bill, said one way or the other.
 *
 * A cashier thinks in percentages — the screen is a row of chips reading 5, 10,
 * 15, 20 — and a manager approving from their phone thinks in so'm. Both are
 * accepted here, never together: two figures that can disagree is a bill whose
 * discount depends on which one the server happened to read first. The percent
 * is turned into tiyin by the server before anything else looks at it, so
 * everything downstream — the gate, the approval row, the receipt — sees one
 * number.
 *
 * The reason is required, as it is for every act that moves money off a bill.
 */
final class DiscountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:255'],

            // One of the two, and `min:1` on both: a discount of nothing used to
            // be accepted and wrote an approval-free zero onto the bill, which is
            // a row in the fraud ledger that says a discount happened and a bill
            // that says it did not.
            'amount' => ['required_without:percent', 'integer', 'min:1'],
            'percent' => ['required_without:amount', 'prohibits:amount', 'integer', 'min:1', 'max:100'],

            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reason.required' => 'Sabab ko\'rsatilishi shart.',
            'reason.min' => 'Sabab kamida 3 ta belgidan iborat bo\'lsin.',
            'amount.required_without' => 'Chegirma summasi yoki foizi ko\'rsatilsin.',
            'percent.prohibits' => 'Summa va foizdan faqat bittasi yuboriladi.',
            'percent.required_without' => 'Chegirma summasi yoki foizi ko\'rsatilsin.',
            'percent.max' => 'Chegirma 100 foizdan oshmaydi.',
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * "Hisobni so'rash" — the table is ready to pay.
 *
 * What this is NOT is a payment. Nothing here moves money, and nothing here
 * writes to Finance: the guest is telling the floor they are finished and how
 * they would like to settle, and a person brings a terminal or a bill.
 *
 * ---------------------------------------------------------------------------
 * Why the tip and the split are not columns
 *
 * The design's bill screen offers tips of 0/5/10/15 and splitting between two
 * and twelve, and both are real things a guest chooses. They are also both
 * *money*, and money on this platform lives in Finance behind
 * `App\Contracts\Finance\TillLedger` — a tip stored on a Tables row would be a
 * second place a tip lives, and the two would disagree the first time a cashier
 * changed one at the till.
 *
 * So they ride along as a preference on the call's note: what the guest said
 * they wanted, for the person walking over with the terminal. What is actually
 * charged is decided where money is decided, and stays there.
 */
final class PublicTablePayRequest extends FormRequest
{
    /** Anonymous by design — the QR token is the credential. See the route. */
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
            /*
             * `card` rather than the four schemes the screen draws. Uzcard,
             * Humo and Visa are all one thing to a waiter deciding what to
             * carry over, and which rail a card runs on is the terminal's
             * business, not the request's.
             *
             * `online` is here and does nothing yet: it records that the guest
             * would rather pay from their phone. The rail that would let them
             * belongs to Finance and is not built.
             */
            'method' => ['nullable', 'string', Rule::in(['cash', 'card', 'online'])],

            // The design's own steps. A free-form percent would let a phone ask
            // for a 300% tip, which is a number somebody has to explain.
            'tip_percent' => ['nullable', 'integer', Rule::in([0, 5, 10, 15])],

            // Two to twelve, from the design's split control. One is not a
            // split and thirteen is a wedding.
            'split_between' => ['nullable', 'integer', 'min:2', 'max:12'],

            'seat_no' => ['nullable', 'integer', 'min:1', 'max:20'],
            'note' => ['nullable', 'string', 'max:200'],
        ];
    }
}

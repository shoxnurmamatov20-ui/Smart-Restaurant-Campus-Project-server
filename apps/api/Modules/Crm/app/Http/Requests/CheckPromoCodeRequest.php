<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CheckPromoCodeRequest extends FormRequest
{
    /** Anonymous: a cart asks this before anybody has signed in. */
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
            'code' => ['required', 'string', 'max:32'],

            /*
             * The basket total, in tiyin, and integer-only.
             *
             * `integer` rather than `numeric` is the rule that matters: the
             * platform's first convention is that no money is a float, and a
             * cart that sent `52000.5` would be a cart whose so'm/tiyin
             * arithmetic has already gone wrong two screens earlier. Refusing
             * it here is how that gets found.
             *
             * It is only ever used to compare against the floor and to size the
             * discount; the authoritative total is recomputed when the bill is
             * actually settled, so a client sending a larger number buys itself
             * a bigger *quoted* discount and no bigger real one.
             */
            'subtotal_tiyin' => ['required', 'integer', 'min:0', 'max:1000000000000'],
        ];
    }
}

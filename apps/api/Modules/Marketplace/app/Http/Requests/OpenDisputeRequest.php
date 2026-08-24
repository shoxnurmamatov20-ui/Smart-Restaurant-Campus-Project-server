<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;
use Modules\Marketplace\Models\Dispute;

/**
 * Something went wrong with an order.
 *
 * `kind` is one of four rather than free text, because two of the four carry an
 * automatic outcome and a rule cannot be applied to a sentence somebody typed.
 * The words go in `body` underneath, where a person reads them.
 *
 * The amount is what the guest is asking for. It is clamped to the order total
 * in the controller rather than validated against it here: the form request has
 * no order, and a guest asking for more than they paid is making a mistake
 * rather than an attack.
 */
final class OpenDisputeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|In|string>>
     */
    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(Dispute::KINDS)],
            'amount_tiyin' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'body' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

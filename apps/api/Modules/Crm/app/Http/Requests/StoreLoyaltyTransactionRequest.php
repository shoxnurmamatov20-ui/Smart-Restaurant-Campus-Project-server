<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\LoyaltyTransaction;

final class StoreLoyaltyTransactionRequest extends FormRequest
{
    /**
     * Route middleware (`permission:crm.create`) enforces authorisation.
     */
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
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'kind' => ['required', Rule::in(LoyaltyTransaction::KINDS)],
            'points' => ['required', 'integer', 'not_in:0'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

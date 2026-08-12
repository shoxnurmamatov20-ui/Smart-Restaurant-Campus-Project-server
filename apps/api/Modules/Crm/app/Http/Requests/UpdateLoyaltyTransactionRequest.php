<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\LoyaltyTransaction;

final class UpdateLoyaltyTransactionRequest extends FormRequest
{
    /**
     * Route middleware (`permission:crm.update`) enforces authorisation.
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
            'customer_id' => ['sometimes', 'integer', 'exists:customers,id'],
            'kind' => ['sometimes', Rule::in(LoyaltyTransaction::KINDS)],
            'points' => ['sometimes', 'integer', 'not_in:0'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

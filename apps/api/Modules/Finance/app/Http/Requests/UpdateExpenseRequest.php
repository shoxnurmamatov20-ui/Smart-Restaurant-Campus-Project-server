<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\Expense;

final class UpdateExpenseRequest extends FormRequest
{
    /**
     * Route middleware (`permission:finance.update`) enforces authorisation.
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
            'cash_shift_id' => ['nullable', 'integer', 'exists:cash_shifts,id'],
            'category' => ['sometimes', Rule::in(Expense::CATEGORIES)],
            'description' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'integer', 'min:1'],
            'paid_in_cash' => ['nullable', 'boolean'],
            'spent_at' => ['nullable', 'date'],
        ];
    }
}

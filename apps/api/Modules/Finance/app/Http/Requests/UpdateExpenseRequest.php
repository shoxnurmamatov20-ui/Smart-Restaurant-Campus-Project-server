<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Modules\Finance\Rules\ExpenseCategoryExists;

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
            // The same union the store request accepts — see
            // `ExpenseCategoryExists` for why the eight built-ins cannot be
            // expressed as an `exists` rule.
            'category' => ['sometimes', 'string', 'max:32', new ExpenseCategoryExists],
            'description' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'integer', 'min:1'],
            'paid_in_cash' => ['nullable', 'boolean'],
            'spent_at' => ['nullable', 'date'],
            /*
             * Settling an invoice, or un-settling one filed by mistake.
             *
             * Nullable on purpose: `null` is the "mark unpaid" direction, and a
             * rule without it would make the chip a one-way switch — which is
             * how a mis-click becomes a permanent line in the payables figure.
             */
            'paid_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}

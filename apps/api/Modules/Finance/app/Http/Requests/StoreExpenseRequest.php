<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Modules\Finance\Rules\ExpenseCategoryExists;

final class StoreExpenseRequest extends FormRequest
{
    /**
     * Route middleware (`permission:finance.create`) enforces authorisation.
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
            /*
             * One of the eight the platform writes, or one this restaurant
             * added and has not archived.
             *
             * `Rule::in(Expense::CATEGORIES)` alone was here, and it is why
             * nothing on the platform could add a ninth heading: a restaurant
             * that licences music or rents a second van filed all of it under
             * `other` and then could not explain its own ledger. The constant
             * stays in the list because the till writes those eight by name —
             * see the `expense_categories` migration for why the column is not a
             * foreign key.
             */
            'category' => ['required', 'string', 'max:32', new ExpenseCategoryExists],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'integer', 'min:1'],
            'paid_in_cash' => ['nullable', 'boolean'],
            'spent_at' => ['nullable', 'date'],
            /*
             * When the money left, if it already has.
             *
             * Left out means "the model decides", and the model's rule is in
             * `Expense::booted()`: a cash payout is paid the moment it is
             * written, an invoice filed by the books screen is not. Sending it
             * explicitly is how the books form's "to'landi" tick reaches here.
             */
            'paid_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}

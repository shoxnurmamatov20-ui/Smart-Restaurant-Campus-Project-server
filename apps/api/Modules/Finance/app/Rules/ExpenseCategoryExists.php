<?php

declare(strict_types=1);

namespace Modules\Finance\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\ExpenseCategory;

/**
 * A heading a new entry may be filed under.
 *
 * Two sources and the union of them, which is the whole shape of the category
 * feature: `Expense::CATEGORIES` is what the till writes by name — `refund` at
 * closing time, `payroll` when a month's wages are booked — and
 * `finance.expense_categories` is what the restaurant added for itself.
 *
 * Archived headings are refused. That is the difference between archiving and
 * deleting and it is the entire reason archiving exists: last year's entries
 * keep their name on every statement they appear in, and no new entry can join
 * them.
 *
 * A rule object rather than `Rule::exists()` with an `orWhere`, because the
 * built-in eight are a PHP constant with no rows behind them for most
 * restaurants, and an `exists` rule cannot see a constant.
 */
final readonly class ExpenseCategoryExists implements ValidationRule
{
    public function __construct(private string $direction = 'out') {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            $fail('Bunday xarajat toifasi yo\'q.');

            return;
        }

        if ($this->direction === 'out' && in_array($value, Expense::CATEGORIES, true)) {
            // A built-in code is always acceptable, whether or not the
            // restaurant has a row for it — but an explicitly archived row for
            // one is not, so the row is still checked below when it exists.
            $archived = ExpenseCategory::query()
                ->where('code', $value)
                ->ofDirection('out')
                ->whereNotNull('archived_at')
                ->exists();

            if (! $archived) {
                return;
            }

            $fail('Bu toifa arxivlangan — unga yangi yozuv kiritib bo\'lmaydi.');

            return;
        }

        $live = ExpenseCategory::query()
            ->live()
            ->ofDirection($this->direction)
            ->where('code', $value)
            ->exists();

        if (! $live) {
            $fail('Bunday xarajat toifasi yo\'q.');
        }
    }
}

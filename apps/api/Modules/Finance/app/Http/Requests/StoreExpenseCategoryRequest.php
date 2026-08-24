<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\ExpenseCategory;

/**
 * A ninth heading in the ledger.
 *
 * The code is what lands in `expenses.category`, so it is constrained to what a
 * varchar column and a URL filter can both carry — lower snake, nothing else. A
 * category called `Ta'mir & bo'yoq` would come back from
 * `?filter[category]=` differently than it went in, and the entries would
 * disappear from their own heading.
 */
final class StoreExpenseCategoryRequest extends FormRequest
{
    /** Route middleware (`permission:finance.manage`) enforces authorisation. */
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
            'code' => [
                'required', 'string', 'max:32', 'regex:/^[a-z][a-z0-9_]*$/',
                Rule::unique('expense_categories', 'code')
                    ->where('tenant_id', app(TenantContext::class)->id())
                    ->where('direction', $this->input('direction', 'out')),
            ],
            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:80'],
            'name.ru' => ['nullable', 'string', 'max:80'],
            'name.en' => ['nullable', 'string', 'max:80'],
            'direction' => ['nullable', Rule::in(ExpenseCategory::DIRECTIONS)],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
        ];
    }
}

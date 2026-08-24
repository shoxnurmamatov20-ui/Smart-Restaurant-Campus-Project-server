<?php

declare(strict_types=1);

namespace Modules\Analytics\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Analytics\Services\CustomReports;
use Modules\Analytics\Services\ReportWindow;

/**
 * What the builder dialog collects: a base, some columns, a grouping.
 *
 * Every one of the three is checked against `CustomReports`' own whitelist
 * rather than against a list repeated here — that constant is what builds the
 * SQL, so it is the only list that can be right.
 *
 * The column rule is a closure rather than `Rule::in`, because which columns
 * are legal depends on the base: `labour_percent` is a staff column and asking
 * for it on a sales report is a request the picker could not have produced.
 */
final class CustomReportRequest extends FormRequest
{
    /** Route middleware (`permission:analytics.view`) enforces authorisation. */
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
            'base' => ['required', 'string', Rule::in(CustomReports::BASES)],
            'group_by' => ['required', 'string', Rule::in(CustomReports::GROUPS)],
            'period' => ['sometimes', 'string', Rule::in(ReportWindow::PERIODS)],
            // At least one, because a report of no columns is a row count. The
            // ceiling is the widest base plus room to grow.
            'columns' => ['required', 'array', 'min:1', 'max:20'],
            'columns.*' => [
                'required', 'string',
                function (string $attribute, mixed $value, callable $fail): void {
                    $base = (string) $this->input('base');

                    if (! is_string($value) || ! CustomReports::offers($base, $value)) {
                        $fail("The {$attribute} is not a column of the {$base} report.");
                    }
                },
            ],
        ];
    }
}

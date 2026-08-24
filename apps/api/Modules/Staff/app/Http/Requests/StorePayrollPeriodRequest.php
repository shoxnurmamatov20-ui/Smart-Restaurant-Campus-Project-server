<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Modules\Staff\Models\PayrollPeriod;

/**
 * Opening — or rebuilding — a month.
 *
 * A month and a venue, and nothing else. The window, the lines and the three
 * totals are all computed: letting a caller send `starts_on` would let them
 * send a window that is not the month the payslip is headed with, which is the
 * one disagreement a payroll table cannot survive.
 */
final class StorePayrollPeriodRequest extends FormRequest
{
    /**
     * Route middleware (`permission:staff.manage`) enforces authorisation.
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
            /*
             * `YYYY-MM`, with a real month number in it.
             *
             * A pattern rather than `date_format:Y-m`, which PHP's parser is
             * cheerfully lenient about — it accepts `2026-13` and rolls it into
             * January 2027, so a typo would silently open the wrong year's
             * January and only surface when somebody wondered why it was empty.
             * The pattern lives on the model so the rule is written once.
             */
            'period' => ['required', 'string', 'regex:'.PayrollPeriod::PERIOD_PATTERN],

            /*
             * Optional, and its absence means something specific rather than
             * "not sure": no branch is the run across the whole business, which
             * is what a single-site café does every month. See the migration.
             */
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'period.regex' => "Oy YYYY-MM ko'rinishida bo'lishi kerak, masalan 2026-08.",
        ];
    }
}

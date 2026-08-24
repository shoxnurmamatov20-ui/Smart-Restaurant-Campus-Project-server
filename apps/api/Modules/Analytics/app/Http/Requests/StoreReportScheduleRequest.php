<?php

declare(strict_types=1);

namespace Modules\Analytics\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Analytics\Models\ReportSchedule;
use Modules\Analytics\Services\CustomReports;
use Modules\Analytics\Services\ReportWindow;
use Modules\Analytics\Services\StandardReports;

/**
 * A report somebody wants to stop asking for.
 *
 * `destinations` is required and non-empty, and that is the rule worth stating:
 * a schedule with nowhere to send is a job that runs every Monday, builds a
 * month of cashflow and throws it away. The console's own dialog refuses to
 * save without one; the server refuses too, because a form can be submitted
 * before a checkbox has registered.
 *
 * A `custom` schedule carries the builder's body under `definition`, validated
 * against the same whitelist a one-off run goes through. Storing the request's
 * own shape is what keeps the two from drifting — a column that stopped being
 * offered stops being schedulable on the same commit.
 */
final class StoreReportScheduleRequest extends FormRequest
{
    /** Route middleware (`permission:reports.export`) enforces authorisation. */
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
            'kind' => ['required', 'string', Rule::in([...StandardReports::KINDS, 'custom'])],
            'period' => ['sometimes', 'string', Rule::in(ReportWindow::PERIODS)],
            'frequency' => ['required', 'string', Rule::in(ReportSchedule::FREQUENCIES)],
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')],

            'destinations' => ['required', 'array', 'min:1', 'max:10'],
            'destinations.*.channel' => ['required', 'string', Rule::in(ReportSchedule::CHANNELS)],
            /*
             * One field for two kinds of address, checked per channel below.
             * A single `email` rule would refuse a Telegram chat id and an
             * unchecked string would let a typo'd address sit in the table for
             * a month while nobody wondered why the report stopped.
             */
            'destinations.*.target' => [
                'required', 'string', 'max:190',
                function (string $attribute, mixed $value, callable $fail): void {
                    $index = explode('.', $attribute)[1] ?? '';
                    $channel = $this->input("destinations.{$index}.channel");

                    if ($channel === 'mail' && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
                        $fail("The {$attribute} must be an email address.");
                    }

                    // Telegram chat ids are numeric — negative for a group —
                    // or an @handle. Anything else is a person having typed
                    // their own name into the box.
                    if ($channel === 'telegram'
                        && preg_match('/^(-?\d{1,32}|@[A-Za-z0-9_]{4,32})$/', (string) $value) !== 1) {
                        $fail("The {$attribute} must be a Telegram chat id or @handle.");
                    }
                },
            ],

            'definition' => ['required_if:kind,custom', 'nullable', 'array'],
            'definition.base' => ['required_if:kind,custom', 'string', Rule::in(CustomReports::BASES)],
            'definition.group_by' => ['required_if:kind,custom', 'string', Rule::in(CustomReports::GROUPS)],
            'definition.columns' => ['required_if:kind,custom', 'array', 'min:1', 'max:20'],
            'definition.columns.*' => [
                'string',
                function (string $attribute, mixed $value, callable $fail): void {
                    $base = (string) $this->input('definition.base');

                    if (! is_string($value) || ! CustomReports::offers($base, $value)) {
                        $fail("The {$attribute} is not a column of the {$base} report.");
                    }
                },
            ],
        ];
    }
}

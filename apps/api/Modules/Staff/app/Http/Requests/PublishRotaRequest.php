<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Publishing a week.
 *
 * A date range rather than a list of shift ids, because that is the act: a
 * manager publishes *the week*, not fourteen rows, and a list would silently
 * leave out the shift they added last and forgot to tick.
 */
final class PublishRotaRequest extends FormRequest
{
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
            'from' => ['required', 'date'],
            // `after_or_equal` rather than `after`: publishing a single day is
            // what a manager does when they fill one gap on Thursday morning.
            'to' => ['required', 'date', 'after_or_equal:from'],
        ];
    }
}

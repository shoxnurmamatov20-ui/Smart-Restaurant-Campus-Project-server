<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The four columns on a payslip line a person may set.
 *
 * Everything else on the line is computed from attendance and is deliberately
 * not writable: `minutes_worked`, `hourly_rate` and `basic_tiyin` are the record
 * of what happened, and a payroll screen that can type over them is a payroll
 * screen with no audit value at all. Correcting a missed clock-out is a
 * correction to the attendance row, followed by a rebuild.
 *
 * `net_tiyin` is absent for the same reason and one more: it is an addition of
 * the other four, so accepting it would let a request state a total that does
 * not follow from its own parts.
 */
final class UpdatePayrollLineRequest extends FormRequest
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
             * `sometimes` throughout: this is a PATCH, and a screen that sends
             * only the field somebody touched must not blank the other three.
             *
             * `min:0` on all of them. A negative bonus is a deduction and a
             * negative deduction is a bonus — either one entered in the wrong
             * box is a figure that reads correctly on the line and wrongly in
             * every total that groups by what the money was. The signed column
             * is for the RESULT being negative, not for the inputs.
             */
            'bonus_tiyin' => ['sometimes', 'integer', 'min:0'],
            'deductions_tiyin' => ['sometimes', 'integer', 'min:0'],
            'service_charge_tiyin' => ['sometimes', 'integer', 'min:0'],
            // What the deduction was for. The migration argues why this is one
            // sentence rather than five more columns.
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}

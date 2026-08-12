<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Staff\Models\StaffMember;

final class UpdateStaffMemberRequest extends FormRequest
{
    /**
     * Route middleware (`permission:staff.update`) enforces authorisation.
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
        $tenantId = app(TenantContext::class)->id();

        return [
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'employee_code' => ['sometimes', 'string', 'max:32', Rule::unique('staff_members', 'employee_code')->ignore($this->route('member'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'first_name' => ['sometimes', 'string', 'max:120'],
            'last_name' => ['sometimes', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:32'],
            'position' => ['sometimes', Rule::in(StaffMember::POSITIONS)],
            'branch_code' => ['nullable', 'string', 'max:32'],
            'hourly_rate' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', Rule::in(StaffMember::STATUSES)],
            'hired_at' => ['nullable', 'date', 'before_or_equal:today'],
            'health_book_expires_at' => ['nullable', 'date'],
        ];
    }
}

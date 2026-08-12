<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateCashShiftRequest extends FormRequest
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
        $tenantId = app(TenantContext::class)->id();

        return [
            'number' => ['sometimes', 'string', 'max:24', Rule::unique('cash_shifts', 'number')->ignore($this->route('shift'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'opened_by_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'opening_cash' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

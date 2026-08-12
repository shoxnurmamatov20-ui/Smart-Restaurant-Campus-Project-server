<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateHallRequest extends FormRequest
{
    /**
     * Route middleware (`permission:tables.update`) enforces authorisation.
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
            'code' => ['sometimes', 'string', 'max:32', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique('halls', 'code')->ignore($this->route('hall'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['sometimes', 'string', 'max:120'],
            'capacity' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}

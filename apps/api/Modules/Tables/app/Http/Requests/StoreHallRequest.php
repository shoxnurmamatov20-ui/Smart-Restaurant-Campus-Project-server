<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreHallRequest extends FormRequest
{
    /**
     * Route middleware (`permission:tables.create`) enforces authorisation.
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
            'code' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique('halls', 'code')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['required', 'string', 'max:120'],
            'capacity' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.regex' => "Zal kodi faqat harf, raqam, tire va pastki chiziqdan iborat bo'lishi mumkin.",
        ];
    }
}

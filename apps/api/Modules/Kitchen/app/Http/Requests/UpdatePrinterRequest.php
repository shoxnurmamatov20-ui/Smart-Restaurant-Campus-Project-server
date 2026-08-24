<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Kitchen\Models\Printer;

final class UpdatePrinterRequest extends FormRequest
{
    /** Route middleware (`permission:kitchen.manage`) enforces authorisation. */
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
            'code' => ['sometimes', 'string', 'max:32', 'regex:/^[a-z0-9-]+$/', Rule::unique('printers', 'code')->ignore($this->route('printer'))->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'name' => ['sometimes', 'string', 'max:120'],
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'role' => ['sometimes', Rule::in(Printer::ROLES)],
            'connection' => ['nullable', Rule::in(Printer::CONNECTIONS)],
            'target' => ['nullable', 'string', 'max:190'],
            /*
             * 32 to 64 columns. Below 32 nothing legible fits on a receipt line,
             * and above 64 the value is almost certainly a pixel width somebody
             * has typed into the wrong box — 576 is the dot count of an 80 mm
             * head and the number a datasheet gives you.
             */
            'columns' => ['nullable', 'integer', 'min:32', 'max:64'],
            'codepage' => ['nullable', Rule::in(Printer::CODEPAGES)],
            'cuts' => ['nullable', 'boolean'],
            'opens_drawer' => ['nullable', 'boolean'],
            'copies' => ['nullable', 'integer', 'min:1', 'max:5'],
            'is_active' => ['nullable', 'boolean'],
            'is_default' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.regex' => 'Printer kodi faqat kichik harf, raqam va chiziqchadan iborat.',
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Pos\Models\Terminal;

final class StoreTerminalRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The route already carries `permission:pos.terminal`; repeating it here
        // would mean two places to change and one to forget.
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'code' => [
                'required', 'string', 'max:32', 'regex:/^[A-Za-z0-9._-]+$/',
                // Bare table name, not `pos.terminals`: Laravel reads a dot in a
                // validation rule as *connection*.table, and there is no `pos`
                // connection. Resolution comes from the search_path instead —
                // which is exactly why config/database.php lists every module
                // schema on it.
                //
                // Scoped by tenant by hand, because two restaurants may both
                // call their first till KASSA-1.
                Rule::unique('terminals', 'code')
                    ->where('tenant_id', $this->user()?->tenant_id)
                    ->whereNull('deleted_at'),
            ],
            'name' => ['required', 'string', 'max:120'],
            'mode' => ['required', 'string', Rule::in(Terminal::MODES)],
            'status' => ['sometimes', 'string', Rule::in(Terminal::STATUSES)],
            'branch_id' => ['nullable', 'integer', 'min:1'],
            'settings' => ['sometimes', 'array'],
            'settings.currency' => ['sometimes', 'string', 'size:3'],
            'settings.cash_rounding_tiyin' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'settings.discount_limits' => ['sometimes', 'array'],
            'settings.discount_limits.*' => ['integer', 'min:0', 'max:100'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.unique' => 'Bu restoranda shu kodli kassa allaqachon bor.',
            'mode.in' => 'Rejim quyidagilardan biri bo\'lishi kerak: table_service, quick_service, bar, counter.',
        ];
    }
}

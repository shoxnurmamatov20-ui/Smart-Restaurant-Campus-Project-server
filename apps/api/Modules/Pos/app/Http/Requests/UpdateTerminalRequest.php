<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Pos\Models\Terminal;

final class UpdateTerminalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Terminal $terminal */
        $terminal = $this->route('terminal');

        return [
            'code' => [
                'sometimes', 'string', 'max:32', 'regex:/^[A-Za-z0-9._-]+$/',
                // Bare name — a dot here would be read as a connection. See
                // StoreTerminalRequest for the full reasoning.
                Rule::unique('terminals', 'code')
                    ->where('tenant_id', $terminal->tenant_id)
                    ->whereNull('deleted_at')
                    ->ignore($terminal->id),
            ],
            'name' => ['sometimes', 'string', 'max:120'],
            'mode' => ['sometimes', 'string', Rule::in(Terminal::MODES)],
            'status' => ['sometimes', 'string', Rule::in(Terminal::STATUSES)],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'pos_layout_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'settings' => ['sometimes', 'array'],
            'settings.currency' => ['sometimes', 'string', 'size:3'],
            'settings.cash_rounding_tiyin' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'settings.discount_limits' => ['sometimes', 'array'],
            'settings.discount_limits.*' => ['integer', 'min:0', 'max:100'],
        ];
    }
}

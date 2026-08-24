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
                    // The branch it is *moving to* if one was sent, otherwise
                    // the one it already stands in — a rename must be checked
                    // against the same branch the row will end up in.
                    ->where('branch_id', $this->has('branch_id')
                        ? $this->input('branch_id')
                        : $terminal->branch_id)
                    ->whereNull('deleted_at')
                    ->ignore($terminal->id),
            ],
            'name' => ['sometimes', 'string', 'max:120'],
            'mode' => ['sometimes', 'string', Rule::in(Terminal::MODES)],
            'status' => ['sometimes', 'string', Rule::in(Terminal::STATUSES)],
            // Must exist and be ours — see StoreTerminalRequest for why an
            // unchecked branch_id is a cross-tenant hole rather than a typo.
            'branch_id' => [
                'sometimes', 'nullable', 'integer', 'min:1',
                Rule::exists('branches', 'id')
                    ->where('tenant_id', $terminal->tenant_id)
                    ->whereNull('deleted_at'),
            ],
            'pos_layout_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'settings' => ['sometimes', 'array'],
            'settings.currency' => ['sometimes', 'string', 'size:3'],
            'settings.cash_rounding_tiyin' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'settings.discount_limits' => ['sometimes', 'array'],
            'settings.discount_limits.*' => ['integer', 'min:0', 'max:100'],

            /*
             * The idle screen — what this till shows all day when nobody is
             * signed in. Declared rather than left inside a free-form
             * `settings` array because `headline` is free text that ends up on
             * a screen in a room full of guests, and `mode` decides which
             * blocks are drawn at all.
             */
            'settings.idle.mode' => ['sometimes', 'string', Rule::in(Terminal::IDLE_MODES)],
            'settings.idle.background' => ['sometimes', 'string', Rule::in(Terminal::IDLE_BACKGROUNDS)],
            'settings.idle.blocks' => ['sometimes', 'array'],
            'settings.idle.blocks.*' => ['boolean'],
            'settings.idle.headline' => ['sometimes', 'nullable', 'string', 'max:80'],
            'settings.idle.subline' => ['sometimes', 'nullable', 'string', 'max:160'],
            // Minutes of no touch before the till drops back to the idle
            // screen. Clamped at half an hour: a longer lock is a bill left
            // open on a counter in a public room.
            'settings.idle.lock_minutes' => ['sometimes', 'integer', 'min:1', 'max:30'],
        ];
    }
}

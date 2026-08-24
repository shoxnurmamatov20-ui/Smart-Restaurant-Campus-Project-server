<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Pos\Models\Terminal;

/**
 * The unsaved idle-screen draft the console wants shown on a till.
 *
 * Validated as tightly as the saved version even though nothing is stored: the
 * payload is broadcast straight onto a screen in a public room, and `headline`
 * is free text somebody types. An unbounded string here is a message that
 * covers the whole counter.
 */
final class PreviewIdleRequest extends FormRequest
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
        return [
            'mode' => ['sometimes', 'string', Rule::in(Terminal::IDLE_MODES)],
            'background' => ['sometimes', 'string', Rule::in(Terminal::IDLE_BACKGROUNDS)],
            'blocks' => ['sometimes', 'array'],
            'blocks.*' => ['boolean'],
            'headline' => ['sometimes', 'nullable', 'string', 'max:80'],
            'subline' => ['sometimes', 'nullable', 'string', 'max:160'],
            // Ten seconds is long enough to walk to the till and look; two
            // minutes is long enough to forget about it.
            'seconds' => ['sometimes', 'integer', 'min:5', 'max:120'],
        ];
    }
}

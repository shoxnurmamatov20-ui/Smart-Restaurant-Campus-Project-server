<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Trigger;

/**
 * Editing an automation. `key` is absent on purpose.
 *
 * The console addresses a trigger by key and `crm.trigger_sends` counts against
 * its id; renaming the key would leave the screen pointing at nothing while the
 * cooldown history stayed attached to a row nobody can find. A trigger that
 * needs a different key is a different trigger.
 */
final class UpdateTriggerRequest extends FormRequest
{
    /** Route middleware (`permission:crm.update`) enforces authorisation. */
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
            'kind' => ['sometimes', Rule::in(Trigger::KINDS)],

            'name' => ['sometimes', 'array'],
            'name.uz' => ['sometimes', 'string', 'max:160'],
            'name.ru' => ['nullable', 'string', 'max:160'],
            'name.en' => ['nullable', 'string', 'max:160'],
            'rule_text' => ['nullable', 'array'],
            'rule_text.uz' => ['nullable', 'string', 'max:300'],
            'rule_text.ru' => ['nullable', 'string', 'max:300'],
            'rule_text.en' => ['nullable', 'string', 'max:300'],

            'body' => ['sometimes', 'string', 'min:2', 'max:640'],

            'offset_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'offset_hours' => ['nullable', 'integer', 'min:0', 'max:720'],
            'cooldown_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'min_tiyin' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}

<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Crm\Models\Trigger;

/**
 * An automation somebody is switching on.
 *
 * `cooldown_days` has a floor of 1 and no way to write 0, and that is the rule
 * with teeth. A trigger with no cooldown fires on the same person every morning
 * for as long as they match — a win-back sent daily is not marketing, it is what
 * gets a sender name blocked by the regulator. Zero is refused where somebody
 * can still see why.
 *
 * `is_active` defaults to false and is deliberately absent from the defaults a
 * client can rely on: an automation that started sending the moment it was
 * created would send its first run against a rule nobody had read back.
 */
final class StoreTriggerRequest extends FormRequest
{
    /** Route middleware (`permission:crm.create`) enforces authorisation. */
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
            // The console addresses a trigger by key, so it has to be typable
            // and stable: letters, digits, dash, underscore.
            'key' => ['required', 'string', 'max:32', 'regex:/^[a-z0-9_-]+$/'],
            'kind' => ['required', Rule::in(Trigger::KINDS)],

            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:160'],
            'name.ru' => ['nullable', 'string', 'max:160'],
            'name.en' => ['nullable', 'string', 'max:160'],
            'rule_text' => ['nullable', 'array'],
            'rule_text.uz' => ['nullable', 'string', 'max:300'],
            'rule_text.ru' => ['nullable', 'string', 'max:300'],
            'rule_text.en' => ['nullable', 'string', 'max:300'],

            'body' => ['required', 'string', 'min:2', 'max:640'],

            'offset_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'offset_hours' => ['nullable', 'integer', 'min:0', 'max:720'],
            'cooldown_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'min_tiyin' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'cooldown_days.min' => 'Takrorlanish oralig\'i kamida bir kun bo\'lishi kerak.',
        ];
    }
}

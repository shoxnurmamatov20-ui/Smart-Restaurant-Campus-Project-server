<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\TelegramBots\Models\NotificationRule;

/**
 * Changing a rule that already exists.
 *
 * Every field `sometimes`, because the console saves one control at a time: a
 * manager flipping a switch sends `enabled` and nothing else, and a request
 * that demanded the whole row back would blank the threshold they set last week.
 */
final class UpdateNotificationRuleRequest extends FormRequest
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
            'event' => ['sometimes', 'string', Rule::in(NotificationRule::EVENTS)],
            'chat_id' => ['sometimes', 'string', 'regex:/^-?\d{6,20}$/'],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'bot_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'locale' => ['sometimes', 'string', 'in:uz,ru,en'],
            'min_amount_tiyin' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'enabled' => ['sometimes', 'boolean'],
        ];
    }
}

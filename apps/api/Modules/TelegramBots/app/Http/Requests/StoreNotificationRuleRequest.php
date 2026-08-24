<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\TelegramBots\Models\NotificationRule;

/**
 * "Tell this chat when that happens."
 *
 * `chat_id` is checked by shape rather than by asking Telegram: a group id is
 * negative and long, a private id is positive, and neither can be confirmed to
 * exist without sending a message to it. The console's Test button is what
 * confirms it — see NotificationRuleController::test.
 */
final class StoreNotificationRuleRequest extends FormRequest
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
            'event' => ['required', 'string', Rule::in(NotificationRule::EVENTS)],
            'chat_id' => ['required', 'string', 'regex:/^-?\d{6,20}$/'],
            // Optional: null means every venue, which is what an owner's own
            // chat wants and what a branch group must not have.
            'branch_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'bot_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'locale' => ['sometimes', 'string', 'in:uz,ru,en'],
            // Tiyin. A rule that fires on everything gets muted in a week.
            'min_amount_tiyin' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'enabled' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'chat_id.regex' => 'Chat id — raqamlardan iborat; guruh uchun minus bilan boshlanadi.',
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Contracts\Messaging;

use Illuminate\Support\Facades\Log;

/**
 * What a chat message does when the TelegramBots module is not installed.
 *
 * It declines, quietly, and answers `false` — unlike the write fallbacks in
 * `App\Contracts\Inventory`, which throw. The difference is what the caller
 * does with the answer: a write-off that claimed to have landed loses four
 * kilograms of chicken, whereas a report that could not be delivered is a
 * report the schedule will mark as failed and try again tomorrow. Nobody's
 * books move either way.
 *
 * Logged rather than silent, because "the weekly report stopped arriving" is
 * reported by a person weeks later and the log line is the only thing that says
 * why.
 */
final class UnavailableChatNotifier implements ChatNotifier
{
    public function notify(int $tenantId, string $chatId, string $text, ?array $document = null): bool
    {
        Log::warning('chat.notify.module_absent', ['tenant' => $tenantId, 'chat' => $chatId]);

        return false;
    }

    public function defaultChat(int $tenantId): ?string
    {
        // Not logged. Unlike a send that was asked for and did not happen, this
        // is a question — and the caller's own refusal ("no chat configured")
        // is the line worth having, once, rather than twice.
        return null;
    }
}

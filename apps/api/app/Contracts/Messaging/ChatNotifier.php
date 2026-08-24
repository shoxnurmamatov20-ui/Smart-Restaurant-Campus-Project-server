<?php

declare(strict_types=1);

namespace App\Contracts\Messaging;

/**
 * Putting a message — and optionally a file — into a restaurant's own chat.
 *
 * The sibling of {@see SmsSender}, and it exists for the same reason: the
 * gateway that talks to api.telegram.org lives in `Modules\TelegramBots`, and a
 * second module that wanted to use it would have to import it.
 * `ModuleBoundaryTest` records exactly three edges out of Analytics — Menu,
 * Orders and Finance, all reads — and a scheduled report emailing itself to a
 * manager's chat is not a reason to add a fourth.
 *
 * The first caller is `analytics:send-scheduled`, which attaches a CSV. That is
 * why `$document` is on the interface rather than a second method: a report
 * with no file is a message saying a report exists, which is the thing a
 * schedule is supposed to replace.
 *
 * ---------------------------------------------------------------------------
 * What an implementation promises
 *
 * **It never throws for a refusal.** A chat that has blocked the bot, a token
 * that is not configured, a network that timed out — all of them answer
 * `false`. The caller is a scheduler tick with eleven other schedules behind
 * it, and one restaurant's dead chat must not stop the other ten.
 *
 * **It is the chat's language, not the sender's.** Callers pass text already
 * phrased for the reader; nothing here translates.
 */
interface ChatNotifier
{
    /**
     * @param  int  $tenantId  whose bot to speak with — a chat id means nothing
     *                         without knowing which bot has met it
     * @param  string  $chatId  Telegram's own id, positive for a person and
     *                          negative for a group
     * @param  string  $text  already in the reader's language
     * @param  array{name: string, contents: string}|null  $document  a file to
     *                                                                attach, contents already rendered
     * @return bool whether the chat actually received it
     */
    public function notify(int $tenantId, string $chatId, string $text, ?array $document = null): bool;

    /**
     * Where this restaurant's messages go when the caller names no chat.
     *
     * A schedule always carries its own destinations — somebody typed them. The
     * export dialog does not: a manager pressing *Telegramga* has one chat in
     * mind, the one the restaurant already gets its shift reports in, and
     * asking them to paste a numeric chat id into an export dialog is asking
     * them to go and find it.
     *
     * On the interface rather than in the caller for the reason the whole file
     * exists: the chat ids live in `telegram.notification_rules`, and a second
     * module reading that table would have to import this one.
     *
     * `null` when the restaurant has never pointed a chat at anything — which
     * is a refusal the caller must render as "set a chat up first", not as a
     * send that silently went nowhere.
     */
    public function defaultChat(int $tenantId): ?string;
}

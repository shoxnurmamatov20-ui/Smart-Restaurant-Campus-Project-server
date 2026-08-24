<?php

declare(strict_types=1);

namespace App\Contracts\Messaging;

/**
 * The restaurant's own Telegram bot, as far as the rest of the platform is
 * concerned.
 *
 * One question and one answer: the token that signs this restaurant's mini
 * app. It is needed outside the Telegram module — the guest signing in from
 * inside Telegram is a CRM guest, and CRM may not import TelegramBots — and
 * a token is the smallest thing that answers it. Nothing here lists bots,
 * sends messages or reaches Telegram; `ChatNotifier` is the write.
 */
interface BotDirectory
{
    /**
     * The signing token for this restaurant, or null when it has connected no
     * bot (or the module is switched off).
     *
     * Null is an ordinary answer, not a failure: most restaurants have not
     * connected one, and the screens that ask say so rather than breaking.
     */
    public function signingToken(int $tenantId): ?string;
}

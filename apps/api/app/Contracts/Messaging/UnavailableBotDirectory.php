<?php

declare(strict_types=1);

namespace App\Contracts\Messaging;

/** No Telegram module, no bot: the mini app says the restaurant has not connected one. */
final class UnavailableBotDirectory implements BotDirectory
{
    public function signingToken(int $tenantId): ?string
    {
        return null;
    }
}

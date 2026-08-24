<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Services;

use App\Contracts\Messaging\BotDirectory;
use Modules\TelegramBots\Models\Bot;

/**
 * The newest enabled bot that has a token.
 *
 * A restaurant may register several — a menu bot, a courier bot — and any of
 * them signs the same mini app, because the signature says "this Telegram
 * account, through this restaurant's bot" and the guest belongs to the
 * restaurant either way.
 */
final class EloquentBotDirectory implements BotDirectory
{
    public function signingToken(int $tenantId): ?string
    {
        $bot = Bot::query()
            ->where('tenant_id', $tenantId)
            ->where('enabled', true)
            ->whereNotNull('encrypted_token')
            ->orderByDesc('id')
            ->first();

        $token = $bot?->token;

        return is_string($token) && $token !== '' ? $token : null;
    }
}

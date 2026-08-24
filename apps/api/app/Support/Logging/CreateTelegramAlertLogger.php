<?php

declare(strict_types=1);

namespace App\Support\Logging;

use Monolog\Level;
use Monolog\Logger;

/** Monolog factory for the `telegram` channel in `config/logging.php`. */
final class CreateTelegramAlertLogger
{
    /** @param array<string, mixed> $config */
    public function __invoke(array $config): Logger
    {
        $level = Level::fromName(ucfirst((string) ($config['level'] ?? 'critical')));

        return new Logger('telegram', [
            new TelegramAlertHandler(
                token: $config['token'] ?? null,
                chatId: $config['chat_id'] ?? null,
                level: $level,
            ),
        ]);
    }
}

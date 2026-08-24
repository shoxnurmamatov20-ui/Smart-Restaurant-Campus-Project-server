<?php

declare(strict_types=1);

namespace App\Support\Logging;

use Illuminate\Support\Facades\Http;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;
use Throwable;

/**
 * `critical` and above, to the same Telegram chat the server's own alerts use.
 *
 * The box already has one operations channel — `srcp-notify`, fed by systemd
 * when a unit fails. What it did not have was the application's side of the
 * story: a payment callback whose signature did not verify, a fiscal registrar
 * that stopped answering, an exception in the order pipeline. Those went to a
 * log file that nobody reads until a restaurant phones.
 *
 * Deliberately narrow. `critical` is what the code reserves for "a person must
 * look at this today" — not validation failures, not 404s, not the deprecation
 * stream. A channel that pages for everything is muted within a week.
 *
 * The token comes from the same `/etc/srcp/alerts.env` the shell tool reads,
 * passed into the app as `TELEGRAM_ALERT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID`.
 * Unset means this handler silently does nothing — a monitoring channel must
 * never be the thing that breaks the request it is reporting on, and for the
 * same reason every send is wrapped and given three seconds.
 */
final class TelegramAlertHandler extends AbstractProcessingHandler
{
    public function __construct(
        private readonly ?string $token,
        private readonly ?string $chatId,
        int|string|Level $level = Level::Critical,
    ) {
        parent::__construct($level, bubble: true);
    }

    protected function write(LogRecord $record): void
    {
        if ($this->token === null || $this->token === '' || $this->chatId === null || $this->chatId === '') {
            return;
        }

        $text = sprintf(
            "🔴 %s · %s\n%s\n%s",
            config('app.name'),
            $record->level->getName(),
            mb_substr($record->message, 0, 900),
            $this->contextLine($record),
        );

        try {
            Http::timeout(3)
                ->asForm()
                ->post("https://api.telegram.org/bot{$this->token}/sendMessage", [
                    'chat_id' => $this->chatId,
                    'text' => $text,
                    'disable_web_page_preview' => true,
                ]);
        } catch (Throwable) {
            // The log line itself still goes to the file handler below this one.
        }
    }

    /** The exception class and where it was thrown, when there is one. */
    private function contextLine(LogRecord $record): string
    {
        $exception = $record->context['exception'] ?? null;

        if (! $exception instanceof Throwable) {
            return '';
        }

        return sprintf('%s @ %s:%d', $exception::class, basename($exception->getFile()), $exception->getLine());
    }
}

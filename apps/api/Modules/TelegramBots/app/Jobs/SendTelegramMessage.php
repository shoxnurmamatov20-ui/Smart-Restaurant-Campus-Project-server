<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\BotUser;
use Modules\TelegramBots\Models\Message;
use RuntimeException;

/**
 * Sends a text message to a Telegram user via the apps/telegram-bots service.
 *
 * Usage from anywhere in Laravel:
 *
 *   SendTelegramMessage::dispatch(
 *       botKey: 'student',
 *       telegramChatId: $student->telegram_chat_id,
 *       text: "💯 Yangi baho: {$subject}: {$score}",
 *       channel: 'grades.posted',
 *       userId: $student->id,
 *   );
 */
final class SendTelegramMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public int $backoff = 30;

    public function __construct(
        public readonly string $botKey,
        public readonly int $telegramChatId,
        public readonly string $text,
        public readonly ?string $channel = null,
        public readonly ?int $userId = null,
        public readonly ?array $replyMarkup = null,
        public readonly bool $disablePreview = true,
        public readonly string $parseMode = 'HTML',
    ) {}

    public function handle(): void
    {
        $bot = Bot::where('key', $this->botKey)->firstOrFail();

        $botUser = BotUser::where('bot_id', $bot->id)
            ->where('telegram_id', $this->telegramChatId)
            ->first();

        $log = Message::create([
            'bot_id' => $bot->id,
            'bot_user_id' => $botUser?->id,
            'telegram_chat_id' => $this->telegramChatId,
            'text' => $this->text,
            'channel' => $this->channel,
            'status' => 'queued',
        ]);

        try {
            $resp = Http::asJson()
                ->timeout(15)
                ->withToken(config('telegrambots.internal_token'))
                ->post(
                    config('telegrambots.bots_service_url')."/internal/send/{$this->botKey}",
                    [
                        'chat_id' => $this->telegramChatId,
                        'text' => $this->text,
                        'parse_mode' => $this->parseMode,
                        'reply_markup' => $this->replyMarkup,
                        'disable_web_page_preview' => $this->disablePreview,
                    ]
                );

            if (! $resp->successful()) {
                throw new RuntimeException("telegram-bots service returned {$resp->status()}: {$resp->body()}");
            }

            $body = $resp->json();
            $log->update([
                'status' => 'sent',
                'telegram_message_id' => $body['message_id'] ?? null,
                'sent_at' => now(),
            ]);
        } catch (\Throwable $e) {
            $log->update([
                'status' => 'failed',
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}

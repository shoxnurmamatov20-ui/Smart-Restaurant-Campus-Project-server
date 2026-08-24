<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Services;

use App\Contracts\Messaging\ChatNotifier;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\NotificationRule;
use Throwable;

/**
 * This module's answer to `App\Contracts\Messaging\ChatNotifier`.
 *
 * A sibling of {@see TelegramNotifier} rather than a method on it, because the
 * two answer different questions. That one decides *whether* to say something —
 * it walks the notification rules, checks thresholds and picks a phrase. This
 * one is told exactly what to say and to whom, by a caller outside the module
 * that must not know Telegram exists.
 *
 * What they share is the failure mode, and it is deliberate: a send that does
 * not happen answers `false` and is logged. The first caller is
 * `analytics:send-scheduled`, draining a queue of schedules — an exception here
 * would stop the ten restaurants behind the one whose bot token was revoked.
 */
final class TelegramChatNotifier implements ChatNotifier
{
    private const API = 'https://api.telegram.org';

    /**
     * Longer than the event notifier's four seconds, because this one uploads.
     *
     * A month of cashflow is a few dozen kilobytes over whatever connection the
     * server has, and four seconds is a timeout that would fail the send and
     * then succeed on the retry — which delivers the report twice.
     */
    private const TIMEOUT = 20;

    public function notify(int $tenantId, string $chatId, string $text, ?array $document = null): bool
    {
        $token = $this->tokenFor($tenantId);

        if ($token === null) {
            /*
             * TODO(integration): needs TELEGRAM_BOT_TOKEN — see docs/GO-LIVE.md.
             *
             * Everything below this line works; what is missing is a restaurant
             * having pasted a token into `telegram.bots`. Reported rather than
             * thrown, so a schedule with a mail destination beside this one
             * still delivers.
             */
            Log::warning('telegram.chat.no_token', ['tenant' => $tenantId, 'chat' => $chatId]);

            return false;
        }

        try {
            $response = $document === null
                ? Http::timeout(self::TIMEOUT)->asJson()->post(self::API."/bot{$token}/sendMessage", [
                    'chat_id' => $chatId,
                    'text' => $text,
                    'parse_mode' => 'HTML',
                    'disable_web_page_preview' => true,
                ])
                : Http::timeout(self::TIMEOUT)
                    ->attach('document', $document['contents'], $document['name'])
                    ->post(self::API."/bot{$token}/sendDocument", [
                        'chat_id' => $chatId,
                        // Telegram calls the message under a file its caption,
                        // and it is capped at 1024 characters — a report's
                        // one-line summary, never the report itself.
                        'caption' => mb_substr($text, 0, 1024),
                        'parse_mode' => 'HTML',
                    ]);

            if ($response->successful()) {
                return true;
            }

            Log::warning('telegram.chat.refused', [
                'tenant' => $tenantId,
                'chat' => $chatId,
                'status' => $response->status(),
                'body' => $response->json('description'),
            ]);
        } catch (Throwable $exception) {
            Log::warning('telegram.chat.failed', [
                'tenant' => $tenantId,
                'chat' => $chatId,
                'error' => $exception->getMessage(),
            ]);
        }

        return false;
    }

    /**
     * The chat this restaurant already hears from.
     *
     * The first enabled notification rule's chat, which is the same id the
     * settings screen writes for all six of its switches: a restaurant points
     * one group at the platform and everything goes there. Reports included —
     * a manual export sent "to Telegram" means that group, and any other answer
     * would be a file delivered to a chat nobody is reading.
     *
     * `withoutGlobalScopes` and an explicit `$tenantId` for the reason
     * `tokenFor()` gives below: the console command that also reaches this runs
     * with no tenant in context, and the scope would answer nothing at all.
     */
    public function defaultChat(int $tenantId): ?string
    {
        /** @var NotificationRule|null $rule */
        $rule = NotificationRule::query()
            ->withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('enabled', true)
            ->orderBy('id')
            ->first();

        return $rule?->chat_id;
    }

    /**
     * Which bot speaks for this restaurant.
     *
     * Its first enabled bot with a token, same fallback as the event notifier
     * uses when a rule names none: a restaurant with one bot should not have to
     * name it on every schedule.
     *
     * `withoutGlobalScope` is deliberate and is why `$tenantId` is a parameter
     * rather than read from the context. The caller is a console command
     * looping over every restaurant on the platform, so there is no tenant in
     * context and the scope would answer nothing at all.
     */
    private function tokenFor(int $tenantId): ?string
    {
        /** @var Bot|null $bot */
        $bot = Bot::query()
            ->withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('enabled', true)
            ->whereNotNull('encrypted_token')
            ->orderBy('id')
            ->first();

        return $bot?->token;
    }
}

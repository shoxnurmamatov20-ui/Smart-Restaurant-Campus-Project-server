<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Services;

use App\Support\Events\ReceivedEvent;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\NotificationRule;
use Throwable;

/**
 * The one place a restaurant's own chat is actually written to.
 *
 * Everything upstream of this — the rules table, the console panel, the event
 * subscriptions — is about deciding *whether* to say something. This says it,
 * and it is deliberately the only thing in the module that talks to
 * api.telegram.org, so the fifty bots and this share one failure mode instead
 * of two.
 *
 * **A failed send never fails the thing that caused it.** A void is recorded,
 * a shift is closed, an order is placed — and then somebody is told. Letting a
 * timeout to Telegram roll back a bill would be a restaurant unable to trade
 * because a chat app was down.
 */
final class TelegramNotifier
{
    private const API = 'https://api.telegram.org';

    /** Telegram is not on the critical path; four seconds and give up. */
    private const TIMEOUT = 4;

    /**
     * Tell every chat this restaurant has subscribed to that event.
     *
     * @return int how many messages went out
     */
    public function dispatch(ReceivedEvent $event): int
    {
        $rules = NotificationRule::query()
            ->where('event', $event->name)
            ->where('enabled', true)
            ->where('tenant_id', $event->tenantId)
            ->get();

        $amount = $this->amountOf($event->payload);
        $sent = 0;

        foreach ($rules as $rule) {
            // A rule scoped to a venue hears about that venue only. A rule with
            // no branch hears everything, which is what an owner's chat wants.
            $branch = $event->payload['branch_id'] ?? null;

            if ($rule->branch_id !== null && $branch !== null && (int) $branch !== (int) $rule->branch_id) {
                continue;
            }

            if (! $rule->wants($amount)) {
                continue;
            }

            if ($this->send($rule, $this->phrase($event, $rule->locale))) {
                $rule->forceFill(['last_sent_at' => now()])->save();
                $sent++;
            }
        }

        return $sent;
    }

    /**
     * Push one message at one chat.
     *
     * Returns false rather than throwing, for the reason in the class note: the
     * caller is a listener hanging off a sale, and an exception here would
     * surface as a till that could not take money.
     */
    public function send(NotificationRule $rule, string $text): bool
    {
        $token = $this->tokenFor($rule);

        if ($token === null) {
            Log::warning('telegram.notify.no_token', ['rule' => $rule->id]);

            return false;
        }

        try {
            $response = Http::timeout(self::TIMEOUT)
                ->asJson()
                ->post(self::API."/bot{$token}/sendMessage", [
                    'chat_id' => $rule->chat_id,
                    'text' => $text,
                    // Telegram's own markup, and the reason every value below
                    // is escaped before it reaches the string.
                    'parse_mode' => 'HTML',
                    'disable_web_page_preview' => true,
                ]);

            if ($response->successful()) {
                return true;
            }

            Log::warning('telegram.notify.refused', [
                'rule' => $rule->id,
                'status' => $response->status(),
                'body' => $response->json('description'),
            ]);
        } catch (Throwable $exception) {
            Log::warning('telegram.notify.failed', [
                'rule' => $rule->id,
                'error' => $exception->getMessage(),
            ]);
        }

        return false;
    }

    /**
     * Ask Telegram who this bot is.
     *
     * The only honest check of a token: it is a string until Telegram says it
     * belongs to something. Returns the handle so the console can show WHICH
     * bot answered — a restaurant that pasted the wrong token gets a working
     * green tick and a bot nobody in their group has ever seen, which is the
     * failure this is meant to catch.
     *
     * @return array{ok: bool, handle: string|null}
     */
    public function identify(Bot $bot): array
    {
        $token = $bot->token;

        if ($token === null) {
            return ['ok' => false, 'handle' => null];
        }

        try {
            $response = Http::timeout(self::TIMEOUT)->get(self::API."/bot{$token}/getMe");

            if ($response->successful()) {
                return ['ok' => true, 'handle' => $response->json('result.username')];
            }
        } catch (Throwable $exception) {
            Log::warning('telegram.identify.failed', ['bot' => $bot->id, 'error' => $exception->getMessage()]);
        }

        return ['ok' => false, 'handle' => null];
    }

    /**
     * Which bot speaks for this rule.
     *
     * The rule's own bot, or the restaurant's first enabled one. Falling back
     * rather than refusing: a restaurant that has one bot should not have to
     * name it on every rule.
     */
    private function tokenFor(NotificationRule $rule): ?string
    {
        $bot = $rule->bot ?? Bot::query()
            ->where('enabled', true)
            ->whereNotNull('encrypted_token')
            ->orderBy('id')
            ->first();

        return $bot?->token;
    }

    /**
     * What the chat actually reads.
     *
     * Phrased here rather than in the publishing module, because the publisher
     * must not know Telegram exists — that is the whole point of the event bus.
     * Every interpolated value goes through `e()`: a dish called
     * `<b>Osh</b>` would otherwise arrive as bold text, and a guest name with a
     * stray `<` would make Telegram reject the whole message.
     */
    private function phrase(ReceivedEvent $event, string $locale): string
    {
        $payload = $event->payload;
        $money = $this->amountOf($payload);
        $sum = $money === null ? null : number_format($money / 100, 0, '.', ' ').' so\'m';

        $line = match ($event->name) {
            'orders.placed' => __('telegrambots::notify.order_placed', [
                'number' => (string) ($payload['number'] ?? $payload['order_id'] ?? '—'),
                'channel' => (string) ($payload['channel'] ?? '—'),
            ], $locale),
            'orders.paid' => __('telegrambots::notify.order_paid', [
                'number' => (string) ($payload['number'] ?? $payload['order_id'] ?? '—'),
                'amount' => $sum ?? '—',
            ], $locale),
            'pos.approval_requested' => __('telegrambots::notify.approval', [
                'kind' => (string) ($payload['kind'] ?? '—'),
                'amount' => $sum ?? '—',
            ], $locale),
            'pos.bill_voided' => __('telegrambots::notify.void', ['amount' => $sum ?? '—'], $locale),
            'finance.shift_closed' => __('telegrambots::notify.shift_closed', [
                'amount' => $sum ?? '—',
            ], $locale),
            default => $event->name,
        };

        return e($line);
    }

    /**
     * The money in a payload, whatever the publisher called it.
     *
     * Three modules publish an amount under three names — a threshold that only
     * understood one of them would silently pass every event from the other two.
     *
     * @param array<string, mixed> $payload
     */
    private function amountOf(array $payload): ?int
    {
        foreach (['amount_tiyin', 'total_tiyin', 'grand_total_tiyin', 'cash_tiyin'] as $key) {
            if (isset($payload[$key]) && is_numeric($payload[$key])) {
                return (int) $payload[$key];
            }
        }

        return null;
    }
}

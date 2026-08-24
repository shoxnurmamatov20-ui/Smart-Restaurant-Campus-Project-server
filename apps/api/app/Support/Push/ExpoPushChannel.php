<?php

declare(strict_types=1);

namespace App\Support\Push;

use App\Models\PushToken;
use Illuminate\Notifications\Notification;

/**
 * A Laravel notification channel, so a notification class says `'expo'` in
 * `via()` and implements `toExpo()` — the same shape as `toMail()`.
 *
 * @phpstan-type ExpoPayload array{title: string, body: string, data?: array<string, mixed>, surface?: string}
 */
final class ExpoPushChannel
{
    public function __construct(private readonly ExpoPush $push) {}

    public function send(object $notifiable, Notification $notification): void
    {
        if (! method_exists($notification, 'toExpo')) {
            return;
        }

        /** @var ExpoPayload $payload */
        $payload = $notification->toExpo($notifiable);

        if (! method_exists($notifiable, 'getKey')) {
            return;
        }

        $tokens = PushToken::query()
            ->where('user_id', $notifiable->getKey())
            ->when(isset($payload['surface']), fn ($query) => $query->where('surface', $payload['surface']))
            ->get();

        $this->push->send($tokens, $payload['title'], $payload['body'], $payload['data'] ?? []);
    }
}

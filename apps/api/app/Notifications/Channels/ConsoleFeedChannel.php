<?php

declare(strict_types=1);

namespace App\Notifications\Channels;

use App\Support\Tenancy\TenantContext;
use Illuminate\Notifications\Channels\DatabaseChannel;
use Illuminate\Notifications\Notification;

/**
 * Laravel's `database` channel, taught the four things this platform needs.
 *
 * The framework's channel writes exactly `id`, `type`, `data` and `read_at`,
 * which is everything a single-tenant blog needs and not enough to insert one
 * row here: `public.notifications` is behind row-level security, so a row with
 * no `tenant_id` is refused by PostgreSQL rather than written and lost. The
 * failure would have been the worst kind — a notification that raised no error
 * anywhere and simply never appeared.
 *
 * So `tenant_id`, `branch_id`, `key` and `level` are lifted out of the
 * notification's own payload into columns, where the tray's WHERE and ORDER BY
 * can reach them. See the migration for why those four and not others.
 *
 * Bound over `DatabaseChannel::class` in NotificationFeedServiceProvider rather
 * than registered as a channel of its own. `ChannelManager` resolves the
 * `database` driver out of the container, so binding is enough — and it means
 * a notification says `'database'` in its `via()` like every Laravel example
 * ever written, instead of a private word only this codebase knows.
 *
 * The payload is left whole. The columns are an index over what the
 * notification said, not a replacement for it, and a consumer that is not the
 * console still reads `data` exactly as the notification wrote it.
 */
final class ConsoleFeedChannel extends DatabaseChannel
{
    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * @param  mixed  $notifiable
     * @return array<string, mixed>
     */
    protected function buildPayload($notifiable, Notification $notification): array
    {
        /** @var array<string, mixed> $payload */
        $payload = parent::buildPayload($notifiable, $notification);

        /** @var array<string, mixed> $data */
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

        return $payload + [
            /*
             * The recipient's restaurant, not the request's.
             *
             * They are the same on every path that exists today, and taking it
             * from the person is what keeps them the same: a relay draining the
             * outbox from cron has whatever tenant the event named, and a row
             * stamped with that one but addressed to somebody else's user is a
             * row its owner cannot see and its neighbour can.
             */
            'tenant_id' => $this->tenantOf($notifiable),
            /*
             * Null is not "unknown" — it is the whole business. A monthly P&L
             * happens at no venue, and the tray draws it as the head office.
             */
            'branch_id' => self::integerOrNull($data['branch_id'] ?? null),
            'key' => self::text($data['key'] ?? null),
            'level' => self::level($data['level'] ?? null),
        ];
    }

    private function tenantOf(mixed $notifiable): ?int
    {
        $own = is_object($notifiable) && property_exists($notifiable, 'tenant_id')
            ? $notifiable->tenant_id
            : null;

        return self::integerOrNull($own) ?? $this->tenants->id();
    }

    /**
     * Anything the console has no colour for is drawn as a fact.
     *
     * Falling back to `low` rather than refusing the write: a notification with
     * a typo in its level is still a notification somebody needs, and painting
     * it brand instead of red is a smaller mistake than dropping it. The three
     * words are the design's own — see `shell-data.ts`.
     */
    private static function level(mixed $value): string
    {
        return in_array($value, ['high', 'mid', 'low'], true) ? $value : 'low';
    }

    private static function text(mixed $value): string
    {
        return is_string($value) ? mb_substr($value, 0, 48) : '';
    }

    private static function integerOrNull(mixed $value): ?int
    {
        return is_int($value) || (is_string($value) && ctype_digit($value)) ? (int) $value : null;
    }
}

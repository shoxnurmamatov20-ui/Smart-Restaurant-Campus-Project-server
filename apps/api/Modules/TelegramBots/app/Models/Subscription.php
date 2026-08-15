<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A guest or staff member opting into one kind of Telegram notification.
 *
 * Tenant-scoped like everything else: a broadcast to "everyone subscribed to
 * orders.ready" must reach this restaurant's people and nobody else's.
 *
 * @property int $id
 * @property int $bot_user_id
 * @property string $channel e.g. "orders.ready", "orders.delayed"
 * @property bool $enabled
 * @property array<array-key, mixed>|null $settings
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int|null $tenant_id
 * @property-read BotUser $botUser
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Subscription forChannel(string $channel)
 * @method static Builder<static>|Subscription newModelQuery()
 * @method static Builder<static>|Subscription newQuery()
 * @method static Builder<static>|Subscription query()
 * @method static Builder<static>|Subscription whereBotUserId($value)
 * @method static Builder<static>|Subscription whereChannel($value)
 * @method static Builder<static>|Subscription whereCreatedAt($value)
 * @method static Builder<static>|Subscription whereEnabled($value)
 * @method static Builder<static>|Subscription whereId($value)
 * @method static Builder<static>|Subscription whereSettings($value)
 * @method static Builder<static>|Subscription whereTenantId($value)
 * @method static Builder<static>|Subscription whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class Subscription extends Model
{
    use BelongsToTenant;

    protected $table = 'telegram.tg_subscriptions';

    protected $fillable = ['tenant_id', 'bot_user_id', 'channel', 'enabled', 'settings'];

    protected $casts = [
        'settings' => 'array',
        'enabled' => 'bool',
    ];

    public function botUser(): BelongsTo
    {
        return $this->belongsTo(BotUser::class);
    }

    /** Everyone this restaurant may send a given kind of message to. */
    public function scopeForChannel(Builder $query, string $channel): Builder
    {
        return $query->where('channel', $channel)->where('enabled', true);
    }
}

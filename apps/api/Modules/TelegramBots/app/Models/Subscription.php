<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A guest or staff member opting into one kind of Telegram notification.
 *
 * Tenant-scoped like everything else: a broadcast to "everyone subscribed to
 * orders.ready" must reach this restaurant's people and nobody else's.
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

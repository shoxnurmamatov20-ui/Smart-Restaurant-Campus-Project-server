<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $bot_id
 * @property int|null $user_id
 * @property int $telegram_id Telegram user id
 * @property string|null $telegram_username
 * @property string|null $phone
 * @property string|null $full_name
 * @property string $locale
 * @property bool $blocked_bot True if user blocked the bot
 * @property array<array-key, mixed>|null $preferences
 * @property Carbon|null $linked_at
 * @property Carbon|null $last_seen_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int|null $tenant_id
 * @property-read Bot|null $bot
 * @property-read Collection<int, Subscription> $subscriptions
 * @property-read int|null $subscriptions_count
 * @property-read Tenant|null $tenant
 * @property-read User|null $user
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser query()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereBlockedBot($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereBotId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereCreatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereFullName($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereLastSeenAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereLinkedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereLocale($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser wherePhone($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser wherePreferences($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereTelegramId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereTelegramUsername($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereTenantId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereUpdatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|BotUser whereUserId($value)
 *
 * @mixin \Eloquent
 */
final class BotUser extends Model
{
    use BelongsToTenant;

    protected $table = 'telegram.tg_bot_users';

    protected $fillable = [
        'tenant_id',
        'bot_id',
        'user_id',
        'telegram_id',
        'telegram_username',
        'phone',
        'full_name',
        'locale',
        'blocked_bot',
        'preferences',
        'linked_at',
        'last_seen_at',
    ];

    protected $casts = [
        'preferences' => 'array',
        'blocked_bot' => 'bool',
        'linked_at' => 'datetime',
        'last_seen_at' => 'datetime',
    ];

    public function bot(): BelongsTo
    {
        return $this->belongsTo(Bot::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}

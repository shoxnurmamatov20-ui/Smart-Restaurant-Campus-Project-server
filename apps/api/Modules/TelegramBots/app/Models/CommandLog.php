<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $bot_id
 * @property int $telegram_id
 * @property int|null $user_id
 * @property string $command
 * @property string $chat_type
 * @property int $latency_ms
 * @property bool $ok
 * @property string|null $error
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int|null $tenant_id
 * @property-read Bot|null $bot
 * @property-read Tenant|null $tenant
 * @property-read User|null $user
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog query()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereBotId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereChatType($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereCommand($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereCreatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereError($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereLatencyMs($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereOk($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereTelegramId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereTenantId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereUpdatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|CommandLog whereUserId($value)
 *
 * @mixin \Eloquent
 */
final class CommandLog extends Model
{
    use BelongsToTenant;

    protected $table = 'telegram.tg_command_logs';

    protected $fillable = [
        'tenant_id',
        'bot_id',
        'telegram_id',
        'user_id',
        'command',
        'chat_type',
        'latency_ms',
        'ok',
        'error',
    ];

    protected $casts = [
        'ok' => 'bool',
        'latency_ms' => 'int',
    ];

    public function bot(): BelongsTo
    {
        return $this->belongsTo(Bot::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

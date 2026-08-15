<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $bot_id
 * @property int|null $bot_user_id
 * @property int $telegram_chat_id
 * @property int|null $telegram_message_id
 * @property string $text
 * @property string|null $channel e.g. "orders.ready"
 * @property string $status queued|sent|failed
 * @property string|null $error
 * @property array<array-key, mixed>|null $payload
 * @property Carbon|null $sent_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int|null $tenant_id
 * @property-read Bot|null $bot
 * @property-read BotUser|null $botUser
 * @property-read Tenant|null $tenant
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message query()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereBotId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereBotUserId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereChannel($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereCreatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereError($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message wherePayload($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereSentAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereStatus($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereTelegramChatId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereTelegramMessageId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereTenantId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereText($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Message whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class Message extends Model
{
    use BelongsToTenant;

    protected $table = 'telegram.tg_messages';

    protected $fillable = [
        'tenant_id',
        'bot_id',
        'bot_user_id',
        'telegram_chat_id',
        'telegram_message_id',
        'text',
        'channel',
        'status',
        'error',
        'payload',
        'sent_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'sent_at' => 'datetime',
    ];

    public function bot(): BelongsTo
    {
        return $this->belongsTo(Bot::class);
    }

    public function botUser(): BelongsTo
    {
        return $this->belongsTo(BotUser::class);
    }
}

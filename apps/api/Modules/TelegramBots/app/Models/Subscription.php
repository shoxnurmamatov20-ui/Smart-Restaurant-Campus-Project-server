<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class Subscription extends Model
{
    protected $table = 'tg_subscriptions';

    protected $fillable = ['bot_user_id', 'channel', 'enabled', 'settings'];

    protected $casts = [
        'settings' => 'array',
        'enabled' => 'bool',
    ];

    public function botUser(): BelongsTo
    {
        return $this->belongsTo(BotUser::class);
    }
}

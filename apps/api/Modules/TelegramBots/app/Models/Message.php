<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class Message extends Model
{
    protected $table = 'tg_messages';

    protected $fillable = [
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

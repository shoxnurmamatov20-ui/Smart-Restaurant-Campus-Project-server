<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class CommandLog extends Model
{
    protected $table = 'tg_command_logs';

    protected $fillable = [
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

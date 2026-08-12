<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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

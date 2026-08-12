<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Crypt;

final class Bot extends Model
{
    use BelongsToTenant;
    use SoftDeletes;

    protected $table = 'telegram.tg_bots';

    protected $fillable = [
        'tenant_id',
        'key',
        'telegram_username',
        'name_uz',
        'name_ru',
        'name_en',
        'purpose',
        'audience',
        'module',
        'phase',
        'commands',
        'enabled',
        'requires_phone',
        'requires_login',
        'encrypted_token',
        'webhook_secret',
        'last_synced_at',
        'metadata',
    ];

    protected $hidden = [
        'encrypted_token',
        'webhook_secret',
    ];

    protected $casts = [
        'commands' => 'array',
        'metadata' => 'array',
        'enabled' => 'bool',
        'requires_phone' => 'bool',
        'requires_login' => 'bool',
        'last_synced_at' => 'datetime',
    ];

    public function botUsers(): HasMany
    {
        return $this->hasMany(BotUser::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function commandLogs(): HasMany
    {
        return $this->hasMany(CommandLog::class);
    }

    /**
     * Transparent encryption of bot token. Use $bot->token to get/set plaintext;
     * stored as encrypted_token in the DB via APP_KEY.
     */
    protected function token(): Attribute
    {
        return Attribute::make(
            get: fn (mixed $_value, array $attrs): ?string => isset($attrs['encrypted_token']) && $attrs['encrypted_token']
                ? Crypt::decryptString($attrs['encrypted_token'])
                : null,
            set: fn (?string $value): array => ['encrypted_token' => $value ? Crypt::encryptString($value) : null],
        );
    }
}

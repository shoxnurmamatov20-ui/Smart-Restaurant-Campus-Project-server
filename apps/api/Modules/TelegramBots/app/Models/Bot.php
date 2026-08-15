<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;

/**
 * @property int $id
 * @property string $key matches registry key, e.g. "guest"
 * @property string|null $telegram_username @OshMarkaziGuestBot
 * @property string $name_uz
 * @property string $name_ru
 * @property string $name_en
 * @property string $purpose
 * @property string $audience
 * @property string|null $module
 * @property string $phase
 * @property array<array-key, mixed>|null $commands
 * @property bool $enabled
 * @property bool $requires_phone
 * @property bool $requires_login
 * @property string|null $encrypted_token Bot token, encrypted via APP_KEY
 * @property string|null $webhook_secret
 * @property Carbon|null $last_synced_at
 * @property array<array-key, mixed>|null $metadata
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $tenant_id
 * @property-read Collection<int, BotUser> $botUsers
 * @property-read int|null $bot_users_count
 * @property-read Collection<int, CommandLog> $commandLogs
 * @property-read int|null $command_logs_count
 * @property-read Collection<int, Message> $messages
 * @property-read int|null $messages_count
 * @property-read Tenant|null $tenant
 * @property string|null $token
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot onlyTrashed()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot query()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereAudience($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereCommands($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereCreatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereDeletedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereEnabled($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereEncryptedToken($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereKey($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereLastSyncedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereMetadata($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereModule($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereNameEn($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereNameRu($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereNameUz($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot wherePhase($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot wherePurpose($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereRequiresLogin($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereRequiresPhone($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereTelegramUsername($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereTenantId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereUpdatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot whereWebhookSecret($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot withTrashed(bool $withTrashed = true)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Bot withoutTrashed()
 *
 * @mixin \Eloquent
 */
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

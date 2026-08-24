<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One phone a person can be reached on.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $user_id
 * @property string|null $notifiable_type
 * @property int|null $notifiable_id
 * @property string $token
 * @property string $platform
 * @property string $surface
 * @property string|null $device_name
 * @property string $locale
 * @property Carbon|null $last_seen_at
 * @property Carbon|null $invalidated_at
 */
final class PushToken extends Model
{
    use BelongsToTenant;
    use HasFactory;

    protected $table = 'public.push_tokens';

    protected $fillable = [
        'tenant_id', 'user_id', 'token', 'platform', 'surface', 'device_name', 'locale', 'last_seen_at',
        'notifiable_type', 'notifiable_id',
    ];

    /**
     * Who the phone belongs to, in three short words.
     *
     * Not class names. A column full of `Modules\Marketplace\Models\Consumer`
     * has to be rewritten the day a class moves, and there is deliberately no
     * `morphTo()` here: nothing turns one of these rows back into a model — the
     * senders go the other way, from a person already in hand to their devices.
     */
    public const OF_USER = 'user';

    /** A restaurant's own guest — `crm.customers`, inside one tenant. */
    public const OF_CUSTOMER = 'customer';

    /** A MyPOS shopper — `marketplace.consumers`, belonging to no restaurant. */
    public const OF_CONSUMER = 'consumer';

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'invalidated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Every live device one person can be reached on.
     *
     * `withoutGlobalScopes()` on purpose. A guest's row carries no `tenant_id`
     * — a MyPOS consumer belongs to the platform rather than to a restaurant —
     * so the `BelongsToTenant` scope would filter out exactly the rows this is
     * for. What replaces it is the pair below: a type and an id together
     * identify one person, and neither is taken from a URL by any caller.
     *
     * @return Builder<PushToken>
     */
    public static function reaching(string $type, int $id): Builder
    {
        return self::query()
            ->withoutGlobalScopes()
            ->where('notifiable_type', $type)
            ->where('notifiable_id', $id)
            ->whereNull('invalidated_at');
    }

    /** Expo issues tokens in exactly this shape; anything else is not one. */
    public static function looksLikeExpoToken(string $token): bool
    {
        return (bool) preg_match('/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/', $token);
    }
}

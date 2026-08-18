<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Pos\Database\Factories\PosPinFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A four-digit secret, and the lockout that makes it defensible.
 *
 * The PIN is not a password and is not trying to be. Its job is to answer "who
 * is standing here" in under a second, twenty times an hour, on a shared tablet
 * — a job a password cannot do, because nobody types one that often and the
 * ones they would type are worse than four digits.
 *
 * What makes it acceptable is that guessing is bounded: five wrong tries locks
 * the person out for fifteen minutes, so ten thousand combinations take weeks
 * rather than seconds. The hash is bcrypt via Hash::make; the plain digits never
 * exist outside a single request.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $user_id
 * @property string $pin_hash
 * @property int $failed_attempts
 * @property Carbon|null $locked_until
 * @property Carbon|null $last_used_at
 * @property Carbon|null $rotated_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read bool $is_locked
 * @property-read Tenant|null $tenant
 * @property-read User $user
 *
 * @method static \Modules\Pos\Database\Factories\PosPinFactory factory($count = null, $state = [])
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin query()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereCreatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereFailedAttempts($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereLastUsedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereLockedUntil($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin wherePinHash($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereRotatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereTenantId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereUpdatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|PosPin whereUserId($value)
 *
 * @mixin \Eloquent
 */
final class PosPin extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PosPinFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'pos.pins';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'pin_hash',
        'failed_attempts',
        'locked_until',
        'last_used_at',
        'rotated_at',
    ];

    /** @var array<int, string> */
    protected $hidden = ['pin_hash'];

    protected function casts(): array
    {
        return [
            'failed_attempts' => 'integer',
            'locked_until' => 'datetime',
            'last_used_at' => 'datetime',
            'rotated_at' => 'datetime',
        ];
    }

    protected static function newFactory(): PosPinFactory
    {
        return PosPinFactory::new();
    }

    // ============ Relationships ============

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ============ Accessors ============

    protected function isLocked(): Attribute
    {
        return Attribute::get(fn (): bool => $this->locked_until !== null
            && $this->locked_until->isFuture());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // Never the hash. An audit trail that records the secret is a second
            // copy of the secret.
            ->logOnly(['tenant_id', 'user_id', 'failed_attempts', 'locked_until', 'rotated_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('pos.pin');
    }
}

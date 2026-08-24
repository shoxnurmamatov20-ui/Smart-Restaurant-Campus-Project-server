<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Database\Factories\UserPinFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A person's four-digit secret, and the lockout that makes it defensible.
 *
 * The PIN is not a password and is not trying to be. Its job is to answer "who
 * is standing here" in under a second, twenty times an hour — a job a password
 * cannot do, because nobody types one that often and the ones they would type
 * are worse than four digits.
 *
 * What makes it acceptable is that guessing is bounded: five wrong tries locks
 * the person out for fifteen minutes, so ten thousand combinations take weeks
 * rather than seconds. The hash is bcrypt via `Hash::make`; the plain digits
 * never exist outside a single request.
 *
 * ---------------------------------------------------------------------------
 * Core, and not the till's
 *
 * This lived in `pos.pins` because the till was the first thing to ask for a
 * PIN. It is core now because it is the second thing that settles the argument:
 * the staff app asks a waiter for the same four digits on their own phone, and
 * **the lockout has to be shared**. Two counters mean ten guesses instead of
 * five, and a phone is the surface an attacker can walk away with.
 *
 * One PIN per person per restaurant, which the unique key enforces. Enrolling
 * somebody is exactly the act of giving them one.
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
 * @property-read bool $is_locked
 * @property-read Tenant|null $tenant
 * @property-read User $user
 *
 * @method static \Database\Factories\UserPinFactory factory($count = null, $state = [])
 * @method static \Illuminate\Database\Eloquent\Builder<static>|UserPin newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|UserPin newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|UserPin query()
 *
 * @mixin \Eloquent
 */
final class UserPin extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<UserPinFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'public.user_pins';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'pin_hash',
        'failed_attempts',
        'locked_until',
        'last_used_at',
        'rotated_at',
    ];

    /** @var list<string> */
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

    protected static function newFactory(): UserPinFactory
    {
        return UserPinFactory::new();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function isLocked(): Attribute
    {
        return Attribute::get(fn (): bool => $this->locked_until !== null
            && $this->locked_until->isFuture());
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // Never the hash. An audit trail that records the secret is a second
            // copy of the secret.
            ->logOnly(['tenant_id', 'user_id', 'failed_attempts', 'locked_until', 'rotated_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('auth.pin');
    }
}

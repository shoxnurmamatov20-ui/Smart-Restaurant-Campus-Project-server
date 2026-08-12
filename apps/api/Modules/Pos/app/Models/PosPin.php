<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
 * @method static PosPinFactory factory(int $count = null, array $state = [])
 */
final class PosPin extends Model
{
    /** @use HasFactory<PosPinFactory> */
    use BelongsToTenant;

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

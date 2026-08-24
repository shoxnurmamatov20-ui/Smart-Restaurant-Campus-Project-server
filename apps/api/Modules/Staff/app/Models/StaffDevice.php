<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;
use Modules\Staff\Database\Factories\StaffDeviceFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A phone that has been told whose it is.
 *
 * The staff app signs in with four digits, and four digits only mean anything
 * once something else has said who is typing them. A till answers that with a
 * roster on screen; a personal phone answers it with this row — see the
 * migration for why enrolling against a branch instead does not survive
 * arithmetic.
 *
 * It authenticates as itself, exactly as a `Terminal` does: the device token's
 * tokenable is this model, so `Auth::user()` on a staff-app request is a device
 * rather than a person. `App\Support\Auth\ActingPerson` is the reason that is
 * safe to have in the system twice — it refuses to hand a device id to a column
 * that means "person".
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $user_id
 * @property string|null $branch_code
 * @property string $label
 * @property string|null $pairing_code_hash
 * @property Carbon|null $pairing_expires_at
 * @property Carbon|null $paired_at
 * @property string|null $device_fingerprint
 * @property string|null $app_version
 * @property Carbon|null $last_seen_at
 * @property string $status
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read bool $is_paired
 * @property-read Tenant|null $tenant
 * @property-read User $user
 *
 * @method static \Modules\Staff\Database\Factories\StaffDeviceFactory factory($count = null, $state = [])
 * @method static Builder<static>|StaffDevice newModelQuery()
 * @method static Builder<static>|StaffDevice newQuery()
 * @method static Builder<static>|StaffDevice query()
 *
 * @mixin \Eloquent
 */
final class StaffDevice extends Model implements AuthenticatableContract
{
    /**
     * A device is a principal, and the framework has to be told so.
     *
     * Not because a phone logs in with a password — it never does — but because
     * everything downstream of `auth:sanctum` assumes the resolved user answers
     * `getAuthIdentifier()`. The rate limiter finds out first: `ThrottleRequests`
     * builds its key from that method, so without this the PIN route dies with a
     * `BadMethodCallException` before the controller is reached. Measured rather
     * than anticipated — sixteen sign-in tests failed on it.
     *
     * `Modules\Pos\Models\Terminal` carries the same pair for the same reason.
     */
    use Authenticatable;

    use BelongsToTenant;
    use HasApiTokens;

    /** @use HasFactory<StaffDeviceFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'staff.devices';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'branch_code',
        'label',
        'pairing_code_hash',
        'pairing_expires_at',
        'paired_at',
        'device_fingerprint',
        'app_version',
        'last_seen_at',
        'status',
    ];

    /** @var list<string> */
    protected $hidden = ['pairing_code_hash'];

    protected function casts(): array
    {
        return [
            'pairing_expires_at' => 'datetime',
            'paired_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }

    protected static function newFactory(): StaffDeviceFactory
    {
        return StaffDeviceFactory::new();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @param Builder<static> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('status', 'active');
    }

    /** Has this phone finished enrolling, or is it still holding a code? */
    protected function isPaired(): Attribute
    {
        return Attribute::get(fn (): bool => $this->paired_at !== null);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // Never the code hash: for the ten minutes it lives it is a bearer
            // credential, and an audit trail holding one is a second copy of it.
            ->logOnly(['tenant_id', 'user_id', 'branch_code', 'label', 'status', 'paired_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.device');
    }
}

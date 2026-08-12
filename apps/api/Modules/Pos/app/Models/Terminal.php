<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\HasApiTokens;
use Modules\Pos\Database\Factories\TerminalFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One till, as a device the platform knows by name.
 *
 * A terminal authenticates as itself, not as whoever happens to be standing at
 * it: the device holds a long-lived Sanctum token issued once at pairing, and
 * the person on top of that is a PIN session that changes twenty times an hour.
 * Separating the two is what lets a shift change take one second, and what lets
 * a stolen tablet be revoked without touching anybody's password.
 *
 * `mode` is the other half of the design. A restaurant, a bar and a fast-food
 * counter are not three products — they are three orders of the same steps, and
 * the terminal says which one it is running.
 *
 * @method static TerminalFactory factory(int $count = null, array $state = [])
 */
final class Terminal extends Model implements AuthenticatableContract
{
    /**
     * A terminal is a first-class principal, not a row that happens to hold a
     * token: it passes through `auth:sanctum`, and everything downstream of that
     * — the rate limiter keying on the caller, the audit trail naming who acted
     * — asks an authenticated request for an identifier. Without this it throws
     * on the first throttled route, which is exactly where the till lives.
     *
     * There is no password and no remember token; nothing ever authenticates a
     * terminal by those, only by the token issued at pairing.
     */
    use Authenticatable;

    use BelongsToBranch;
    use BelongsToTenant;
    use HasApiTokens;

    /** @use HasFactory<TerminalFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'pos.terminals';

    public const MODES = ['table_service', 'quick_service', 'bar', 'counter'];

    public const STATUSES = ['active', 'disabled', 'maintenance'];

    /** A terminal that has not checked in for this long is treated as offline. */
    public const OFFLINE_AFTER_SECONDS = 120;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'code',
        'name',
        'mode',
        'status',
        'pos_layout_id',
        'settings',
    ];

    /**
     * The pairing hash is the one field that must never leave the server, and
     * `$hidden` is cheaper insurance than remembering to omit it in each of the
     * places a terminal gets serialised.
     *
     * @var array<int, string>
     */
    protected $hidden = ['pairing_code_hash'];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'pairing_expires_at' => 'datetime',
            'paired_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'branch_id' => 'integer',
            'pos_layout_id' => 'integer',
        ];
    }

    protected static function newFactory(): TerminalFactory
    {
        return TerminalFactory::new();
    }

    // ============ Accessors ============

    protected function isPaired(): Attribute
    {
        return Attribute::get(fn (): bool => $this->paired_at !== null);
    }

    protected function isOnline(): Attribute
    {
        return Attribute::get(fn (): bool => $this->last_seen_at !== null
            && $this->last_seen_at->diffInSeconds(now()) < self::OFFLINE_AFTER_SECONDS);
    }

    // ============ Domain behaviour ============

    /**
     * The largest discount, in percent, this role may apply here without a
     * manager's authorisation.
     *
     * Kept per terminal rather than per role globally, because the answer is
     * genuinely different at a hotel bar and at a takeaway counter.
     */
    public function discountLimitFor(string $role): int
    {
        $limits = $this->settings['discount_limits'] ?? [];

        return (int) ($limits[$role] ?? 0);
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeInMode(Builder $query, string $mode): Builder
    {
        return $query->where('mode', $mode);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // Never `paired_at` alone: pairing writes a token, and the token
            // event is what the audit trail should show, not the timestamp.
            ->logOnly(['tenant_id', 'branch_id', 'code', 'name', 'mode', 'status', 'settings'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('pos.terminal');
    }
}

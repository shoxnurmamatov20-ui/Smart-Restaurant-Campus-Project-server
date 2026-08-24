<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Support\Finance\CashRounding;
use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;
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
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id Filial id — no FK: branches are not owned by Pos
 * @property string $code Kassa kodi, restoran ichida yagona: KASSA-1
 * @property string $name
 * @property string $mode table_service|quick_service|bar|counter
 * @property string $status active|disabled|maintenance
 * @property string|null $pairing_code_hash sha256 of the one-time code — never the code itself
 * @property Carbon|null $pairing_expires_at
 * @property Carbon|null $paired_at
 * @property string|null $device_fingerprint
 * @property string|null $app_version
 * @property Carbon|null $last_seen_at
 * @property int|null $pos_layout_id Tez tugmalar maketi — pos.layouts, set in a later migration
 * @property array<array-key, mixed>|null $settings printer routing, drawer, fiscal serial, rounding, per-role discount limits
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read bool $is_online
 * @property-read bool $is_paired
 * @property-read Tenant|null $tenant
 * @property-read Collection<int, PersonalAccessToken> $tokens
 * @property-read int|null $tokens_count
 *
 * @method static Builder<static>|Terminal active()
 * @method static \Modules\Pos\Database\Factories\TerminalFactory factory($count = null, $state = [])
 * @method static Builder<static>|Terminal inMode(string $mode)
 * @method static Builder<static>|Terminal newModelQuery()
 * @method static Builder<static>|Terminal newQuery()
 * @method static Builder<static>|Terminal onlyTrashed()
 * @method static Builder<static>|Terminal query()
 * @method static Builder<static>|Terminal whereAppVersion($value)
 * @method static Builder<static>|Terminal whereBranchId($value)
 * @method static Builder<static>|Terminal whereCode($value)
 * @method static Builder<static>|Terminal whereCreatedAt($value)
 * @method static Builder<static>|Terminal whereDeletedAt($value)
 * @method static Builder<static>|Terminal whereDeviceFingerprint($value)
 * @method static Builder<static>|Terminal whereId($value)
 * @method static Builder<static>|Terminal whereLastSeenAt($value)
 * @method static Builder<static>|Terminal whereMode($value)
 * @method static Builder<static>|Terminal whereName($value)
 * @method static Builder<static>|Terminal wherePairedAt($value)
 * @method static Builder<static>|Terminal wherePairingCodeHash($value)
 * @method static Builder<static>|Terminal wherePairingExpiresAt($value)
 * @method static Builder<static>|Terminal wherePosLayoutId($value)
 * @method static Builder<static>|Terminal whereSettings($value)
 * @method static Builder<static>|Terminal whereStatus($value)
 * @method static Builder<static>|Terminal whereTenantId($value)
 * @method static Builder<static>|Terminal whereUpdatedAt($value)
 * @method static Builder<static>|Terminal withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Terminal withoutTrashed()
 *
 * @mixin \Eloquent
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

    /**
     * What the till shows all day when nobody is signed in.
     *
     * Three, and they are not degrees of the same thing: `minimal` is a clock
     * on a screen a guest can see from the queue, `status` is the room's two
     * counts for whoever is working, `brand` is the restaurant's own picture.
     * Which one is right depends on where the screen points, which is why it is
     * a setting rather than a preference.
     */
    public const IDLE_MODES = ['minimal', 'status', 'brand'];

    public const IDLE_BACKGROUNDS = ['night', 'ink', 'warm', 'photo'];

    /**
     * Blocks a mode forces off, whatever the saved draft says.
     *
     * The store keeps what the manager meant and the mode masks it at render,
     * rather than the mode rewriting the store. Otherwise switching to
     * `minimal` and back would silently lose three toggles the person had set.
     *
     * @var array<string, list<string>>
     */
    public const IDLE_FORCED_OFF = [
        'minimal' => ['stats', 'health', 'msg'],
        'brand' => ['stats'],
        'status' => [],
    ];

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

    /**
     * How far this terminal rounds cash, in tiyin.
     *
     * Per terminal rather than per restaurant, because a counter selling bottled
     * drinks for exact change and a dining room settling 400 000 so'm bills are
     * different problems inside one venue. `1` disables rounding entirely.
     *
     * On the model and nowhere else. Two callers need it — the payment screen, to
     * show the cashier what to ask for, and the settlement, to charge it — and two
     * copies of a rounding rule is how a screen ends up promising one figure while
     * the receipt prints another. The default comes from
     * App\Support\Finance\CashRounding rather than being written here: a second
     * literal for that constant is the one mistake in this project that is both
     * easy to make and silent for a month.
     */
    public function cashRoundingStep(): int
    {
        $configured = $this->settings['cash_rounding_tiyin'] ?? null;

        return $configured === null ? CashRounding::STEP_TIYIN : max(1, (int) $configured);
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

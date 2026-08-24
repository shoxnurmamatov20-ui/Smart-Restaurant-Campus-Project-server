<?php

declare(strict_types=1);

namespace Modules\Kitchen\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Database\Factories\PrinterFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A thermal printer, and everything the platform knows about whether it is alive.
 *
 * Three of these columns are the whole reason the status bar can exist —
 * `last_seen_at`, `failing_since` and `last_error`. Before them, the only way a
 * waiter learned that the grill's printer was out of paper was a cook walking
 * out of the kitchen to say so, twenty minutes into a service, about an order
 * that was already late.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $code
 * @property string $name
 * @property string $role kitchen | receipt | label
 * @property string $connection agent | network
 * @property string|null $target
 * @property int $columns
 * @property string $codepage
 * @property bool $cuts
 * @property bool $opens_drawer
 * @property int $copies
 * @property bool $is_active
 * @property bool $is_default
 * @property Carbon|null $last_seen_at
 * @property Carbon|null $failing_since
 * @property string|null $last_error
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 * @property-read Collection<int, PrintJob> $jobs
 * @property-read int|null $jobs_count
 * @property-read Collection<int, KitchenStation> $stations
 * @property-read int|null $stations_count
 * @property-read bool $is_online
 * @property-read string $state
 *
 * @method static Builder<static>|Printer active()
 * @method static \Modules\Kitchen\Database\Factories\PrinterFactory factory($count = null, $state = [])
 * @method static Builder<static>|Printer newModelQuery()
 * @method static Builder<static>|Printer newQuery()
 * @method static Builder<static>|Printer ofRole(string $role)
 * @method static Builder<static>|Printer onlyTrashed()
 * @method static Builder<static>|Printer query()
 * @method static Builder<static>|Printer whereBranchId($value)
 * @method static Builder<static>|Printer whereCode($value)
 * @method static Builder<static>|Printer whereCodepage($value)
 * @method static Builder<static>|Printer whereColumns($value)
 * @method static Builder<static>|Printer whereConnection($value)
 * @method static Builder<static>|Printer whereCopies($value)
 * @method static Builder<static>|Printer whereCreatedAt($value)
 * @method static Builder<static>|Printer whereCuts($value)
 * @method static Builder<static>|Printer whereDeletedAt($value)
 * @method static Builder<static>|Printer whereFailingSince($value)
 * @method static Builder<static>|Printer whereId($value)
 * @method static Builder<static>|Printer whereIsActive($value)
 * @method static Builder<static>|Printer whereIsDefault($value)
 * @method static Builder<static>|Printer whereLastError($value)
 * @method static Builder<static>|Printer whereLastSeenAt($value)
 * @method static Builder<static>|Printer whereName($value)
 * @method static Builder<static>|Printer whereOpensDrawer($value)
 * @method static Builder<static>|Printer whereRole($value)
 * @method static Builder<static>|Printer whereTarget($value)
 * @method static Builder<static>|Printer whereTenantId($value)
 * @method static Builder<static>|Printer whereUpdatedAt($value)
 * @method static Builder<static>|Printer withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Printer withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Printer extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<PrinterFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    /** What a printer is for. A station routes to `kitchen`, a settlement to `receipt`. */
    public const ROLES = ['kitchen', 'receipt', 'label'];

    public const CONNECTIONS = ['agent', 'network'];

    /**
     * Character encodings a thermal printer can be told to use.
     *
     * Not a stylistic choice — see EscPos\Charset. A receipt in Russian
     * printed under `ascii` comes out as a column of question marks.
     */
    public const CODEPAGES = ['cp866', 'cp1251', 'ascii'];

    /**
     * The four states the status bar draws, worst first.
     *
     * `error` outranks `offline`: a printer that answered a minute ago and
     * rejected the docket is a different problem from one that is unplugged,
     * and the first is the one somebody can fix without leaving the floor.
     */
    public const STATES = ['error', 'offline', 'busy', 'ready'];

    protected $table = 'kitchen.printers';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'code',
        'name',
        'role',
        'connection',
        'target',
        'columns',
        'codepage',
        'cuts',
        'opens_drawer',
        'copies',
        'is_active',
        'is_default',
    ];

    protected function casts(): array
    {
        return [
            'columns' => 'integer',
            'copies' => 'integer',
            'cuts' => 'boolean',
            'opens_drawer' => 'boolean',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
            'last_seen_at' => 'datetime',
            'failing_since' => 'datetime',
        ];
    }

    protected static function newFactory(): PrinterFactory
    {
        return PrinterFactory::new();
    }

    // ============ Relationships ============

    /** @return HasMany<PrintJob, $this> */
    public function jobs(): HasMany
    {
        return $this->hasMany(PrintJob::class);
    }

    /** @return HasMany<KitchenStation, $this> */
    public function stations(): HasMany
    {
        return $this->hasMany(KitchenStation::class);
    }

    // ============ Liveness ============

    /**
     * Heard from recently enough to be believed.
     *
     * A heartbeat, not a ping: the application never opens a socket to a
     * printer, so "is it alive" can only ever mean "did the agent that speaks
     * to it check in". An agent that has stopped is indistinguishable from a
     * printer that has stopped, and for a waiter holding a bill they are the
     * same problem anyway.
     */
    protected function isOnline(): Attribute
    {
        return Attribute::get(fn (): bool => $this->last_seen_at !== null
            && $this->last_seen_at->gt(now()->subSeconds(self::heartbeatSeconds())));
    }

    /**
     * What the status bar shows, in one word.
     *
     * Deliberately not derived from the queue depth alone. A printer with nine
     * dockets waiting and a heartbeat two seconds old is a busy Friday; the same
     * nine with no heartbeat is a service about to go wrong, and the two must
     * not look alike.
     */
    protected function state(): Attribute
    {
        return Attribute::get(fn (): string => $this->stateGiven(
            $this->jobs()->whereIn('status', ['queued', 'claimed'])->count(),
        ));
    }

    /**
     * The same answer, when the caller has already counted.
     *
     * The health endpoint reads every printer at a venue and the accessor costs
     * one query each — which is fine for one device and is an N+1 on the screen
     * that is refreshed most often in the building. The count is passed in there
     * and taken by the accessor here, so both give the same answer and only one
     * of them pays for it.
     */
    public function stateGiven(int $outstanding): string
    {
        if (! $this->is_active) {
            return 'offline';
        }

        if ($this->failing_since !== null) {
            return 'error';
        }

        if (! $this->is_online) {
            return 'offline';
        }

        return $outstanding > 0 ? 'busy' : 'ready';
    }

    /** The agent checked in. Clears nothing — a heartbeat is not a repair. */
    public function heardFrom(): void
    {
        $this->forceFill(['last_seen_at' => now()])->saveQuietly();
    }

    /**
     * A job came back printed.
     *
     * This is what ends an outage, and it has to be the *success* that does it
     * rather than a heartbeat: an agent whose printer is jammed keeps checking
     * in perfectly happily, and a status bar that went green on a heartbeat
     * would clear the warning while the paper was still stuck.
     */
    public function printedSomething(): void
    {
        $this->forceFill([
            'last_seen_at' => now(),
            'failing_since' => null,
            'last_error' => null,
        ])->saveQuietly();
    }

    /**
     * A job came back refused.
     *
     * `failing_since` is only stamped once per run of failures, so the status
     * bar can say how long this has been going on rather than how long ago the
     * most recent attempt was — "12 daqiqadan beri" is actionable and "3 soniya
     * oldin" is not.
     */
    public function failedWith(string $error): void
    {
        $this->forceFill([
            'last_seen_at' => now(),
            'failing_since' => $this->failing_since ?? now(),
            'last_error' => mb_substr($error, 0, 255),
        ])->saveQuietly();
    }

    // ============ Scopes ============

    /**
     * @param  Builder<Printer>  $query
     * @return Builder<Printer>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * @param  Builder<Printer>  $query
     * @return Builder<Printer>
     */
    public function scopeOfRole(Builder $query, string $role): Builder
    {
        return $query->where('role', $role);
    }

    public static function heartbeatSeconds(): int
    {
        return (int) config('kitchen.printing.heartbeat_seconds', 90);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'branch_id', 'code', 'name', 'role', 'target', 'is_active', 'is_default'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('kitchen.printer');
    }
}

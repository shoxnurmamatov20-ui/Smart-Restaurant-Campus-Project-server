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
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Database\Factories\KitchenTicketFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * What a cook actually looks at: one order, one station.
 *
 * The lines are a JSON snapshot rather than a join, because a ticket must keep
 * reading correctly even if the bill is edited afterwards — and because the KDS
 * screen refreshes every few seconds and cannot afford an N+1.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $order_id Orders module id, no FK on purpose
 * @property string $order_number
 * @property string $station
 * @property string|null $table_label
 * @property string $channel
 * @property string $status new
 * @property array<array-key, mixed>|null $lines [{sku,title,quantity,note}]
 * @property int $sla_minutes
 * @property Carbon|null $started_at
 * @property Carbon|null $ready_at
 * @property Carbon|null $served_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read int $elapsed_minutes
 * @property-read bool $is_late
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|KitchenTicket active()
 * @method static \Modules\Kitchen\Database\Factories\KitchenTicketFactory factory($count = null, $state = [])
 * @method static Builder<static>|KitchenTicket late()
 * @method static Builder<static>|KitchenTicket newModelQuery()
 * @method static Builder<static>|KitchenTicket newQuery()
 * @method static Builder<static>|KitchenTicket ofStation(string $station)
 * @method static Builder<static>|KitchenTicket onlyTrashed()
 * @method static Builder<static>|KitchenTicket query()
 * @method static Builder<static>|KitchenTicket whereBranchId($value)
 * @method static Builder<static>|KitchenTicket whereChannel($value)
 * @method static Builder<static>|KitchenTicket whereCreatedAt($value)
 * @method static Builder<static>|KitchenTicket whereDeletedAt($value)
 * @method static Builder<static>|KitchenTicket whereId($value)
 * @method static Builder<static>|KitchenTicket whereLines($value)
 * @method static Builder<static>|KitchenTicket whereOrderId($value)
 * @method static Builder<static>|KitchenTicket whereOrderNumber($value)
 * @method static Builder<static>|KitchenTicket whereReadyAt($value)
 * @method static Builder<static>|KitchenTicket whereServedAt($value)
 * @method static Builder<static>|KitchenTicket whereSlaMinutes($value)
 * @method static Builder<static>|KitchenTicket whereStartedAt($value)
 * @method static Builder<static>|KitchenTicket whereStation($value)
 * @method static Builder<static>|KitchenTicket whereStatus($value)
 * @method static Builder<static>|KitchenTicket whereTableLabel($value)
 * @method static Builder<static>|KitchenTicket whereTenantId($value)
 * @method static Builder<static>|KitchenTicket whereUpdatedAt($value)
 * @method static Builder<static>|KitchenTicket withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|KitchenTicket withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class KitchenTicket extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<KitchenTicketFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'kitchen.kitchen_tickets';

    public const STATUSES = ['new', 'cooking', 'ready', 'served', 'recalled', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'order_id',
        'order_number',
        'station',
        'table_label',
        'channel',
        'status',
        'lines',
        'sla_minutes',
        'started_at',
        'ready_at',
        'served_at',
    ];

    protected function casts(): array
    {
        return [
            'lines' => 'array',
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
            'served_at' => 'datetime',
            'sla_minutes' => 'integer',
        ];
    }

    protected static function newFactory(): KitchenTicketFactory
    {
        return KitchenTicketFactory::new();
    }

    // ============ Accessors ============

    /** Minutes since the ticket hit the pass — what the cook sees counting up. */
    protected function elapsedMinutes(): Attribute
    {
        return Attribute::get(function (): int {
            $from = $this->started_at ?? $this->created_at;
            $to = $this->ready_at ?? now();

            return $from === null ? 0 : max(0, (int) $from->diffInMinutes($to));
        });
    }

    /**
     * Past its SLA and not out yet.
     *
     * A ticket that is already ready is never "late" — the delay is over and
     * flagging it red forever only trains the brigade to ignore the colour.
     */
    protected function isLate(): Attribute
    {
        return Attribute::get(fn (): bool => in_array($this->status, ['new', 'cooking'], true)
            && $this->elapsed_minutes > $this->sla_minutes);
    }

    // ============ Domain behaviour ============

    public function start(): bool
    {
        if (! in_array($this->status, ['new', 'recalled'], true)) {
            return false;
        }

        return $this->update(['status' => 'cooking', 'started_at' => now()]);
    }

    public function markReady(): bool
    {
        if (! in_array($this->status, ['new', 'cooking', 'recalled'], true)) {
            return false;
        }

        return $this->update(['status' => 'ready', 'ready_at' => now()]);
    }

    public function markServed(): bool
    {
        if ($this->status !== 'ready') {
            return false;
        }

        return $this->update(['status' => 'served', 'served_at' => now()]);
    }

    /**
     * Pull a ticket back to the line — the plate came back or the waiter is not
     * ready for it. Clears ready_at so the timer is honest again.
     */
    public function recall(): bool
    {
        if (in_array($this->status, ['cancelled'], true)) {
            return false;
        }

        return $this->update(['status' => 'recalled', 'ready_at' => null, 'served_at' => null]);
    }

    // ============ Scopes ============

    /** Everything still owed to a guest. */
    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', ['new', 'cooking', 'recalled']);
    }

    /**
     * Past its SLA and not out yet — the same rule as the `is_late` accessor,
     * expressed in SQL.
     *
     * The kitchen display counts late tickets on every refresh, several times a
     * minute, per station. Loading every open ticket into PHP to filter on an
     * accessor is affordable for one venue and not for a chain, so the count is
     * answered by the database.
     *
     * `sla_minutes` is compared against the ticket's own clock: from when it hit
     * the pass (or was created) until now, since a ticket that is already ready
     * is never late.
     */
    public function scopeLate(Builder $query): Builder
    {
        // The clock comes from PHP as a bound parameter rather than from SQL's
        // now(): it keeps the comparison independent of the database server's
        // timezone, and it makes the scope testable with Carbon::setTestNow().
        return $query->whereIn('status', ['new', 'cooking'])
            ->whereRaw(
                'extract(epoch from (? - coalesce(started_at, created_at))) / 60 > sla_minutes',
                [now()],
            );
    }

    public function scopeOfStation(Builder $query, string $station): Builder
    {
        return $query->where('station', $station);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'order_id', 'order_number', 'station', 'status', 'started_at', 'ready_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('kitchen.ticket');
    }
}

<?php

declare(strict_types=1);

namespace Modules\Kitchen\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Settings\Policies;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Database\Factories\KitchenTicketFactory;
use Modules\Kitchen\Events\TicketMoved;
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
 * @property int|null $waiter_user_id public.users id, snapshot at fire time
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
 * @property-read User|null $waiter
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

    /**
     * The ladder a docket climbs.
     *
     * `accepted` was missing, and its absence was visible on the wall: the
     * design's board has five columns — new, accepted, cooking, ready, served —
     * and the second could never fill, because nothing could put a ticket in
     * it. The comment in BillRegistry::send() already described the state as a
     * cook's first act ("`accepted` when they take the ticket, `cooking` when
     * they start"); only the value was missing.
     *
     * It earns its place by answering a question the other states cannot: has
     * anybody looked at this yet. A ticket sitting at `new` for six minutes is a
     * ticket nobody has seen; the same ticket at `accepted` is one a cook is
     * holding. Those are different problems and the chef running the pass fixes
     * them differently.
     */
    public const STATUSES = ['new', 'accepted', 'cooking', 'ready', 'served', 'recalled', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'order_id',
        'order_number',
        'station',
        'table_label',
        'waiter_user_id',
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

    // ============ Relationships ============

    /**
     * Who is waiting for this plate.
     *
     * Reads `public.users`, which is core and not another module — the docket
     * carries the id as a snapshot (see the migration) and this only turns it
     * into a name. Kitchen still never touches `orders.orders`.
     */
    public function waiter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'waiter_user_id');
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
        // `accepted` counts as late too: a claimed ticket nobody has started is
        // exactly the one the pass needs shouted about.
        return Attribute::get(fn (): bool => in_array($this->status, ['new', 'accepted', 'cooking'], true)
            && $this->elapsed_minutes > self::lateAfterMinutes($this->sla_minutes));
    }

    /**
     * How long this ticket has before the docket turns red.
     *
     * The station's own `sla_minutes` unless the restaurant has set a house
     * rule — `policies.kds_late_minutes`, which the console's *"Chek rangi bilan
     * ogohlantirish"* switch writes. Zero, the default, means the station
     * decides, and that is the right default: a grill and a bar have genuinely
     * different clocks, and one number across a kitchen would make either the
     * drinks permanently red or the steaks permanently green.
     *
     * A house rule OVERRIDES rather than caps. A venue that says ten minutes
     * means ten minutes at every pass — including a station whose own figure is
     * twenty — because the person setting it is answering "how long may a guest
     * wait", not "how long does this pan take".
     */
    public static function lateAfterMinutes(int $stationMinutes): int
    {
        $house = app(Policies::class)->number('kds_late_minutes');

        return $house > 0 ? $house : $stationMinutes;
    }

    /**
     * Announce every move, from one place.
     *
     * There are four methods that change a status and there will be a fifth, so
     * dispatching from each is four chances to forget and one screen that
     * silently stops updating. A model hook cannot be forgotten: whatever
     * changes the column, the floor and the pass both hear about it.
     *
     * `getOriginal` gives the state it came from, which is what lets a screen
     * that missed a message tell it is behind rather than assuming it is
     * current.
     */
    protected static function booted(): void
    {
        self::updated(static function (self $ticket): void {
            if (! $ticket->wasChanged('status')) {
                return;
            }

            TicketMoved::dispatch($ticket, (string) $ticket->getOriginal('status'));
        });
    }

    // ============ Domain behaviour ============

    /**
     * A cook takes the ticket.
     *
     * Separate from starting it, because in a real kitchen they are separate:
     * the ticket is claimed off the rail first and the pan goes on when there is
     * room. Collapsing them would make every accepted ticket look like it was
     * already cooking, and the pass would lose the one signal that says which
     * tickets nobody has picked up.
     */
    public function accept(): bool
    {
        if (! in_array($this->status, ['new', 'recalled'], true)) {
            return false;
        }

        return $this->update(['status' => 'accepted']);
    }

    public function start(): bool
    {
        // From `accepted` too, which is the normal path now: claimed, then
        // started. Straight from `new` stays legal — a quiet kitchen with one
        // cook has no use for the middle step.
        if (! in_array($this->status, ['new', 'accepted', 'recalled'], true)) {
            return false;
        }

        return $this->update(['status' => 'cooking', 'started_at' => now()]);
    }

    public function markReady(): bool
    {
        if (! in_array($this->status, ['new', 'accepted', 'cooking', 'recalled'], true)) {
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
        return $query->whereIn('status', ['new', 'accepted', 'cooking', 'recalled']);
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
        $house = app(Policies::class)->number('kds_late_minutes');

        // The house rule as a bound parameter, or the station's own column —
        // the same choice `lateAfterMinutes()` makes, expressed in SQL. Two
        // readings of one rule, and the accessor and the count on the same
        // screen disagreeing is exactly what this pair exists to prevent.
        return $query->whereIn('status', ['new', 'accepted', 'cooking'])
            ->whereRaw(
                $house > 0
                    ? 'extract(epoch from (? - coalesce(started_at, created_at))) / 60 > ?'
                    : 'extract(epoch from (? - coalesce(started_at, created_at))) / 60 > sla_minutes',
                $house > 0 ? [now(), $house] : [now()],
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

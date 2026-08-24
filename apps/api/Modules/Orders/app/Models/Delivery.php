<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One order, one rider, three timestamps.
 *
 * The whole of dispatch on this platform today — see the migration for why it
 * is this small and what it deliberately is not. It exists so the guest's
 * tracking screen can answer "who has my dinner" and so the console's delivery
 * tab can answer "who is out".
 *
 * Deliberately NOT soft-deleted. A trip somebody made is a payroll fact, and a
 * row that could vanish would take it with it.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $order_id Orders module id, no FK on purpose — see the migration
 * @property int|null $courier_user_id A platform user holding the `courier` role
 * @property string $status assigned|picked|enroute|delivered|failed
 * @property Carbon|null $assigned_at
 * @property Carbon|null $picked_at
 * @property Carbon|null $delivered_at
 * @property string|null $last_lat
 * @property string|null $last_lng
 * @property Carbon|null $last_seen_at
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read User|null $courier
 * @property-read Order|null $order
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Delivery live()
 * @method static Builder<static>|Delivery newModelQuery()
 * @method static Builder<static>|Delivery newQuery()
 * @method static Builder<static>|Delivery query()
 *
 * @mixin \Eloquent
 */
final class Delivery extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'orders.deliveries';

    /**
     * The five words, and why `picked` and `enroute` are two of them.
     *
     * A rider who has the bag and a rider who has left the building are
     * different answers to "where is my food": the first is still the
     * restaurant's fault, the second is the road's. Collapsing them is how a
     * delivery screen stops being able to say whether the kitchen is late.
     *
     * @var list<string>
     */
    public const STATUSES = ['assigned', 'picked', 'enroute', 'delivered', 'failed'];

    /**
     * A delivery somebody is still responsible for.
     *
     * Matches the partial unique index in the migration by name — one live
     * delivery per order — so the two cannot drift apart.
     *
     * @var list<string>
     */
    public const LIVE_STATUSES = ['assigned', 'picked', 'enroute'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'order_id',
        'courier_user_id',
        'status',
        'assigned_at',
        'picked_at',
        'delivered_at',
        'last_lat',
        'last_lng',
        'last_seen_at',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'order_id' => 'integer',
            'courier_user_id' => 'integer',
            'assigned_at' => 'datetime',
            'picked_at' => 'datetime',
            'delivered_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }

    // ============ Relationships ============

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function courier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'courier_user_id');
    }

    // ============ Scopes ============

    /**
     * @param  Builder<Delivery>  $query
     * @return Builder<Delivery>
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->whereIn('status', self::LIVE_STATUSES);
    }

    // ============ Domain behaviour ============

    /**
     * Move the rider along, stamping the moment it happened.
     *
     * The only writer of `status`, so the derived column and the three
     * timestamps cannot come apart — see the migration's note on why both are
     * stored.
     *
     * Forward only, and that is the rule worth stating: a phone draining a
     * queue at seven the next morning replays `picked` after `delivered`, and
     * unwinding a completed drop because an old entry arrived late would report
     * a dinner as still in transit hours after somebody ate it. An out-of-order
     * entry answers `false`, which the queue reads as "already handled".
     *
     * `$at` is when the rider did it, not when we heard: an entry queued at
     * 19:12 in a basement and drained at 21:00 belongs to 19:12, exactly as
     * `StaffActionController::clockIn()` argues about attendance.
     */
    public function advance(string $status, ?Carbon $at = null): bool
    {
        if (! in_array($status, self::STATUSES, true)) {
            return false;
        }

        $order = array_flip(self::STATUSES);

        // `failed` is reachable from any live state — a rider who cannot find
        // the address has failed whether they had picked up or already left.
        if ($status !== 'failed' && $order[$status] <= ($order[$this->status] ?? 0)) {
            return false;
        }

        if (! in_array($this->status, self::LIVE_STATUSES, true)) {
            return false;
        }

        $at ??= now();

        /*
         * There is no `enroute_at`, and that is the reason there are three
         * timestamps rather than five.
         *
         * A rider who has the bag and a rider who has walked to the scooter are
         * a minute apart and nobody measures that minute; what is measured is
         * pick-up and hand-over. So `enroute` backfills `picked_at` for a
         * courier whose phone skipped the middle rung — which it will, because
         * the app's one button says "yo'ldaman".
         */
        $stamp = match ($status) {
            'picked' => ['picked_at' => $at],
            'enroute' => ['picked_at' => $this->picked_at ?? $at],
            'delivered' => ['delivered_at' => $at],
            default => [],
        };

        return $this->forceFill(['status' => $status, ...$stamp])->save();
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // `courier_user_id` is on the list because a handover is the one
            // thing this table overwrites rather than appends — the log is
            // where "who had it before" lives. See the migration.
            ->logOnly(['tenant_id', 'order_id', 'courier_user_id', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('orders.delivery');
    }
}

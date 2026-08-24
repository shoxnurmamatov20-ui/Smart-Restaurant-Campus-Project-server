<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Activity;
use App\Models\Branch;
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
 * How the intake desk behaves when nobody is looking at it.
 *
 * The four automation switches and the prep time on `/calls` → Kanallar. Kept
 * apart from {@see ChannelSetting} on purpose: that row answers "is this DOOR
 * open", one per door, and these answer "what happens to whatever comes
 * through any of them". Folding them together would have meant five copies of
 * one restaurant-wide decision and a screen where switching Telegram off could
 * change the quoted prep time.
 *
 * Deliberately NOT `BelongsToBranch`, for the reason `ChannelSetting` gives at
 * length: the trait's "no branch means every branch" is right for reading and
 * wrong for writing here, because a manager scoped to one venue would then see
 * the business-wide row filtered OUT and read the platform defaults instead of
 * the rules their owner set. The fall-through is explicit in `resolve()`.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property bool $auto_accept_prepaid
 * @property bool $hide_stopped_online
 * @property bool $pause_at_peak
 * @property int $peak_ticket_limit
 * @property bool $call_on_cash
 * @property int $prep_minutes
 * @property int|null $updated_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read User|null $editor
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|IntakePolicy newModelQuery()
 * @method static Builder<static>|IntakePolicy newQuery()
 * @method static Builder<static>|IntakePolicy query()
 *
 * @mixin \Eloquent
 */
final class IntakePolicy extends Model
{
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'orders.intake_policies';

    /**
     * The four switches, in the order the design draws them.
     *
     * Published as a constant because three places need the same list — the
     * request's rules, the controller's shape and the test — and a list written
     * three times is a list that disagrees with itself on the first change.
     */
    public const RULES = [
        'auto_accept_prepaid',
        'hide_stopped_online',
        'pause_at_peak',
        'call_on_cash',
    ];

    /** What a restaurant that has never opened the screen behaves like. */
    public const DEFAULTS = [
        'auto_accept_prepaid' => true,
        'hide_stopped_online' => true,
        'pause_at_peak' => true,
        'peak_ticket_limit' => 12,
        'call_on_cash' => false,
        'prep_minutes' => 25,
    ];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'auto_accept_prepaid',
        'hide_stopped_online',
        'pause_at_peak',
        'peak_ticket_limit',
        'call_on_cash',
        'prep_minutes',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'auto_accept_prepaid' => 'boolean',
            'hide_stopped_online' => 'boolean',
            'pause_at_peak' => 'boolean',
            'call_on_cash' => 'boolean',
            'peak_ticket_limit' => 'integer',
            'prep_minutes' => 'integer',
        ];
    }

    // ============ Relationships ============

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    // ============ Lookup ============

    /**
     * The rules in force at one venue.
     *
     * The venue's own row wins; the business-wide row answers when it has none;
     * an absent row is the defaults above, which is what a restaurant that has
     * never touched this screen expects. Answers a model that has never been
     * saved in that last case rather than null, so every caller reads
     * `->prep_minutes` instead of remembering which of three shapes it got.
     */
    public static function resolve(?int $branchId): self
    {
        /** @var Collection<int, self> $rows */
        $rows = self::query()
            ->where(static function (Builder $query) use ($branchId): void {
                $query->whereNull('branch_id');

                if ($branchId !== null) {
                    $query->orWhere('branch_id', $branchId);
                }
            })
            ->get();

        // The venue's own row first — `sortByDesc` on a nullable column puts
        // the non-null ahead, which is the precedence this needs.
        $best = $rows->sortByDesc('branch_id')->first();

        return $best ?? new self(self::DEFAULTS);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([...self::RULES, 'peak_ticket_limit', 'prep_minutes', 'branch_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('orders.intake_policy');
    }
}

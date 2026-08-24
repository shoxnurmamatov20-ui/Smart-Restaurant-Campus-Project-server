<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\CampaignFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One message, one segment, one bill from the gateway.
 *
 * The ladder is `draft → scheduled → sending → sent`, with `failed` off the
 * side, and it is enforced here rather than in the controller: a campaign that
 * can go from `sent` back to `draft` is one whose recipient list can be changed
 * after the fact, which makes every report about it a guess.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $name
 * @property string $body
 * @property string $segment
 * @property string $status draft|scheduled|sending|sent|failed
 * @property Carbon|null $scheduled_for
 * @property Carbon|null $started_at
 * @property Carbon|null $finished_at
 * @property int $recipients
 * @property int $delivered
 * @property int $failed
 * @property int $estimated_cost_tiyin
 * @property int $cost_tiyin
 * @property int|null $promo_code_id
 * @property int $redeemed
 * @property int $revenue_tiyin
 * @property int|null $created_by_user_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, CampaignDelivery> $deliveries
 * @property-read int|null $deliveries_count
 * @property-read PromoCode|null $promoCode
 * @property-read Tenant|null $tenant
 * @property-read User|null $author
 *
 * @method static \Modules\Crm\Database\Factories\CampaignFactory factory($count = null, $state = [])
 * @method static Builder<static>|Campaign newModelQuery()
 * @method static Builder<static>|Campaign newQuery()
 * @method static Builder<static>|Campaign onlyTrashed()
 * @method static Builder<static>|Campaign query()
 * @method static Builder<static>|Campaign withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Campaign withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Campaign extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CampaignFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.campaigns';

    public const STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'failed'];

    /**
     * Who a campaign may be aimed at.
     *
     * Four of the five are `crm.customers.segment` values and the fifth is the
     * absence of a filter. Kept here rather than in the request rules because
     * the dispatcher builds the recipient query from the same list — two places
     * that both know the words is two places that can stop agreeing.
     */
    public const SEGMENTS = ['all', 'regular', 'corporate', 'occasional', 'at_risk'];

    protected $fillable = [
        'tenant_id',
        'name',
        'body',
        'segment',
        'status',
        'scheduled_for',
        'estimated_cost_tiyin',
        'promo_code_id',
        'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_for' => 'datetime',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'recipients' => 'integer',
            'delivered' => 'integer',
            'failed' => 'integer',
            'estimated_cost_tiyin' => 'integer',
            'cost_tiyin' => 'integer',
            'redeemed' => 'integer',
            'revenue_tiyin' => 'integer',
        ];
    }

    protected static function newFactory(): CampaignFactory
    {
        return CampaignFactory::new();
    }

    // ============ Relationships ============

    public function deliveries(): HasMany
    {
        return $this->hasMany(CampaignDelivery::class);
    }

    public function promoCode(): BelongsTo
    {
        return $this->belongsTo(PromoCode::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    // ============ Domain behaviour ============

    /**
     * Whether this one can still be edited or sent.
     *
     * `sending` is deliberately not editable. Dispatch is one queued job per
     * recipient, so a body changed halfway through would put two different
     * messages out under one campaign's name and no report could ever say which
     * guest got which.
     */
    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'scheduled'], true);
    }

    /** A campaign that has left the building. Counters move; nothing else does. */
    public function hasLeft(): bool
    {
        return in_array($this->status, ['sending', 'sent'], true);
    }

    /**
     * Roll one delivery's outcome into the campaign's own counters.
     *
     * `increment` rather than read-modify-write: two thousand jobs finish in
     * parallel, and every one of them touches this row.
     */
    public function recordDelivery(bool $accepted, int $costTiyin): void
    {
        $this->newQuery()->whereKey($this->getKey())->update([
            $accepted ? 'delivered' : 'failed' => $this->getConnection()->raw(
                ($accepted ? 'delivered' : 'failed').' + 1',
            ),
            'cost_tiyin' => $this->getConnection()->raw('cost_tiyin + '.$costTiyin),
            'updated_at' => now(),
        ]);
    }

    // ============ Scopes ============

    /** Campaigns whose send time has come and gone. The scheduler's whole query. */
    public function scopeDue(Builder $query): Builder
    {
        return $query->where('status', 'scheduled')
            ->whereNotNull('scheduled_for')
            ->where('scheduled_for', '<=', now());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // The body and the segment, because "who was this sent to and what
            // did it say" is the question a regulator asks about marketing SMS.
            ->logOnly(['name', 'body', 'segment', 'status', 'recipients', 'cost_tiyin'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.campaign');
    }
}

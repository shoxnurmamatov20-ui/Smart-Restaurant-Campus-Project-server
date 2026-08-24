<?php

declare(strict_types=1);

namespace Modules\Analytics\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One trading day, summarised — the module's first projection.
 *
 * See the migration for why this exists at all when everything else in
 * Analytics is derived on read: two figures, labour and waste, live in modules
 * this one may not query, so they arrive through a contract once a day and are
 * kept here where they can be joined, windowed and compared.
 *
 * Deliberately NOT soft-deleted and deliberately not audited. A projection is
 * not a record of anything — it is a restatement of rows that are themselves
 * the record, and `analytics:rollup --from=… --to=…` rebuilds any of it. A
 * deleted row here is a row that comes back tonight.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id Null means the roll-up across the business
 * @property Carbon $business_date
 * @property int $revenue_tiyin
 * @property int $takings_tiyin
 * @property int $discounts_tiyin
 * @property int $expenses_tiyin
 * @property int $cogs_tiyin
 * @property int $cogs_coverage_percent
 * @property int $labour_tiyin
 * @property int $waste_tiyin
 * @property int $orders_count
 * @property int $guests_count
 * @property Carbon $computed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|DailyFact newModelQuery()
 * @method static Builder<static>|DailyFact newQuery()
 * @method static Builder<static>|DailyFact query()
 * @method static Builder<static>|DailyFact rollup()
 *
 * @mixin \Eloquent
 */
final class DailyFact extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    protected $table = 'analytics.daily_facts';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'business_date',
        'revenue_tiyin',
        'takings_tiyin',
        'discounts_tiyin',
        'expenses_tiyin',
        'cogs_tiyin',
        'cogs_coverage_percent',
        'labour_tiyin',
        'waste_tiyin',
        'orders_count',
        'guests_count',
        'computed_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'computed_at' => 'datetime',
            'revenue_tiyin' => 'integer',
            'takings_tiyin' => 'integer',
            'discounts_tiyin' => 'integer',
            'expenses_tiyin' => 'integer',
            'cogs_tiyin' => 'integer',
            'cogs_coverage_percent' => 'integer',
            'labour_tiyin' => 'integer',
            'waste_tiyin' => 'integer',
            'orders_count' => 'integer',
            'guests_count' => 'integer',
        ];
    }

    /**
     * The business-wide rows, not the per-venue ones.
     *
     * Needed because `BelongsToBranch` does the platform's usual thing — an
     * unset branch means "every branch" and the scope does not filter — so a
     * caller reading the roll-up without this would sum the group total AND
     * every venue that makes it up, and report a restaurant that earned twice.
     *
     * @param Builder<DailyFact> $query
     *
     * @return Builder<DailyFact>
     */
    public function scopeRollup(Builder $query): Builder
    {
        return $query->whereNull('branch_id');
    }
}

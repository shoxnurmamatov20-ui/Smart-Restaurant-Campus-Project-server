<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Something the restaurant bought once and writes down over years.
 *
 * See the migration for why the method is straight line and only straight line,
 * and why nothing is posted to `finance.expenses`.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $name
 * @property string $category One of self::CATEGORIES
 * @property Carbon $acquired_on
 * @property int $cost Purchase price in tiyin
 * @property int $residual What it is expected to be worth at the end, in tiyin
 * @property int $useful_life_months
 * @property Carbon|null $disposed_on
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|FixedAsset live()
 * @method static Builder<static>|FixedAsset newModelQuery()
 * @method static Builder<static>|FixedAsset newQuery()
 * @method static Builder<static>|FixedAsset query()
 *
 * @mixin \Eloquent
 */
final class FixedAsset extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    protected $table = 'finance.fixed_assets';

    /** Four, because the useful lives differ by years — see the migration. */
    public const CATEGORIES = ['equipment', 'furniture', 'fit_out', 'vehicle'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'category',
        'acquired_on',
        'cost',
        'residual',
        'useful_life_months',
        'disposed_on',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'acquired_on' => 'date',
            'disposed_on' => 'date',
            'cost' => 'integer',
            'residual' => 'integer',
            'useful_life_months' => 'integer',
        ];
    }

    /**
     * What is written off each full month, in tiyin.
     *
     * `(cost − residual) ÷ life`, floored. The remainder is not lost — the final
     * month takes it, in `Depreciation::forMonth()` — because sixty equal
     * instalments of a number that does not divide by sixty leave the asset
     * standing at a few tiyin forever, and a register that will not close is how
     * an accountant finds out that the arithmetic was never finished.
     */
    public function monthlyCharge(): int
    {
        $base = max(0, $this->cost - $this->residual);

        return $this->useful_life_months <= 0 ? 0 : intdiv($base, $this->useful_life_months);
    }

    // ============ Scopes ============

    /**
     * Assets the restaurant still has.
     *
     * @param Builder<FixedAsset> $query
     *
     * @return Builder<FixedAsset>
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->whereNull('disposed_on');
    }
}

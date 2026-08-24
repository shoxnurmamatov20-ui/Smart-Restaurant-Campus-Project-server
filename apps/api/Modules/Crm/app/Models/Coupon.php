<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\CouponFactory;

/**
 * Something on the loyalty shelf.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $key
 * @property array<array-key, mixed> $name
 * @property array<array-key, mixed>|null $note
 * @property int $points_cost
 * @property string $kind percent|fixed|free_delivery
 * @property int $value
 * @property int $min_tiyin
 * @property string $tone accent|brand|warning
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property int $sort_order
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, CouponReservation> $reservations
 * @property-read int|null $reservations_count
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\CouponFactory factory($count = null, $state = [])
 * @method static Builder<static>|Coupon newModelQuery()
 * @method static Builder<static>|Coupon newQuery()
 * @method static Builder<static>|Coupon onlyTrashed()
 * @method static Builder<static>|Coupon query()
 * @method static Builder<static>|Coupon withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Coupon withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Coupon extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CouponFactory> */
    use HasFactory;

    use HasTranslations;
    use SoftDeletes;

    protected $table = 'crm.coupons';

    public const KINDS = ['percent', 'fixed', 'free_delivery'];

    public const TONES = ['accent', 'brand', 'warning'];

    /** @var array<int, string> */
    protected array $translatable = ['name', 'note'];

    protected $fillable = [
        'tenant_id',
        'key',
        'name',
        'note',
        'points_cost',
        'kind',
        'value',
        'min_tiyin',
        'tone',
        'starts_at',
        'ends_at',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'note' => 'array',
            'points_cost' => 'integer',
            'value' => 'integer',
            'min_tiyin' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected static function newFactory(): CouponFactory
    {
        return CouponFactory::new();
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(CouponReservation::class);
    }

    /** On the shelf right now: switched on, started, not finished. */
    public function scopeOnShelf(Builder $query): Builder
    {
        $now = now();

        return $query->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now));
    }
}

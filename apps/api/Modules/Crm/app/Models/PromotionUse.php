<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\PromotionUseFactory;

/**
 * One bill an offer touched.
 *
 * A counter column alone answers "how many" and never "which ones", so a
 * marketer looking at an offer that went wrong would have a number and no way
 * to find the dinners behind it — the same reasoning that put
 * `crm.promo_redemptions` next to `used_count`.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $promotion_id
 * @property int|null $customer_id
 * @property int|null $order_id
 * @property int $discount_tiyin
 * @property int $total_tiyin
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read Promotion $promotion
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\PromotionUseFactory factory($count = null, $state = [])
 * @method static Builder<static>|PromotionUse newModelQuery()
 * @method static Builder<static>|PromotionUse newQuery()
 * @method static Builder<static>|PromotionUse query()
 *
 * @mixin \Eloquent
 */
final class PromotionUse extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PromotionUseFactory> */
    use HasFactory;

    protected $table = 'crm.promotion_uses';

    protected $fillable = [
        'tenant_id',
        'promotion_id',
        'customer_id',
        'order_id',
        'discount_tiyin',
        'total_tiyin',
    ];

    protected function casts(): array
    {
        return [
            'discount_tiyin' => 'integer',
            'total_tiyin' => 'integer',
        ];
    }

    protected static function newFactory(): PromotionUseFactory
    {
        return PromotionUseFactory::new();
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}

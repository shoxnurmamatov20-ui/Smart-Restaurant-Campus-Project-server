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
use Modules\Crm\Database\Factories\PromoRedemptionFactory;

/**
 * One guest, one campaign, one bill — the row that makes a usage limit real.
 *
 * No soft delete, for the same reason `crm.account_entries` has none: this is
 * the working behind `promo_codes.used_count`, and a row that can vanish is a
 * budget that can change with no trace of why.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $promo_code_id
 * @property int|null $customer_id
 * @property int|null $order_id
 * @property int $discount_tiyin
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read PromoCode|null $promoCode
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\PromoRedemptionFactory factory($count = null, $state = [])
 * @method static Builder<static>|PromoRedemption newModelQuery()
 * @method static Builder<static>|PromoRedemption newQuery()
 * @method static Builder<static>|PromoRedemption query()
 *
 * @mixin \Eloquent
 */
final class PromoRedemption extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PromoRedemptionFactory> */
    use HasFactory;

    protected $table = 'crm.promo_redemptions';

    protected $fillable = [
        'tenant_id',
        'promo_code_id',
        'customer_id',
        'order_id',
        'discount_tiyin',
    ];

    protected function casts(): array
    {
        return ['discount_tiyin' => 'integer'];
    }

    protected static function newFactory(): PromoRedemptionFactory
    {
        return PromoRedemptionFactory::new();
    }

    public function promoCode(): BelongsTo
    {
        return $this->belongsTo(PromoCode::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}

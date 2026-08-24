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
use Modules\Crm\Database\Factories\CouponReservationFactory;

/**
 * A guest holding a coupon they paid points for.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $coupon_id
 * @property int $customer_id
 * @property string $code
 * @property int $points_spent
 * @property Carbon|null $expires_at
 * @property Carbon|null $redeemed_at
 * @property int|null $order_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Coupon|null $coupon
 * @property-read Customer|null $customer
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\CouponReservationFactory factory($count = null, $state = [])
 * @method static Builder<static>|CouponReservation newModelQuery()
 * @method static Builder<static>|CouponReservation newQuery()
 * @method static Builder<static>|CouponReservation query()
 *
 * @mixin \Eloquent
 */
final class CouponReservation extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CouponReservationFactory> */
    use HasFactory;

    protected $table = 'crm.coupon_reservations';

    protected $fillable = [
        'tenant_id',
        'coupon_id',
        'customer_id',
        'code',
        'points_spent',
        'expires_at',
        'redeemed_at',
        'order_id',
    ];

    protected function casts(): array
    {
        return [
            'points_spent' => 'integer',
            'expires_at' => 'datetime',
            'redeemed_at' => 'datetime',
        ];
    }

    protected static function newFactory(): CouponReservationFactory
    {
        return CouponReservationFactory::new();
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * The string a guest reads off their screen and types into a cart.
     *
     * The alphabet is the same one the POS pairing code uses and for the same
     * reason: `0/O`, `1/I/L` and `5/S` are removed, because a coupon code is
     * read aloud across a counter and typed by somebody holding a bag in the
     * other hand, and those pairs are what produce a code that "was definitely
     * right" and is definitely wrong.
     *
     * Thirty characters over eight places is about 40 bits — guessing is
     * pointless — and the unique index refuses a collision rather than trusting
     * the odds.
     */
    public static function mintCode(): string
    {
        $alphabet = '23456789ABCDEFGHJKMNPQRTUVWXYZ';
        $code = '';

        for ($i = 0; $i < 8; $i++) {
            $code .= $alphabet[random_int(0, mb_strlen($alphabet) - 1)];
        }

        return 'SR'.$code;
    }
}

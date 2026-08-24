<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * How far a storefront will send a courier.
 *
 * A centre and a radius rather than a drawn polygon, and that is a decision
 * with a cost written on it: a circle is right in the middle of a district and
 * wrong at its edges, and the edges are where a rider telephones to say they
 * cannot find the block. Drawing the real shape needs a basemap, a geocoder and
 * a spatial store — `TODO(integration): needs MAP_API_KEY — see docs/GO-LIVE.md` — and a circle
 * answers "will anybody come" correctly for the overwhelming majority of
 * addresses in the meantime.
 *
 * The radius is stored in METRES so that no float is kept anywhere; the API and
 * the screens talk in kilometres because that is the unit a person types.
 * `packages/surfaces/src/mp/geo.ts` holds the same arithmetic for the client, so
 * a guest is told before they build a basket rather than at checkout.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $store_id
 * @property string $label
 * @property int $radius_m
 * @property int $latitude_e6
 * @property int $longitude_e6
 * @property int|null $fee_tiyin
 * @property int|null $min_order_tiyin
 * @property int $sort_order
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Store|null $store
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|DeliveryZone newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|DeliveryZone newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|DeliveryZone query()
 *
 * @mixin \Eloquent
 */
final class DeliveryZone extends Model
{
    use BelongsToTenant;

    protected $table = 'marketplace.delivery_zones';

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'store_id', 'label', 'radius_m',
        'latitude_e6', 'longitude_e6', 'fee_tiyin', 'min_order_tiyin', 'sort_order',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'radius_m' => 'integer',
            'latitude_e6' => 'integer',
            'longitude_e6' => 'integer',
            'fee_tiyin' => 'integer',
            'min_order_tiyin' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    public function latitude(): float
    {
        return $this->latitude_e6 / 1_000_000;
    }

    public function longitude(): float
    {
        return $this->longitude_e6 / 1_000_000;
    }

    /** Metres back to the kilometres a person reads: 3200 → 3.2. */
    public function radiusKm(): float
    {
        return round($this->radius_m / 1000, 2);
    }
}

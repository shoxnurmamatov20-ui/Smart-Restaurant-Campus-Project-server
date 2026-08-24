<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Modules\Marketplace\Database\Factories\CourierFactory;

/**
 * A MyPOS rider.
 *
 * Tenant-free, and named in `ModuleBoundaryTest` alongside {@see Consumer}: a
 * rider carrying three restaurants' bags on one run belongs to none of them.
 * `staff.staff_members` is a restaurant's own payroll and stays tenanted.
 *
 * The last known position is stored beside the time it was reported, and both
 * are nullable. That pairing is the honest one: a tracking screen that draws a
 * pin with no timestamp implies a live feed, and the ordinary case is a phone
 * whose battery died four minutes ago.
 *
 * @property int $id
 * @property string $name
 * @property string $phone
 * @property int $rating_tenths
 * @property int $deliveries_count
 * @property bool $is_active
 * @property int|null $last_latitude_e6
 * @property int|null $last_longitude_e6
 * @property Carbon|null $located_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static \Modules\Marketplace\Database\Factories\CourierFactory factory($count = null, $state = [])
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Courier newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Courier newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Courier query()
 *
 * @mixin \Eloquent
 */
final class Courier extends Model
{
    /** @use HasFactory<CourierFactory> */
    use HasFactory;

    protected $table = 'marketplace.couriers';

    /**
     * How stale a position may be and still be drawn.
     *
     * Ten minutes. Past that the screen says where the rider was rather than
     * where they are, which is a different sentence and a different pin.
     */
    public const POSITION_FRESH_MINUTES = 10;

    /** @var list<string> */
    protected $fillable = [
        'name', 'phone', 'rating_tenths', 'deliveries_count', 'is_active',
        'last_latitude_e6', 'last_longitude_e6', 'located_at',
    ];

    /** @var list<string> */
    protected $hidden = ['phone'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'located_at' => 'datetime',
            'rating_tenths' => 'integer',
            'deliveries_count' => 'integer',
            'last_latitude_e6' => 'integer',
            'last_longitude_e6' => 'integer',
        ];
    }

    public function rating(): float
    {
        return round($this->rating_tenths / 10, 1);
    }

    /**
     * Where the rider is, or null if nobody can honestly say.
     *
     * @return array{lat: float, lng: float, at: string}|null
     */
    public function position(): ?array
    {
        if ($this->last_latitude_e6 === null || $this->last_longitude_e6 === null
            || $this->located_at === null
            || $this->located_at->diffInMinutes(now()) > self::POSITION_FRESH_MINUTES) {
            return null;
        }

        return [
            'lat' => $this->last_latitude_e6 / 1_000_000,
            'lng' => $this->last_longitude_e6 / 1_000_000,
            'at' => $this->located_at->toIso8601String(),
        ];
    }

    /**
     * Named explicitly, because Laravel guesses `Database\Factories\…`
     * from the model's namespace and a module's factories are not there.
     */
    protected static function newFactory(): CourierFactory
    {
        return CourierFactory::new();
    }
}

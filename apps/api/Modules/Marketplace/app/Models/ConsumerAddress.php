<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Where a marketplace customer wants their food.
 *
 * Tenant-free for the same reason as {@see Consumer}, which is named in
 * `ModuleBoundaryTest` with the full argument: an address book split by
 * restaurant is an address book typed in again at every restaurant. The owning
 * consumer is the only scope, and it is enforced by reading through the
 * relation rather than by looking an id up.
 *
 * The coordinates are integer microdegrees, like the storefront's — the same
 * reason: this platform keeps no floats where an integer is exact.
 *
 * @property int $id
 * @property int $consumer_id
 * @property string $label
 * @property string $address
 * @property string|null $note
 * @property int|null $latitude_e6
 * @property int|null $longitude_e6
 * @property bool $is_default
 * @property int $sort_order
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|ConsumerAddress newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|ConsumerAddress newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|ConsumerAddress query()
 *
 * @mixin \Eloquent
 */
final class ConsumerAddress extends Model
{
    protected $table = 'marketplace.consumer_addresses';

    /** @var list<string> */
    protected $fillable = [
        'consumer_id', 'label', 'address', 'note',
        'latitude_e6', 'longitude_e6', 'is_default', 'sort_order',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'sort_order' => 'integer',
            'latitude_e6' => 'integer',
            'longitude_e6' => 'integer',
        ];
    }

    /** @return BelongsTo<Consumer, $this> */
    public function consumer(): BelongsTo
    {
        return $this->belongsTo(Consumer::class, 'consumer_id');
    }

    public function latitude(): ?float
    {
        return $this->latitude_e6 === null ? null : $this->latitude_e6 / 1_000_000;
    }

    public function longitude(): ?float
    {
        return $this->longitude_e6 === null ? null : $this->longitude_e6 / 1_000_000;
    }
}

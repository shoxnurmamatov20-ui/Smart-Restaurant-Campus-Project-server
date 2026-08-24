<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\CustomerAddressFactory;

/**
 * Where a courier is told to go.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $customer_id
 * @property string $label
 * @property string $line
 * @property string|null $entrance
 * @property string|null $floor
 * @property string|null $flat
 * @property string|null $note
 * @property string|null $lat
 * @property string|null $lng
 * @property bool $is_default
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Customer|null $customer
 * @property-read Tenant|null $tenant
 * @property-read string $full_line
 *
 * @method static \Modules\Crm\Database\Factories\CustomerAddressFactory factory($count = null, $state = [])
 * @method static Builder<static>|CustomerAddress newModelQuery()
 * @method static Builder<static>|CustomerAddress newQuery()
 * @method static Builder<static>|CustomerAddress onlyTrashed()
 * @method static Builder<static>|CustomerAddress query()
 * @method static Builder<static>|CustomerAddress withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|CustomerAddress withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class CustomerAddress extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CustomerAddressFactory> */
    use HasFactory;

    use SoftDeletes;

    protected $table = 'crm.customer_addresses';

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'label',
        'line',
        'entrance',
        'floor',
        'flat',
        'note',
        'lat',
        'lng',
        'is_default',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            // Deliberately NOT cast to float. A decimal cast keeps the string,
            // which is what goes to a map SDK and what came out of one; turning
            // 41.3111111 into a float and back is how the seventh decimal — a
            // centimetre and a bit — becomes a different number in a diff.
            'lat' => 'decimal:7',
            'lng' => 'decimal:7',
        ];
    }

    protected static function newFactory(): CustomerAddressFactory
    {
        return CustomerAddressFactory::new();
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * The whole address on one line, the way a courier's screen shows it.
     *
     * Assembled here rather than in each of the four clients that draw it: the
     * order of the three door details is not obvious (entrance, then floor,
     * then flat — the order somebody actually walks them) and four surfaces
     * guessing separately is four different orders.
     */
    public function fullLine(): string
    {
        $parts = array_filter([
            $this->line,
            $this->entrance === null ? null : $this->entrance.'-podyezd',
            $this->floor === null ? null : $this->floor.'-qavat',
            $this->flat === null ? null : $this->flat.'-xonadon',
        ], static fn (?string $part): bool => $part !== null && trim($part) !== '');

        return implode(', ', $parts);
    }

    /**
     * Make this the one the app opens on, and make sure it is the only one.
     *
     * The unset runs first and inside the caller's transaction: the database
     * holds a partial unique index on one default per guest, so promoting a
     * second address without demoting the first is refused rather than
     * silently accepted — which is the behaviour that makes this method the
     * only correct way to do it.
     */
    public function makeDefault(): void
    {
        self::query()
            ->where('customer_id', $this->customer_id)
            ->whereKeyNot($this->getKey())
            ->where('is_default', true)
            ->update(['is_default' => false]);

        $this->forceFill(['is_default' => true])->save();
    }
}

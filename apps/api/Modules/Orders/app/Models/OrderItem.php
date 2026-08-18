<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Orders\Database\Factories\OrderItemFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One line on a bill — a snapshot, not a live reference to the menu.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $order_id
 * @property int|null $menu_item_id Menu module id, no FK on purpose
 * @property string $sku
 * @property string $title Dish name as printed on the bill
 * @property string $station
 * @property int $quantity
 * @property int $unit_price Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $total_price Amount in tiyin (1 UZS = 100 tiyin)
 * @property string $status pending
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Order|null $order
 * @property-read Tenant|null $tenant
 * @property-read float $total_uzs
 *
 * @method static \Modules\Orders\Database\Factories\OrderItemFactory factory($count = null, $state = [])
 * @method static Builder<static>|OrderItem newModelQuery()
 * @method static Builder<static>|OrderItem newQuery()
 * @method static Builder<static>|OrderItem ofStation(string $station)
 * @method static Builder<static>|OrderItem onlyTrashed()
 * @method static Builder<static>|OrderItem pending()
 * @method static Builder<static>|OrderItem query()
 * @method static Builder<static>|OrderItem whereCreatedAt($value)
 * @method static Builder<static>|OrderItem whereDeletedAt($value)
 * @method static Builder<static>|OrderItem whereId($value)
 * @method static Builder<static>|OrderItem whereMenuItemId($value)
 * @method static Builder<static>|OrderItem whereNote($value)
 * @method static Builder<static>|OrderItem whereOrderId($value)
 * @method static Builder<static>|OrderItem whereQuantity($value)
 * @method static Builder<static>|OrderItem whereSku($value)
 * @method static Builder<static>|OrderItem whereStation($value)
 * @method static Builder<static>|OrderItem whereStatus($value)
 * @method static Builder<static>|OrderItem whereTenantId($value)
 * @method static Builder<static>|OrderItem whereTitle($value)
 * @method static Builder<static>|OrderItem whereTotalPrice($value)
 * @method static Builder<static>|OrderItem whereUnitPrice($value)
 * @method static Builder<static>|OrderItem whereUpdatedAt($value)
 * @method static Builder<static>|OrderItem withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|OrderItem withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class OrderItem extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<OrderItemFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'orders.order_items';

    public const STATUSES = ['pending', 'cooking', 'ready', 'served', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'order_id',
        'menu_item_id',
        'sku',
        'title',
        'station',
        'quantity',
        'unit_price',
        'total_price',
        'status',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'integer',
            'total_price' => 'integer',
        ];
    }

    protected static function newFactory(): OrderItemFactory
    {
        return OrderItemFactory::new();
    }

    // ============ Relationships ============

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    // ============ Accessors ============

    protected function totalUzs(): Attribute
    {
        return Attribute::get(fn (): float => round($this->total_price / 100, 2));
    }

    // ============ Scopes ============

    public function scopeOfStation(Builder $query, string $station): Builder
    {
        return $query->where('station', $station);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->whereIn('status', ['pending', 'cooking']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'order_id', 'sku', 'quantity', 'unit_price', 'total_price', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('orders.order_item');
    }
}

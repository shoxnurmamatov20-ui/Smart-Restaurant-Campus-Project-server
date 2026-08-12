<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Orders\Database\Factories\OrderItemFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One line on a bill — a snapshot, not a live reference to the menu.
 *
 * @method static OrderItemFactory factory(int $count = null, array $state = [])
 */
final class OrderItem extends Model
{
    /** @use HasFactory<OrderItemFactory> */
    use BelongsToTenant;

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

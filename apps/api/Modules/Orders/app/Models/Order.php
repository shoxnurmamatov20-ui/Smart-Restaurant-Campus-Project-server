<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Support\Events\EventBus;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Orders\Database\Factories\OrderFactory;
use Modules\Orders\Events\OrderPaid;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A single bill, whatever channel it came from.

 * Cross-module references (restaurant_table_id, customer_id) are stored as
 * plain IDs without a foreign key: modules own their own schema, and a hard FK
 * would make Orders undeployable without Tables. The denormalised
 * `table_label` is a snapshot so a renamed table never rewrites history.
 *
 * @method static OrderFactory factory(int $count = null, array $state = [])
 */
final class Order extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<OrderFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'orders.orders';

    public const CHANNELS = ['dine_in', 'takeaway', 'delivery', 'aggregator'];

    public const STATUSES = ['draft', 'placed', 'in_kitchen', 'ready', 'served', 'on_the_way', 'delivered', 'paid', 'cancelled'];

    public const OPEN_STATUSES = ['draft', 'placed', 'in_kitchen', 'ready', 'served', 'on_the_way'];

    protected $fillable = [
        'tenant_id',
        'number',
        'channel',
        'status',
        'restaurant_table_id',
        'table_label',
        'waiter_user_id',
        'customer_id',
        'guests_count',
        'subtotal',
        'discount_total',
        'service_charge',
        'total',
        'placed_at',
        'closed_at',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'placed_at' => 'datetime',
            'closed_at' => 'datetime',
            'guests_count' => 'integer',
            'subtotal' => 'integer',
            'discount_total' => 'integer',
            'service_charge' => 'integer',
            'total' => 'integer',
        ];
    }

    protected static function newFactory(): OrderFactory
    {
        return OrderFactory::new();
    }

    // ============ Relationships ============

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    // ============ Accessors ============

    protected function totalUzs(): Attribute
    {
        return Attribute::get(fn (): float => round($this->total / 100, 2));
    }

    protected function isOpen(): Attribute
    {
        return Attribute::get(fn (): bool => in_array($this->status, self::OPEN_STATUSES, true));
    }

    // ============ Domain behaviour ============

    /**
     * Recalculate money from the lines.
     *
     * Always derive the total from the items rather than trusting a client to
     * send it — the bill a guest pays must equal what was actually ordered.
     */
    public function recalculateTotals(): self
    {
        $subtotal = (int) $this->items()->sum('total_price');
        $total = max(0, $subtotal - $this->discount_total + $this->service_charge);

        $this->forceFill(['subtotal' => $subtotal, 'total' => $total])->save();

        return $this;
    }

    /**
     * Move the order forward. Returns false on an illegal jump instead of
     * throwing, so a double-tap in the POS is a no-op rather than a 500.
     */
    public function transitionTo(string $status): bool
    {
        if (! in_array($status, self::STATUSES, true)) {
            return false;
        }

        if (in_array($this->status, ['paid', 'cancelled'], true)) {
            return false; // closed bills are immutable
        }

        $attributes = ['status' => $status];

        if ($status === 'placed' && $this->placed_at === null) {
            $attributes['placed_at'] = now();
        }

        if (in_array($status, ['paid', 'cancelled'], true)) {
            $attributes['closed_at'] = now();
        }

        if (! $this->update($attributes)) {
            return false;
        }

        if ($status === 'paid') {
            // Announced, not acted on: Orders does not know that loyalty,
            // analytics or the floor plan care about a settled bill. The outbox
            // row is written in the same transaction as the status change, so
            // the two cannot disagree.
            app(EventBus::class)->publish(new OrderPaid($this));
        }

        return true;
    }

    public function cancel(?string $reason = null): bool
    {
        if (in_array($this->status, ['paid', 'cancelled'], true)) {
            return false;
        }

        return $this->update([
            'status' => 'cancelled',
            'closed_at' => now(),
            'note' => trim(($this->note ?? '').' | Bekor qilindi: '.($reason ?? '—')),
        ]);
    }

    /** Next free bill number for this restaurant, e.g. A-1042. */
    public static function nextNumber(): string
    {
        $last = self::withTrashed()->max('id');

        return sprintf('A-%04d', ((int) $last) + 1);
    }

    // ============ Scopes ============

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', self::OPEN_STATUSES);
    }

    public function scopeOfChannel(Builder $query, string $channel): Builder
    {
        return $query->where('channel', $channel);
    }

    /**
     * Bills from the restaurant's current trading day.
     *
     * The trading day, not the calendar day: a table that settles at 01:30
     * belongs to the evening that is closing, not to the morning that follows.
     */
    public function scopeToday(Builder $query): Builder
    {
        $businessDay = app(BusinessDay::class);

        return $businessDay->constrain($query, 'created_at', $businessDay->window());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'number', 'channel', 'status', 'restaurant_table_id', 'total', 'placed_at', 'closed_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('orders.order');
    }
}

<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use App\Support\Events\EventBus;
use App\Support\Orders\OrderState;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Orders\Database\Factories\OrderFactory;
use Modules\Orders\Events\OrderPaid;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A single bill, whatever channel it came from.
 *
 * Cross-module references (restaurant_table_id, customer_id) are stored as
 * plain IDs without a foreign key: modules own their own schema, and a hard FK
 * would make Orders undeployable without Tables. The denormalised
 * `table_label` is a snapshot so a renamed table never rewrites history.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $number Human-facing bill number, unique per tenant
 * @property string $channel dine_in
 * @property string $status
 * @property int|null $restaurant_table_id Tables module id, no FK on purpose
 * @property string|null $table_label Snapshot at order time
 * @property int|null $waiter_user_id
 * @property int|null $customer_id CRM module id, no FK on purpose
 * @property int $guests_count
 * @property int $subtotal Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $discount_total Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $service_charge Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $total Amount in tiyin (1 UZS = 100 tiyin)
 * @property Carbon|null $placed_at
 * @property Carbon|null $closed_at
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read bool $is_open
 * @property-read Collection<int, OrderItem> $items
 * @property-read int|null $items_count
 * @property-read Tenant|null $tenant
 * @property-read float $total_uzs
 *
 * @method static \Modules\Orders\Database\Factories\OrderFactory factory($count = null, $state = [])
 * @method static Builder<static>|Order newModelQuery()
 * @method static Builder<static>|Order newQuery()
 * @method static Builder<static>|Order ofChannel(string $channel)
 * @method static Builder<static>|Order onlyTrashed()
 * @method static Builder<static>|Order open()
 * @method static Builder<static>|Order query()
 * @method static Builder<static>|Order today()
 * @method static Builder<static>|Order whereBranchId($value)
 * @method static Builder<static>|Order whereChannel($value)
 * @method static Builder<static>|Order whereClosedAt($value)
 * @method static Builder<static>|Order whereCreatedAt($value)
 * @method static Builder<static>|Order whereCustomerId($value)
 * @method static Builder<static>|Order whereDeletedAt($value)
 * @method static Builder<static>|Order whereDiscountTotal($value)
 * @method static Builder<static>|Order whereGuestsCount($value)
 * @method static Builder<static>|Order whereId($value)
 * @method static Builder<static>|Order whereNote($value)
 * @method static Builder<static>|Order whereNumber($value)
 * @method static Builder<static>|Order wherePlacedAt($value)
 * @method static Builder<static>|Order whereRestaurantTableId($value)
 * @method static Builder<static>|Order whereServiceCharge($value)
 * @method static Builder<static>|Order whereStatus($value)
 * @method static Builder<static>|Order whereSubtotal($value)
 * @method static Builder<static>|Order whereTableLabel($value)
 * @method static Builder<static>|Order whereTenantId($value)
 * @method static Builder<static>|Order whereTotal($value)
 * @method static Builder<static>|Order whereUpdatedAt($value)
 * @method static Builder<static>|Order whereWaiterUserId($value)
 * @method static Builder<static>|Order withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Order withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Order extends Model
{
    use BelongsToBranch, HasBusinessDate;
    use BelongsToTenant;

    /** @use HasFactory<OrderFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    /** The trading day for this row is taken from `placed_at`. */
    protected static function businessDateSource(): string
    {
        return 'placed_at';
    }

    protected $table = 'orders.orders';

    public const CHANNELS = ['dine_in', 'takeaway', 'delivery', 'aggregator'];

    /**
     * The canonical ladder, defined once in App\Support\Orders\OrderState and
     * mirrored in packages/i18n so the four surfaces that render it cannot
     * drift from the API that emits it. Kept as a constant because Eloquent
     * validation rules and a hundred call sites read it as an array of strings.
     *
     * @var list<string>
     */
    public const STATUSES = [
        'draft', 'placed', 'accepted', 'cooking', 'ready', 'served',
        'enroute', 'handed', 'topay', 'paid', 'voided', 'refunded', 'comped',
    ];

    /** @var list<string> */
    public const OPEN_STATUSES = [
        'draft', 'placed', 'accepted', 'cooking', 'ready', 'served',
        'enroute', 'handed', 'topay',
    ];

    protected $fillable = [
        'business_date',
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
            'business_date' => 'date',
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
     *
     * The ladder is now enforced, not merely listed. Before this, any value in
     * STATUSES was accepted from any other, so a bill could go from `draft`
     * straight to `paid` with no kitchen ticket ever existing — the only thing
     * stopping it was that no screen offered the button. A client is not a
     * safeguard.
     */
    public function transitionTo(string $status): bool
    {
        $next = OrderState::tryFrom($status);
        $current = OrderState::tryFrom($this->status);

        if ($next === null || $current === null) {
            return false;
        }

        if (! $current->canMoveTo($next)) {
            return false;
        }

        $attributes = ['status' => $status];

        if ($status === 'placed' && $this->placed_at === null) {
            $attributes['placed_at'] = now();
        }

        if ($next->isTerminal()) {
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

    /**
     * Void a bill: nothing was paid, so nothing moves back.
     *
     * DECISIONS Q8 keeps this apart from a refund (money returns, revenue goes
     * negative) and a comp (money never moved, stock was consumed, and the
     * cost books as marketing). They used to be one `cancelled` value, which
     * made the loss-prevention screen and the P&L both wrong.
     */
    public function cancel(?string $reason = null): bool
    {
        $current = OrderState::tryFrom($this->status);

        if ($current === null || ! $current->canMoveTo(OrderState::Voided)) {
            return false;
        }

        return $this->update([
            'status' => OrderState::Voided->value,
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

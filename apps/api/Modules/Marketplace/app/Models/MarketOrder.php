<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Marketplace\Database\Factories\MarketOrderFactory;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * One order, placed on the marketplace and cooked in a restaurant's kitchen.
 *
 * Named `MarketOrder` rather than `Order` on purpose: `Modules\Orders\Models\Order`
 * is the bill, and two classes called Order in one codebase is a mistake waiting
 * for the first person who imports the wrong one. This row is the marketplace's
 * record of the transaction; the bill it opens in Orders when the merchant
 * accepts is a different thing with a different lifecycle, joined by `bill_id`.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property Carbon|null $business_date
 * @property string $number
 * @property int $consumer_id
 * @property int $store_id
 * @property int|null $courier_id
 * @property string|null $client_reference
 * @property string $state
 * @property int $subtotal_tiyin
 * @property int $discount_tiyin
 * @property int $service_fee_tiyin
 * @property int $delivery_fee_tiyin
 * @property int $total_tiyin
 * @property int $commission_tiyin
 * @property int $merchant_due_tiyin
 * @property int $commission_percent
 * @property int $service_percent
 * @property string|null $promo_code
 * @property string $pay_rail
 * @property Carbon|null $paid_at
 * @property string $address
 * @property string|null $address_note
 * @property int|null $bill_id
 * @property int|null $settlement_id
 * @property int|null $rating
 * @property string|null $rating_comment
 * @property int|null $eta_minutes
 * @property Carbon|null $placed_at
 * @property Carbon|null $accepted_at
 * @property Carbon|null $cooking_at
 * @property Carbon|null $ready_at
 * @property Carbon|null $courier_assigned_at
 * @property Carbon|null $enroute_at
 * @property Carbon|null $delivered_at
 * @property Carbon|null $cancelled_at
 * @property Carbon|null $rated_at
 * @property int|null $latitude_e6
 * @property int|null $longitude_e6
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property string|null $cancel_reason
 * @property string|null $reject_reason
 * @property-read Store|null $store
 * @property-read Consumer|null $consumer
 * @property-read Courier|null $courier
 *
 * @method static \Modules\Marketplace\Database\Factories\MarketOrderFactory factory($count = null, $state = [])
 * @method static Builder<static>|MarketOrder newModelQuery()
 * @method static Builder<static>|MarketOrder newQuery()
 * @method static Builder<static>|MarketOrder query()
 * @method static Builder<static>|MarketOrder waiting()
 *
 * @mixin \Eloquent
 */
final class MarketOrder extends Model
{
    /** @use HasFactory<MarketOrderFactory> */
    use BelongsToBranch, BelongsToTenant, HasBusinessDate, HasFactory, SoftDeletes;

    protected $table = 'marketplace.orders';

    /** What the guest pays the platform for running it — `MARKETPLACE_SERVICE_PERCENT`. */
    public const DEFAULT_SERVICE_PERCENT = 3;

    /**
     * How long a merchant has to answer a new order.
     *
     * Ninety seconds, which is what the merchant panel's queue counts down and
     * what the consumer's screen promises. A number both sides read, so it lives
     * where both can read it.
     */
    public const ACCEPT_SECONDS = 90;

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'branch_id', 'business_date', 'number', 'consumer_id', 'store_id',
        'courier_id', 'client_reference', 'state',
        'subtotal_tiyin', 'discount_tiyin', 'service_fee_tiyin', 'delivery_fee_tiyin', 'total_tiyin',
        'commission_tiyin', 'merchant_due_tiyin', 'commission_percent', 'service_percent',
        'promo_code', 'pay_rail', 'paid_at',
        'address', 'address_note', 'latitude_e6', 'longitude_e6',
        'bill_id', 'settlement_id', 'rating', 'rating_comment', 'rated_at', 'eta_minutes',
        'placed_at', 'accepted_at', 'cooking_at', 'ready_at', 'courier_assigned_at',
        'enroute_at', 'delivered_at', 'cancelled_at', 'cancel_reason', 'reject_reason',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'paid_at' => 'datetime',
            'rated_at' => 'datetime',
            'placed_at' => 'datetime',
            'accepted_at' => 'datetime',
            'cooking_at' => 'datetime',
            'ready_at' => 'datetime',
            'courier_assigned_at' => 'datetime',
            'enroute_at' => 'datetime',
            'delivered_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'subtotal_tiyin' => 'integer',
            'discount_tiyin' => 'integer',
            'service_fee_tiyin' => 'integer',
            'delivery_fee_tiyin' => 'integer',
            'total_tiyin' => 'integer',
            'commission_tiyin' => 'integer',
            'merchant_due_tiyin' => 'integer',
            'commission_percent' => 'integer',
            'service_percent' => 'integer',
            'rating' => 'integer',
            'eta_minutes' => 'integer',
        ];
    }

    /** The trading day is when the guest ordered, not when the row appeared. */
    protected static function businessDateSource(): string
    {
        return 'placed_at';
    }

    /** The public number, never the id — an id is a counter somebody can walk. */
    public function getRouteKeyName(): string
    {
        return 'number';
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    /** @return BelongsTo<Consumer, $this> */
    public function consumer(): BelongsTo
    {
        return $this->belongsTo(Consumer::class, 'consumer_id');
    }

    /** @return BelongsTo<Courier, $this> */
    public function courier(): BelongsTo
    {
        return $this->belongsTo(Courier::class, 'courier_id');
    }

    /** @return HasMany<MarketOrderLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(MarketOrderLine::class, 'order_id');
    }

    /**
     * At most one — the unique index on `(tenant_id, order_id)` says so.
     *
     * @return HasOne<Dispute, $this>
     */
    public function dispute(): HasOne
    {
        return $this->hasOne(Dispute::class, 'order_id');
    }

    public function state(): MarketOrderState
    {
        return MarketOrderState::from($this->state);
    }

    /**
     * The merchant's ninety-second queue.
     *
     * @param Builder<MarketOrder> $query
     */
    public function scopeWaiting(Builder $query): void
    {
        $query->where('state', MarketOrderState::Placed->value)->orderBy('placed_at');
    }

    /**
     * The next number on the platform, `MP-8421`.
     *
     * Platform-wide rather than per restaurant, and that is the difference from
     * `Order::nextNumber()` one module over. A guest reads this number to a call
     * centre that answers for forty restaurants; two of them sharing `MP-4471`
     * makes the first question unanswerable.
     *
     * Taken from a sequence rather than `max(id) + 1`: two guests checking out in
     * the same second both read the same maximum, and the loser's insert fails
     * on the unique index — which is a 500 on the one request that must not fail.
     */
    public static function nextNumber(): string
    {
        /*
         * The sequence backing the primary key is the counter. Reusing it costs
         * nothing, needs no second object to create and drop, and cannot fall
         * behind the table it numbers. Gaps are fine: a number is an identifier,
         * not a count.
         */
        $next = DB::selectOne("select nextval(pg_get_serial_sequence('marketplace.orders', 'id')) as n");

        return 'MP-'.str_pad((string) ($next->n ?? 1), 4, '0', STR_PAD_LEFT);
    }

    /**
     * Seconds the merchant has left to answer, or null when the clock is not
     * running.
     *
     * Counted from `placed_at` against the application's clock rather than the
     * database's — `ModuleBoundaryTest` refuses raw SQL `now()`, because a
     * replica or a pooler may sit in a different timezone and the answer would
     * silently be five hours out.
     */
    public function secondsToAnswer(): ?int
    {
        if ($this->state !== MarketOrderState::Placed->value || $this->placed_at === null) {
            return null;
        }

        return max(0, self::ACCEPT_SECONDS - (int) $this->placed_at->diffInSeconds(now()));
    }

    /**
     * When the food should arrive.
     *
     * From the moment it was accepted, because before that nobody has agreed to
     * cook it and a countdown against an unanswered order promises something no
     * kitchen has heard about.
     */
    public function estimatedAt(): ?Carbon
    {
        if ($this->accepted_at === null || $this->eta_minutes === null) {
            return null;
        }

        return $this->accepted_at->copy()->addMinutes($this->eta_minutes);
    }

    /**
     * The trading day this order belongs to, for a settlement period.
     *
     * Through `BusinessDay` rather than `whereDate()`: the latter wraps the
     * column in a function and loses the index on the table that grows fastest,
     * and `ModuleBoundaryTest` refuses it by name.
     *
     * @param Builder<MarketOrder> $query
     */
    public function scopeBetweenTradingDays(Builder $query, string $from, string $to): void
    {
        $query->whereBetween('business_date', [
            app(BusinessDay::class)->dateFor(Carbon::parse($from)->toImmutable()),
            app(BusinessDay::class)->dateFor(Carbon::parse($to)->toImmutable()),
        ]);
    }

    /**
     * Named explicitly, because Laravel guesses `Database\Factories\…`
     * from the model's namespace and a module's factories are not there.
     */
    protected static function newFactory(): MarketOrderFactory
    {
        return MarketOrderFactory::new();
    }
}

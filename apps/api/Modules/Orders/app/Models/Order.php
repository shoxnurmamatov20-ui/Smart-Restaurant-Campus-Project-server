<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Counters\BranchCounters;
use App\Support\Events\EventBus;
use App\Support\Orders\BillTotals;
use App\Support\Orders\OrderChannel;
use App\Support\Orders\OrderState;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Orders\Database\Factories\OrderFactory;
use Modules\Orders\Events\OrderMoved;
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
 * @property int $vat_included Amount in tiyin, already inside `total`
 * @property int $delivery_fee Amount in tiyin, outside the VAT base
 * @property Carbon|null $placed_at
 * @property Carbon|null $closed_at
 * @property string|null $customer_name Snapshot: who ordered, as they gave it
 * @property string|null $customer_phone Snapshot, normalised to digits only
 * @property string|null $delivery_address
 * @property string|null $delivery_note
 * @property string|null $delivery_lat
 * @property string|null $delivery_lng
 * @property string|null $payment_method cash|card_on_delivery|online
 * @property string|null $payment_state pending|due|paid — not a ladder rung
 * @property string|null $promo_code Recorded, never trusted — see the migration
 * @property string|null $source web|app|telegram|qr|pos|aggregator
 * @property string|null $intake_channel phone|telegram|site|yandex|uzum|wolt
 * @property int|null $operator_user_id Who took the call, not who carries the tray
 * @property Carbon|null $scheduled_for What the guest asked for. Null = as soon as possible
 * @property int|null $split_parent_id The bill this share was cut from
 * @property int|null $split_share_total Tiyin — a fixed slice of a money split
 * @property Carbon|null $promised_at What the guest was told, frozen
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read bool $is_open
 * @property-read Delivery|null $delivery
 * @property-read Collection<int, Delivery> $deliveries
 * @property-read int|null $deliveries_count
 * @property-read Collection<int, OrderItem> $items
 * @property-read User|null $waiter
 * @property-read User|null $operator
 * @property-read Collection<int, Order> $splitShares
 * @property-read bool $is_split
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
     * The six lanes an order can arrive down, as the operator's screen draws them.
     *
     * Not the same axis as `channel` (how the food travels) or `source` (which
     * app posted it): this is WHICH CONVERSATION it was. Three of the six are
     * aggregators, and they are named individually because each is a separate
     * contract with a separate commission — folded into one `aggregator` they
     * are unbillable. See the migration.
     *
     * @var list<string>
     */
    public const INTAKE_CHANNELS = ['phone', 'telegram', 'site', 'yandex', 'uzum', 'wolt'];

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
        'vat_included',
        'delivery_fee',
        'total',
        'placed_at',
        'closed_at',
        'note',
        // What a guest ordering from their own phone gives us, snapshotted onto
        // the bill. See the migration for why the phone lives here as well as
        // in CRM.
        'customer_name',
        'customer_phone',
        'delivery_address',
        'delivery_note',
        'delivery_lat',
        'delivery_lng',
        'payment_method',
        'payment_state',
        'promo_code',
        'source',
        'promised_at',
        // The intake desk's three columns — see the migration for why none of
        // them can be derived from `source` or from `waiter_user_id`.
        'intake_channel',
        'operator_user_id',
        'scheduled_for',
        // A money split's two. Written only by BillRegistry::splitEvenly() and
        // splitAmount(); nothing else has any business setting them.
        'split_parent_id',
        'split_share_total',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'placed_at' => 'datetime',
            'closed_at' => 'datetime',
            'promised_at' => 'datetime',
            'scheduled_for' => 'datetime',
            'guests_count' => 'integer',
            'split_share_total' => 'integer',
            'subtotal' => 'integer',
            'discount_total' => 'integer',
            'service_charge' => 'integer',
            'vat_included' => 'integer',
            'delivery_fee' => 'integer',
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

    /**
     * The rider carrying this one, if anybody is.
     *
     * `hasOne` and not `hasMany`, because the partial unique index in
     * `2026_08_22_091000` allows exactly one LIVE delivery per order. A failed
     * drop that was redelivered leaves two rows, so the newest wins — which is
     * the one a tracking screen and a dispatch board both mean by "the
     * courier".
     */
    public function delivery(): HasOne
    {
        return $this->hasOne(Delivery::class, 'order_id')->latestOfMany();
    }

    /**
     * Every trip this order has been on, including the one that failed.
     *
     * Exists so the dispatch board can ask "has this got a LIVE rider" — a
     * question `delivery()` cannot answer, because `latestOfMany()` is a
     * subquery and `whereDoesntHave` over it would compile to something
     * PostgreSQL plans badly and a reader cannot predict.
     */
    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class, 'order_id');
    }

    /**
     * Whose table this is.
     *
     * `App\Models\User` rather than a Staff model, and that is not a shortcut:
     * a waiter is a person with a login, and `waiter_user_id` has always pointed
     * at `public.users`. Staff owns the rota and the attendance, not the identity.
     *
     * It exists so a list of orders can name the waiter instead of numbering
     * them. The console's table drew "—" in that column and said why: resolving
     * the id per row is twenty-five lookups to fill one column, and the right
     * place for the join is the endpoint. This is that place.
     */
    public function waiter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'waiter_user_id');
    }

    /**
     * Who took the order at the intake desk.
     *
     * A different person from the waiter and a different question: the operator
     * is measured on how fast the phone was answered, the waiter on the table.
     * A dine-in bill has a waiter and no operator; a phone order has an operator
     * and, until it is seated, no waiter at all.
     */
    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_user_id');
    }

    /**
     * The other bills this one was divided into, oldest first.
     *
     * Only ever populated on the parent of a money split — see the migration.
     * The order matters: a receipt prints "2/4", and 2 is a position in this
     * list rather than a number stored anywhere.
     */
    public function splitShares(): HasMany
    {
        return $this->hasMany(self::class, 'split_parent_id')->orderBy('id');
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

    /**
     * Is this bill's money a fixed slice rather than a sum of its lines?
     *
     * The one question every consumer of a split bill has to ask before it
     * trusts `subtotal + service − discount = total`, which stops being true the
     * moment a table divides the money. See the split migration.
     */
    protected function isSplit(): Attribute
    {
        return Attribute::get(fn (): bool => $this->split_share_total !== null);
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
        /*
         * The arithmetic lives in App\Support\Orders\BillTotals, not here.
         *
         * Four callers need these numbers to agree — the receipt, the fiscal
         * driver, the Z report and a guest adding up their own bill — and the
         * only way to be sure they do is for the rules to exist once. This
         * method's job is to fetch the inputs and store the outputs.
         *
         * What changed when it moved: the service charge used to be whatever a
         * caller had written into the column, so a takeaway kept a 10% charge
         * somebody had applied while the bill was still dine-in. It is now
         * derived from the channel every time — Q2 says dine-in only, and
         * "only" has to survive a bill being switched to takeaway.
         */
        /*
         * A bill divided by money keeps the figure it was given.
         *
         * Not an early return with the columns untouched — the columns have to
         * be written, or a parent whose lines changed before the split would
         * keep stale money. What it does NOT do is re-derive the total from the
         * lines: after a money split this bill is worth its share and nothing
         * else, and the lines are the record of what was eaten rather than of
         * what is owed. See the split migration for the whole rule.
         */
        if ($this->split_share_total !== null) {
            $share = (int) $this->split_share_total;

            $this->forceFill([
                'subtotal' => (int) $this->items()->sum('total_price'),
                // Read out of the share, never added to it — Q1 again. A slice
                // of a VAT-inclusive total is itself VAT-inclusive.
                'vat_included' => (int) round($share * $this->vatPercent() / (100 + $this->vatPercent())),
                'total' => $share,
            ])->save();

            return $this;
        }

        // A plain sum, because a cancelled line already carries total_price 0 —
        // voidLine zeroes it so the line stays readable while the bill is right.
        // Filtering by status here would be a second rule saying the same thing,
        // and two rules about money is one too many.
        $totals = BillTotals::of(
            subtotal: (int) $this->items()->sum('total_price'),
            channel: OrderChannel::tryFrom((string) $this->channel) ?? OrderChannel::DineIn,
            discount: (int) $this->discount_total,
            deliveryFee: (int) ($this->delivery_fee ?? 0),
            servicePercent: $this->servicePercent(),
            vatPercent: $this->vatPercent(),
        );

        $this->forceFill([
            'subtotal' => $totals->subtotal,
            'service_charge' => $totals->serviceCharge,
            'vat_included' => $totals->vat,
            'total' => $totals->total,
        ])->save();

        return $this;
    }

    /**
     * The restaurant's own service-charge rate.
     *
     * Per tenant because it is a commercial decision, not a platform one: a
     * canteen charges nothing and a restaurant with waiters charges ten.
     *
     * Zero when unset, and that default is deliberate. Ten was tried and it is
     * wrong: a restaurant that has not configured a service charge would start
     * adding one to every dine-in bill the moment this code shipped, which is
     * money nobody agreed to and the sort of line a guest photographs. The
     * seeded demo restaurant sets 10 so the demo matches the design's cart;
     * sign-up sets 0 and the owner turns it on when they mean to.
     */
    private function servicePercent(): int
    {
        /*
         * The VENUE's rate first, then the business's.
         *
         * A service charge is a property of the room — the terrace with waiters
         * charges it, the counter in the food court does not — and `Branch` has
         * carried a `setting()` helper for exactly this since it was written:
         * *"a 10% service charge on the terrace is not always the same as in the
         * hall"*. It was never consulted, so an estate with one canteen and one
         * restaurant had to be wrong about one of them.
         *
         * The design sign asked for this on the HALL, and that is the wrong
         * table: a hall is a drawing of furniture, it has no settings and no
         * money, and a bill knows its branch long before it knows which room the
         * chair is in — a takeaway has a branch and no hall at all.
         *
         * `Branch::setting()` already falls back to the tenant, so the old
         * behaviour survives for every restaurant that set the rate once at the
         * top.
         */
        $venue = $this->branch?->setting('service_charge_percent');

        return (int) ($venue ?? $this->tenant?->settings['service_charge_percent'] ?? 0);
    }

    /**
     * The VAT rate already inside the menu prices.
     *
     * Read per tenant so a rate change is a setting rather than a deploy, and
     * stored on the order once settled — see the migration that added the
     * column for why a bill must keep the rate it was rung up at.
     */
    private function vatPercent(): int
    {
        return (int) ($this->tenant?->settings['vat_percent'] ?? 12);
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

        /*
         * And every rung, including that one.
         *
         * Two events for a settled bill rather than one, because they answer
         * different questions and have different audiences: `orders.paid` is
         * "this sale is done" and is read by loyalty, analytics and the floor
         * plan; `orders.moved` is "this bill went from X to Y" and is read by
         * whoever has to TELL somebody — most of all the guest who ordered by
         * telephone and has no screen open.
         *
         * Published from here rather than from the four callers, for the reason
         * the kitchen ticket gives about its own hook: there are several methods
         * that move a bill and there will be another, and dispatching from each
         * is several chances to forget and one guest who is never told.
         */
        app(EventBus::class)->publish(new OrderMoved($this, $current->value));

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
        return $this->closeAs(OrderState::Voided, 'Bekor qilindi', $reason);
    }

    /**
     * The restaurant is paying for this one.
     *
     * Distinct from `cancel()` because the food was made. A voided bill says the
     * sale never happened; a comped one says it happened and nobody was charged.
     * Food cost computed against voided bills shows a kitchen wasting ingredients
     * on orders nobody placed, and the manager chases a theft that is a birthday
     * dessert somebody authorised.
     */
    public function comp(?string $reason = null): bool
    {
        return $this->closeAs(OrderState::Comped, 'Sovg\'a qilindi', $reason);
    }

    /**
     * The money went back.
     *
     * Only ever from `paid`. Refunding something that was never settled is a
     * cancellation wearing the wrong name, and `canMoveTo()` refuses it — which is
     * the answer, not an inconvenience: the two produce different rows in an
     * accountant's ledger and a caller that conflated them would be reporting money
     * returned that never arrived.
     */
    public function markRefunded(?string $reason = null): bool
    {
        return $this->closeAs(OrderState::Refunded, 'Qaytarildi', $reason);
    }

    /**
     * End a bill in one of its three no-money states, keeping the reason.
     *
     * One body for `cancel`, `comp` and `markRefunded`, because they differ by a
     * state and a word and nothing else — and three copies of "check the ladder,
     * stamp closed_at, append the reason" is three places for the note handling to
     * drift. The reason is appended rather than replacing `note`: a waiter's
     * original note is what the reason is usually about.
     */
    private function closeAs(OrderState $target, string $label, ?string $reason): bool
    {
        $current = OrderState::tryFrom($this->status);

        if ($current === null || ! $current->canMoveTo($target)) {
            return false;
        }

        return $this->update([
            'status' => $target->value,
            'closed_at' => now(),
            'note' => trim(($this->note ?? '').' | '.$label.': '.($reason ?? '—')),
        ]);
    }

    /** Next free bill number for this restaurant, e.g. A-1042. */
    /**
     * The next human-facing bill number, taken from the tenant's counter.
     *
     * This was `max(id) + 1`: two simultaneous opens read the same max and one
     * died on the unique index, and the id sequence is global so one tenant's
     * volume made another's numbers jump. The counter is atomic per tenant —
     * see BranchCounters for the guarantee and its price.
     */
    public static function nextNumber(): string
    {
        return sprintf('A-%04d', app(BranchCounters::class)->next('order.number'));
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

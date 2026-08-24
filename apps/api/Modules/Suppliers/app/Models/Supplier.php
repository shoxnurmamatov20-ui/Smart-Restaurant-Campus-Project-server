<?php

declare(strict_types=1);

namespace Modules\Suppliers\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Suppliers\Database\Factories\SupplierFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A company the restaurant buys from.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $code
 * @property string $name
 * @property string $category meat | poultry | dairy | produce | dry | beverages | other
 * @property string|null $contact_name
 * @property string|null $phone
 * @property string|null $email
 * @property int $payment_terms_days 0 = pay on delivery
 * @property int $lead_time_days Days from sending an order to it arriving
 * @property int $rating 1..5, based on lateness and quality
 * @property Carbon|null $last_delivery_at
 * @property int $debt What we still owe, in tiyin
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, PurchaseOrder> $purchaseOrders
 * @property-read int|null $purchase_orders_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Supplier active()
 * @method static Builder<static>|Supplier ofCategory(string $category)
 * @method static \Modules\Suppliers\Database\Factories\SupplierFactory factory($count = null, $state = [])
 * @method static Builder<static>|Supplier inDebt()
 * @method static Builder<static>|Supplier newModelQuery()
 * @method static Builder<static>|Supplier newQuery()
 * @method static Builder<static>|Supplier onlyTrashed()
 * @method static Builder<static>|Supplier query()
 * @method static Builder<static>|Supplier whereCategory($value)
 * @method static Builder<static>|Supplier whereCode($value)
 * @method static Builder<static>|Supplier whereLastDeliveryAt($value)
 * @method static Builder<static>|Supplier whereLeadTimeDays($value)
 * @method static Builder<static>|Supplier whereContactName($value)
 * @method static Builder<static>|Supplier whereCreatedAt($value)
 * @method static Builder<static>|Supplier whereDebt($value)
 * @method static Builder<static>|Supplier whereDeletedAt($value)
 * @method static Builder<static>|Supplier whereEmail($value)
 * @method static Builder<static>|Supplier whereId($value)
 * @method static Builder<static>|Supplier whereIsActive($value)
 * @method static Builder<static>|Supplier whereName($value)
 * @method static Builder<static>|Supplier wherePaymentTermsDays($value)
 * @method static Builder<static>|Supplier wherePhone($value)
 * @method static Builder<static>|Supplier whereRating($value)
 * @method static Builder<static>|Supplier whereTenantId($value)
 * @method static Builder<static>|Supplier whereUpdatedAt($value)
 * @method static Builder<static>|Supplier withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Supplier withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Supplier extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<SupplierFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'suppliers.suppliers';

    /**
     * What a restaurant buys, grouped the way a buyer thinks about it.
     *
     * Validated here rather than by a database constraint: a check constraint
     * means a migration the first time a kitchen starts buying something new,
     * and the list is a convenience for filtering, not an invariant anything
     * downstream depends on.
     */
    public const CATEGORIES = ['meat', 'poultry', 'dairy', 'produce', 'dry', 'beverages', 'other'];

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'category',
        'contact_name',
        'phone',
        'email',
        'payment_terms_days',
        'lead_time_days',
        'rating',
        'last_delivery_at',
        'debt',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'payment_terms_days' => 'integer',
            'lead_time_days' => 'integer',
            'rating' => 'integer',
            'last_delivery_at' => 'datetime',
            'debt' => 'integer',
        ];
    }

    protected static function newFactory(): SupplierFactory
    {
        return SupplierFactory::new();
    }

    // ============ Relationships ============

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    // ============ Derived figures ============

    /**
     * The three columns the supplier list draws that are facts about orders,
     * not about the company.
     *
     * Subqueries rather than stored columns, and the reason is in the migration
     * note: an `on_time` column is right on the day it is written and wrong
     * every day after, with nothing on the screen to say which. Loaded here as
     * one statement for the whole page — the alternative is three queries per
     * row, which is twenty-one on a list of seven and three hundred on a real
     * chain's.
     *
     * The window on spend is a quarter, because that is what the design's
     * column says it is. `>=` on a datetime rather than `whereDate()`: the
     * latter wraps the column in a function and loses the index, and
     * ModuleBoundaryTest refuses it by name.
     */
    public function scopeWithPurchaseFigures(Builder $query, ?Carbon $quarterFrom = null): Builder
    {
        $from = $quarterFrom ?? now()->subDays(90);

        return $query
            ->withCount([
                'purchaseOrders as open_purchase_orders_count' => fn (Builder $orders) => $orders->whereIn('status', PurchaseOrder::OPEN_STATUSES),
                'purchaseOrders as deliveries_count' => fn (Builder $orders) => $orders->where('status', 'received'),
                /*
                 * On time, and an order nobody promised a date for counts as
                 * one. A supplier cannot be late for a day that was never
                 * agreed, and scoring them down for it would make the column
                 * measure our own paperwork rather than their vans.
                 */
                'purchaseOrders as on_time_deliveries_count' => fn (Builder $orders) => $orders
                    ->where('status', 'received')
                    ->where(fn (Builder $inner) => $inner
                        ->whereNull('expected_at')
                        ->orWhereColumn('received_at', '<=', 'expected_at')),
            ])
            ->withSum(
                ['purchaseOrders as quarter_spend' => fn (Builder $orders) => $orders
                    ->where('status', 'received')
                    ->where('received_at', '>=', $from)],
                'total',
            );
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOfCategory(Builder $query, string $category): Builder
    {
        return $query->where('category', $category);
    }

    public function scopeInDebt(Builder $query): Builder
    {
        return $query->where('debt', '>', 0);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'code', 'name', 'category', 'phone', 'payment_terms_days', 'lead_time_days', 'rating', 'debt', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('suppliers.supplier');
    }
}

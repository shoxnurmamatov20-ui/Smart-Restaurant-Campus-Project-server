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
 * @property string|null $contact_name
 * @property string|null $phone
 * @property string|null $email
 * @property int $payment_terms_days 0 = pay on delivery
 * @property int $rating 1..5, based on lateness and quality
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
 * @method static \Modules\Suppliers\Database\Factories\SupplierFactory factory($count = null, $state = [])
 * @method static Builder<static>|Supplier inDebt()
 * @method static Builder<static>|Supplier newModelQuery()
 * @method static Builder<static>|Supplier newQuery()
 * @method static Builder<static>|Supplier onlyTrashed()
 * @method static Builder<static>|Supplier query()
 * @method static Builder<static>|Supplier whereCode($value)
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
    /** @use HasFactory<SupplierFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'suppliers.suppliers';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'contact_name',
        'phone',
        'email',
        'payment_terms_days',
        'rating',
        'debt',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'payment_terms_days' => 'integer',
            'rating' => 'integer',
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

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeInDebt(Builder $query): Builder
    {
        return $query->where('debt', '>', 0);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'code', 'name', 'phone', 'payment_terms_days', 'rating', 'debt', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('suppliers.supplier');
    }
}

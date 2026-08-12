<?php

declare(strict_types=1);

namespace Modules\Suppliers\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Suppliers\Database\Factories\SupplierFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A company the restaurant buys from.
 *
 * @method static SupplierFactory factory(int $count = null, array $state = [])
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

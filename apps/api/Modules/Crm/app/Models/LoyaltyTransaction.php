<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Crm\Database\Factories\LoyaltyTransactionFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Immutable ledger of every point earned, spent or corrected.
 *
 * @method static LoyaltyTransactionFactory factory(int $count = null, array $state = [])
 */
final class LoyaltyTransaction extends Model
{
    /** @use HasFactory<LoyaltyTransactionFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.loyalty_transactions';

    public const KINDS = ['earn', 'redeem', 'adjust', 'expire'];

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'kind',
        'points',
        'balance_after',
        'order_id',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'balance_after' => 'integer',
        ];
    }

    protected static function newFactory(): LoyaltyTransactionFactory
    {
        return LoyaltyTransactionFactory::new();
    }

    // ============ Relationships ============

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    // ============ Scopes ============

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'customer_id', 'kind', 'points', 'balance_after'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.loyalty_transaction');
    }
}

<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\LoyaltyTransactionFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Immutable ledger of every point earned, spent or corrected.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $customer_id
 * @property string $kind earn
 * @property int $points Signed
 * @property int $balance_after
 * @property int|null $order_id
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Customer|null $customer
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\LoyaltyTransactionFactory factory($count = null, $state = [])
 * @method static Builder<static>|LoyaltyTransaction newModelQuery()
 * @method static Builder<static>|LoyaltyTransaction newQuery()
 * @method static Builder<static>|LoyaltyTransaction ofKind(string $kind)
 * @method static Builder<static>|LoyaltyTransaction onlyTrashed()
 * @method static Builder<static>|LoyaltyTransaction query()
 * @method static Builder<static>|LoyaltyTransaction whereBalanceAfter($value)
 * @method static Builder<static>|LoyaltyTransaction whereCreatedAt($value)
 * @method static Builder<static>|LoyaltyTransaction whereCustomerId($value)
 * @method static Builder<static>|LoyaltyTransaction whereDeletedAt($value)
 * @method static Builder<static>|LoyaltyTransaction whereId($value)
 * @method static Builder<static>|LoyaltyTransaction whereKind($value)
 * @method static Builder<static>|LoyaltyTransaction whereNote($value)
 * @method static Builder<static>|LoyaltyTransaction whereOrderId($value)
 * @method static Builder<static>|LoyaltyTransaction wherePoints($value)
 * @method static Builder<static>|LoyaltyTransaction whereTenantId($value)
 * @method static Builder<static>|LoyaltyTransaction whereUpdatedAt($value)
 * @method static Builder<static>|LoyaltyTransaction withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|LoyaltyTransaction withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class LoyaltyTransaction extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<LoyaltyTransactionFactory> */
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

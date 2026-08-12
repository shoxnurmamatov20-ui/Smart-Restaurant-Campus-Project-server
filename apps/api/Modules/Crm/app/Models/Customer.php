<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Crm\Database\Factories\CustomerFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A guest we know by phone.

 * Loyalty points live on the customer rather than in a separate account table:
 * one restaurant, one balance, and every read of a guest needs it anyway.
 *
 * @method static CustomerFactory factory(int $count = null, array $state = [])
 */
final class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.customers';

    public const TIERS = ['bronze', 'silver', 'gold'];

    protected $fillable = [
        'tenant_id',
        'phone',
        'name',
        'birthday',
        'points',
        'tier',
        'cashback',
        'visits_count',
        'total_spent',
        'allergens',
        'note',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'birthday' => 'date',
            'allergens' => 'array',
            'is_active' => 'boolean',
            'points' => 'integer',
            'cashback' => 'integer',
            'visits_count' => 'integer',
            'total_spent' => 'integer',
        ];
    }

    protected static function newFactory(): CustomerFactory
    {
        return CustomerFactory::new();
    }

    // ============ Relationships ============

    public function loyaltyTransactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class)->latest();
    }

    public function feedbacks(): HasMany
    {
        return $this->hasMany(Feedback::class);
    }

    // ============ Accessors ============

    protected function averageCheque(): Attribute
    {
        return Attribute::get(fn (): int => $this->visits_count > 0
            ? (int) round($this->total_spent / $this->visits_count)
            : 0);
    }

    protected function birthdayIsToday(): Attribute
    {
        return Attribute::get(fn (): bool => $this->birthday !== null
            && $this->birthday->format('m-d') === now()->format('m-d'));
    }

    // ============ Domain behaviour ============

    /**
     * Move the loyalty balance and leave a transaction behind.
     *
     * Redeeming more than the guest has is refused: a negative balance is a
     * refund the restaurant never agreed to.
     */
    public function adjustPoints(string $kind, int $points, ?int $orderId = null, ?string $note = null): ?LoyaltyTransaction
    {
        if ($kind === 'redeem' && $points > $this->points) {
            return null;
        }

        $delta = $kind === 'redeem' ? -abs($points) : abs($points);

        $transaction = $this->loyaltyTransactions()->create([
            'kind' => $kind,
            'points' => $delta,
            'balance_after' => $this->points + $delta,
            'order_id' => $orderId,
            'note' => $note,
        ]);

        $this->forceFill(['points' => $this->points + $delta])->save();
        $this->recalculateTier();

        return $transaction;
    }

    /** Tier follows lifetime spend, not the current point balance. */
    public function recalculateTier(): void
    {
        $tier = match (true) {
            $this->total_spent >= 500000000 => 'gold',    // 5 000 000 so'm
            $this->total_spent >= 100000000 => 'silver',  // 1 000 000 so'm
            default => 'bronze',
        };

        if ($tier !== $this->tier) {
            $this->forceFill(['tier' => $tier])->save();
        }
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Guests whose birthday falls today, in the restaurant's own timezone.
     *
     * Compared month-and-day at a time rather than by formatting the column:
     * `extract` reads the stored date directly, so PostgreSQL can answer it from
     * an index on `(tenant_id, birthday)` instead of computing a string for
     * every guest on file. At a million guests that is the difference between a
     * morning marketing job and a table scan.
     */
    public function scopeBirthdayToday(Builder $query): Builder
    {
        $today = now();

        return $query->whereNotNull('birthday')
            ->whereRaw('extract(month from birthday) = ?', [$today->month])
            ->whereRaw('extract(day from birthday) = ?', [$today->day]);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'phone', 'name', 'points', 'tier', 'cashback', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.customer');
    }
}

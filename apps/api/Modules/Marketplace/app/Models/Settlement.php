<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * What the marketplace owes one restaurant for one week.
 *
 * A row rather than a report, and the figures are frozen when it is issued.
 * Recomputing a payout from live orders would mean a refund granted on Friday
 * silently changing what Monday's statement said — and the statement is the
 * thing a merchant reconciles their bank account against.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $store_id
 * @property string $invoice_number
 * @property Carbon $period_start
 * @property Carbon $period_end
 * @property int $orders_count
 * @property int $gross_tiyin
 * @property int $commission_tiyin
 * @property int $adjustments_tiyin
 * @property int $payable_tiyin
 * @property string $state
 * @property Carbon|null $paid_at
 * @property string|null $payment_reference
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Settlement newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Settlement newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Settlement query()
 *
 * @mixin \Eloquent
 */
final class Settlement extends Model
{
    use BelongsToTenant;

    protected $table = 'marketplace.settlements';

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'store_id', 'invoice_number', 'period_start', 'period_end',
        'orders_count', 'gross_tiyin', 'commission_tiyin', 'adjustments_tiyin',
        'payable_tiyin', 'state', 'paid_at', 'payment_reference',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'paid_at' => 'datetime',
            'orders_count' => 'integer',
            'gross_tiyin' => 'integer',
            'commission_tiyin' => 'integer',
            'adjustments_tiyin' => 'integer',
            'payable_tiyin' => 'integer',
        ];
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    /**
     * Which orders this statement paid for — the merchant's first question.
     *
     * @return HasMany<MarketOrder, $this>
     */
    public function orders(): HasMany
    {
        return $this->hasMany(MarketOrder::class, 'settlement_id');
    }
}

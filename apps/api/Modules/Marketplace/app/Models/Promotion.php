<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A merchant's own offer, and the budget it spends.
 *
 * `spent_tiyin` is incremented as orders use it rather than derived from them,
 * for the same reason a settlement is frozen: an offer whose remaining budget
 * moves when an old order is refunded is an offer nobody can plan against. The
 * merchant set aside two million so'm for this week; that is what it costs.
 *
 * The code is unique across the whole marketplace, not per restaurant. A guest
 * types it into a field that does not yet know which shop they are buying
 * from — the basket screen offers the box before the checkout resolves — so
 * two restaurants owning `OSH2026` is a code that means two things.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $store_id
 * @property string|null $code
 * @property array<array-key, mixed> $title
 * @property array<array-key, mixed>|null $body
 * @property string $kind
 * @property string $state
 * @property int $discount_tiyin
 * @property int $budget_tiyin
 * @property int $spent_tiyin
 * @property Carbon|null $starts_on
 * @property Carbon|null $ends_on
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static Builder<static>|Promotion newModelQuery()
 * @method static Builder<static>|Promotion newQuery()
 * @method static Builder<static>|Promotion query()
 * @method static Builder<static>|Promotion spendable()
 *
 * @mixin \Eloquent
 */
final class Promotion extends Model
{
    use BelongsToTenant, HasTranslations;

    protected $table = 'marketplace.promotions';

    public const KINDS = ['discount', 'free_delivery', 'ad_slot'];

    public const STATES = ['running', 'scheduled', 'ended', 'paused', 'cancelled'];

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'store_id', 'code', 'title', 'body', 'kind', 'state',
        'discount_tiyin', 'budget_tiyin', 'spent_tiyin', 'starts_on', 'ends_on',
    ];

    /** @var list<string> */
    protected array $translatable = ['title', 'body'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'title' => 'array',
            'body' => 'array',
            'starts_on' => 'date',
            'ends_on' => 'date',
            'discount_tiyin' => 'integer',
            'budget_tiyin' => 'integer',
            'spent_tiyin' => 'integer',
        ];
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    /**
     * Offers a basket may actually spend right now.
     *
     * Running, in date, and with budget left. All three, because each fails on
     * its own: a paused offer whose dates are live, a live offer that has not
     * started, and a running offer whose budget went at lunchtime are three
     * different "no" answers a guest can receive on the same afternoon.
     *
     * The date comparison binds today from PHP rather than reaching for SQL
     * `now()` — `ModuleBoundaryTest` refuses the latter by name, because a
     * replica in another timezone answers a different day.
     *
     * @param Builder<Promotion> $query
     */
    public function scopeSpendable(Builder $query): void
    {
        $today = now()->toDateString();

        $query->where('state', 'running')
            ->where(fn (Builder $q) => $q->whereNull('starts_on')->orWhere('starts_on', '<=', $today))
            ->where(fn (Builder $q) => $q->whereNull('ends_on')->orWhere('ends_on', '>=', $today))
            ->whereColumn('spent_tiyin', '<', 'budget_tiyin');
    }

    /** What is left of the budget, never negative. */
    public function remaining(): int
    {
        return max(0, $this->budget_tiyin - $this->spent_tiyin);
    }
}

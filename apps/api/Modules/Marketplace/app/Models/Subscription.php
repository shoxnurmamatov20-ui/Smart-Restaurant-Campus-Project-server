<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * MyPOS Plus — one customer's standing arrangement with the platform.
 *
 * ---------------------------------------------------------------------------
 * No `tenant_id`, and this is the fourth table in the module to say so
 *
 * A subscription belongs to a CONSUMER, and a consumer belongs to the platform
 * rather than to any restaurant on it. Stamping this row with a restaurant would
 * give a guest who subscribed after ordering plov free delivery from that one
 * shop and full price at the other thirty-nine — which is the opposite of what
 * the subscription is sold as. `ModuleBoundaryTest` records the exemption by
 * name beside `Consumer`, `ConsumerAddress` and `Courier`.
 *
 * What guards it instead is the same thing that guards those three: the token.
 * `ConsumerPlusController` reads `$consumer->id` from `RequireConsumerToken` and
 * never from a URL or a body.
 *
 * ---------------------------------------------------------------------------
 * Why `consumers.plus_until` still exists
 *
 * It is the fast answer, and it is read on the hottest path in the module — the
 * checkout zeroes the delivery fee from it on every order. This table is the
 * history behind that date: when it started, what was charged, which invoice
 * paid, and when somebody stopped it. A checkout that had to join a subscription
 * table to price a delivery fee would join on every basket in the country.
 *
 * ---------------------------------------------------------------------------
 * Monthly invoices, not a standing order
 *
 * `App\Contracts\Finance\PaymentGateway` describes one-off invoices, because
 * that is what the three Uzbek providers expose without a signed recurring
 * mandate. So this platform charges ONE month at a time and says so on the
 * screen: `renews_at` is when the next invoice is raised, and a card that is not
 * presented again simply lapses. A subscribe button that claimed to set up a
 * standing order and then took money once would be the worst version available.
 * The mandate itself is `TODO(integration): needs PAYME_KEY — see docs/GO-LIVE.md`.
 *
 * @property int $id
 * @property int $consumer_id
 * @property string $plan
 * @property string $state
 * @property int $monthly_tiyin
 * @property Carbon $started_at
 * @property Carbon $renews_at
 * @property Carbon|null $cancelled_at
 * @property string|null $payment_token
 * @property string|null $pay_rail
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Consumer|null $consumer
 *
 * @method static Builder<static>|Subscription active()
 * @method static Builder<static>|Subscription newModelQuery()
 * @method static Builder<static>|Subscription newQuery()
 * @method static Builder<static>|Subscription query()
 *
 * @mixin \Eloquent
 */
final class Subscription extends Model
{
    protected $table = 'marketplace.subscriptions';

    public const STATES = ['active', 'cancelled', 'lapsed'];

    /** The only plan today. A column so that the second one is not a migration. */
    public const PLAN = 'plus';

    /** @var list<string> */
    protected $fillable = [
        'consumer_id', 'plan', 'state', 'monthly_tiyin',
        'started_at', 'renews_at', 'cancelled_at', 'payment_token', 'pay_rail',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'monthly_tiyin' => 'integer',
            'started_at' => 'datetime',
            'renews_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Consumer, $this> */
    public function consumer(): BelongsTo
    {
        return $this->belongsTo(Consumer::class, 'consumer_id');
    }

    /**
     * @param Builder<Subscription> $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->where('state', 'active');
    }
}

<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * "When this happens, tell that chat."
 *
 * One row per event per chat per scope. The threshold is what keeps a rule
 * alive: a notification that fires on every occurrence is muted within a week,
 * and a muted rule is worse than none because everybody believes it is working.
 *
 * @property int $id
 * @property int $tenant_id
 * @property int|null $branch_id
 * @property string $event
 * @property string $chat_id
 * @property int|null $bot_id
 * @property string $locale
 * @property int|null $min_amount_tiyin
 * @property bool $enabled
 * @property Carbon|null $last_sent_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Bot|null $bot
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|NotificationRule newModelQuery()
 * @method static Builder<static>|NotificationRule newQuery()
 * @method static Builder<static>|NotificationRule query()
 *
 * @mixin \Eloquent
 */
final class NotificationRule extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /**
     * The events a restaurant may subscribe a chat to.
     *
     * A closed list on purpose. Every name here is published by a module and
     * carries a payload this module knows how to phrase; an open field would
     * let somebody save `orders.plased` and wait forever for a message.
     *
     * @var list<string>
     */
    public const EVENTS = [
        'orders.placed',
        'orders.paid',
        'pos.approval_requested',
        'pos.bill_voided',
        'pos.bill_comped',
        'pos.payment_refunded',
        'finance.shift_closed',
        'finance.shift_variance_flagged',
        'menu.dish.stopped',
    ];

    protected $table = 'telegram.notification_rules';

    protected $fillable = [
        'tenant_id', 'branch_id', 'event', 'chat_id', 'bot_id',
        'locale', 'min_amount_tiyin', 'enabled',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'last_sent_at' => 'datetime',
        ];
    }

    public function bot(): BelongsTo
    {
        return $this->belongsTo(Bot::class);
    }

    /**
     * Whether this rule cares about an occurrence of that size.
     *
     * A null threshold means every one. A payload with no amount at all — a
     * dish going on the stop list — passes any threshold, because withholding
     * it would silently turn a subscription into nothing.
     */
    public function wants(?int $amountTiyin): bool
    {
        if ($this->min_amount_tiyin === null || $amountTiyin === null) {
            return true;
        }

        return $amountTiyin >= $this->min_amount_tiyin;
    }
}

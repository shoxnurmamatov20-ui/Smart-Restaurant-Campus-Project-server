<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A guest saying something went wrong, and the clock the merchant answers on.
 *
 * Four kinds, and two of them settle themselves — a delivery more than half an
 * hour late refunds its own fee, a missing item under twenty thousand is
 * credited without a photograph. That is `automatic`, and it decides whether the
 * merchant is being told or being asked: a different screen, and a different
 * deadline.
 *
 * `deadline_at` is what stops "we are looking into it" from being the final
 * answer. Silence past it resolves in the guest's favour.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $order_id
 * @property int $consumer_id
 * @property string $kind
 * @property int $amount_tiyin
 * @property string|null $body
 * @property bool $automatic
 * @property string $state
 * @property string|null $resolution
 * @property Carbon|null $deadline_at
 * @property Carbon|null $resolved_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read MarketOrder|null $order
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Dispute newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Dispute newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Dispute query()
 *
 * @mixin \Eloquent
 */
final class Dispute extends Model
{
    use BelongsToTenant;

    protected $table = 'marketplace.disputes';

    /**
     * The four complaints the sheet offers — `PROBLEM_REASONS`.
     *
     * A closed list rather than free text, because the first two carry an
     * automatic outcome and a rule cannot be applied to a sentence somebody
     * typed. The words go in `body` underneath.
     */
    public const KINDS = ['late', 'missing', 'cold', 'wrong'];

    /** Which of them the platform settles without asking the restaurant. */
    public const AUTOMATIC_KINDS = ['late', 'missing'];

    /**
     * The ceiling on an automatic credit — twenty thousand so'm.
     *
     * Above this a human looks, because "the plov was missing" on a two hundred
     * thousand order is either true or the most profitable sentence on the
     * platform, and the difference is not something a rule can see.
     */
    public const AUTOMATIC_CEILING_TIYIN = 2_000_000;

    /** How long the merchant has to answer one they are being asked about. */
    public const ANSWER_HOURS = 2;

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'order_id', 'consumer_id', 'kind', 'amount_tiyin', 'body',
        'automatic', 'state', 'resolution', 'deadline_at', 'resolved_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'automatic' => 'boolean',
            'amount_tiyin' => 'integer',
            'deadline_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<MarketOrder, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(MarketOrder::class, 'order_id');
    }

    /**
     * Whether this complaint settles itself.
     *
     * Both halves matter. The kind has to be one a rule can check — a late
     * delivery is a timestamp, a cold one is an opinion — and the amount has to
     * be small enough that being wrong costs less than reading it.
     */
    public static function settlesItself(string $kind, int $amountTiyin): bool
    {
        return in_array($kind, self::AUTOMATIC_KINDS, true)
            && $amountTiyin <= self::AUTOMATIC_CEILING_TIYIN;
    }
}

<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Whether one intake door is open, and until when it is not.
 *
 * The doors are the console's own five keys, kept verbatim for the reason
 * `calls-data.ts` gives about renaming them: *"Renaming them looks tidier and
 * costs the ability to diff this file against `CHANS` when a colour or a
 * channel changes."*
 *
 * Deliberately NOT `BelongsToBranch`. The trait's "no branch means every
 * branch" is right for reading and wrong for writing here: an owner switching
 * a channel off from an unscoped console would have the row stamped with no
 * branch — correct — but a manager scoped to Chilonzor reading the list would
 * then see the roll-up row filtered OUT and think the channel was open. The
 * fall-through is explicit in `resolve()` instead: a venue's own row wins, and
 * the business-wide row is what answers when it has none.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $key
 * @property bool $is_open
 * @property Carbon|null $paused_until
 * @property string|null $pause_reason
 * @property int|null $updated_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read User|null $editor
 * @property-read bool $is_paused
 * @property-read bool $accepts
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|ChannelSetting newModelQuery()
 * @method static Builder<static>|ChannelSetting newQuery()
 * @method static Builder<static>|ChannelSetting query()
 *
 * @mixin \Eloquent
 */
final class ChannelSetting extends Model
{
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'orders.channel_settings';

    /** The five doors the intake screen draws, in its own vocabulary. */
    public const KEYS = ['tel', 'tg', 'web', 'ye', 'uz'];

    /**
     * Which door an order that arrived through the public endpoint came in by.
     *
     * `orders.source` is a different vocabulary — `web|app|telegram|qr|pos|
     * aggregator` — because it also has to describe an order typed at a till.
     * Only three of its six values are doors a stranger can push:
     *
     *  - `web` and `app` are both the restaurant's own front door. One switch,
     *    because "we are not taking online orders for an hour" is one decision
     *    and a restaurant that could pause its website while its app kept
     *    accepting would be a restaurant with a bug rather than a feature.
     *  - `telegram` is the bot.
     *
     * `qr` is a guest already sitting at a table — refusing them would be
     * telling somebody in the dining room to leave. `pos` is a cashier, and a
     * till that could be paused from a settings screen is a till that stops
     * mid-shift. `aggregator` arrives through somebody else's webhook, which
     * carries which aggregator it is; until one is integrated there is nothing
     * to map.
     */
    public static function keyForSource(?string $source): ?string
    {
        return match ($source) {
            'web', 'app' => 'web',
            'telegram' => 'tg',
            default => null,
        };
    }

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'key',
        'is_open',
        'paused_until',
        'pause_reason',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_open' => 'boolean',
            'paused_until' => 'datetime',
        ];
    }

    // ============ Relationships ============

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    // ============ Accessors ============

    /** Shut for now, and it will come back on its own. */
    protected function isPaused(): Attribute
    {
        return Attribute::get(fn (): bool => $this->paused_until !== null
            && $this->paused_until->isFuture());
    }

    /** Whether an order may come through this door right now. */
    protected function accepts(): Attribute
    {
        return Attribute::get(fn (): bool => $this->is_open && ! $this->is_paused);
    }

    // ============ Lookup ============

    /**
     * The rule in force for one door at one venue.
     *
     * The venue's own row wins; the business-wide row answers when it has none;
     * an absent row means open, which is what a restaurant that has never
     * touched this screen expects. Answers a model that has never been saved in
     * that last case rather than null, so every caller reads `->accepts`
     * instead of remembering which of three shapes it got.
     */
    public static function resolve(string $key, ?int $branchId): self
    {
        /** @var Collection<int, self> $rows */
        $rows = self::query()
            ->where('key', $key)
            ->where(static function (Builder $query) use ($branchId): void {
                $query->whereNull('branch_id');

                if ($branchId !== null) {
                    $query->orWhere('branch_id', $branchId);
                }
            })
            ->get();

        // The venue's own row first — `sortByDesc` on a nullable column puts the
        // non-null ahead, which is the precedence this needs.
        $best = $rows->sortByDesc('branch_id')->first();

        return $best ?? new self(['key' => $key, 'is_open' => true]);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'branch_id', 'key', 'is_open', 'paused_until', 'pause_reason'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('orders.channel_setting');
    }
}

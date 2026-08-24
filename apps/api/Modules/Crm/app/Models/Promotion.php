<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\PromotionFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * An offer nobody types: a basket rule the till applies by itself.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property array<array-key, mixed>|null $name
 * @property array<array-key, mixed>|null $rule_text
 * @property string $kind bundle|nth_off|gift|basket_off
 * @property int $value
 * @property int $min_tiyin
 * @property int $quantity
 * @property array<array-key, mixed>|null $dishes
 * @property array<array-key, mixed>|null $days
 * @property int|null $starts_minute
 * @property int|null $ends_minute
 * @property array<array-key, mixed>|null $channels
 * @property Carbon|null $starts_on
 * @property Carbon|null $ends_on
 * @property bool $is_active
 * @property int $used_count
 * @property int $revenue_tiyin
 * @property int $discount_tiyin
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Collection<int, PromotionUse> $uses
 * @property-read int|null $uses_count
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\PromotionFactory factory($count = null, $state = [])
 * @method static Builder<static>|Promotion newModelQuery()
 * @method static Builder<static>|Promotion newQuery()
 * @method static Builder<static>|Promotion onlyTrashed()
 * @method static Builder<static>|Promotion query()
 * @method static Builder<static>|Promotion withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Promotion withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Promotion extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<PromotionFactory> */
    use HasFactory;

    use HasTranslations;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.promotions';

    public const KINDS = ['bundle', 'nth_off', 'gift', 'basket_off'];

    public const CHANNELS = ['dine_in', 'takeaway', 'delivery', 'aggregator'];

    /** @var array<int, string> */
    protected array $translatable = ['name', 'rule_text'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'rule_text',
        'kind',
        'value',
        'min_tiyin',
        'quantity',
        'dishes',
        'days',
        'starts_minute',
        'ends_minute',
        'channels',
        'starts_on',
        'ends_on',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'rule_text' => 'array',
            'dishes' => 'array',
            'days' => 'array',
            'channels' => 'array',
            'value' => 'integer',
            'min_tiyin' => 'integer',
            'quantity' => 'integer',
            'starts_minute' => 'integer',
            'ends_minute' => 'integer',
            'starts_on' => 'date',
            'ends_on' => 'date',
            'is_active' => 'boolean',
            'used_count' => 'integer',
            'revenue_tiyin' => 'integer',
            'discount_tiyin' => 'integer',
        ];
    }

    protected static function newFactory(): PromotionFactory
    {
        return PromotionFactory::new();
    }

    public function uses(): HasMany
    {
        return $this->hasMany(PromotionUse::class);
    }

    // ============ Domain behaviour ============

    /**
     * Whether this offer is running at this moment, on this channel.
     *
     * Every clause is a separate refusal on purpose. An offer that "did not
     * apply" is the single hardest thing to debug at a till with a queue behind
     * it, and the four questions — is it switched on, is today one of its days,
     * is now inside its hours, is this channel one of its channels — are the
     * four a manager asks in that order.
     */
    public function runsAt(CarbonInterface $moment, string $channel = 'dine_in'): bool
    {
        if (! $this->is_active) {
            return false;
        }

        if ($this->starts_on !== null && $moment->lt($this->starts_on->startOfDay())) {
            return false;
        }

        if ($this->ends_on !== null && $moment->gt($this->ends_on->endOfDay())) {
            return false;
        }

        $days = $this->days;

        if (is_array($days) && $days !== [] && ! in_array($moment->dayOfWeekIso, array_map('intval', $days), true)) {
            return false;
        }

        $channels = $this->channels;

        if (is_array($channels) && $channels !== [] && ! in_array($channel, $channels, true)) {
            return false;
        }

        return $this->insideTheHours($moment->hour * 60 + $moment->minute);
    }

    /**
     * The hour window, including the one that crosses midnight.
     *
     * A bar's happy hour that ends at 01:00 is stored as `starts_minute` 1380
     * and `ends_minute` 60, and a naive `between` would say it is never on.
     * The wrap is what the two columns are for.
     */
    private function insideTheHours(int $minute): bool
    {
        if ($this->starts_minute === null || $this->ends_minute === null) {
            return true;
        }

        if ($this->starts_minute <= $this->ends_minute) {
            return $minute >= $this->starts_minute && $minute <= $this->ends_minute;
        }

        return $minute >= $this->starts_minute || $minute <= $this->ends_minute;
    }

    /**
     * What this offer takes off a basket of `$subtotal` tiyin.
     *
     * Integer arithmetic end to end — `intdiv` after the multiply, the same
     * shape `PromoCode::discountFor()` uses, so the two never round apart on a
     * bill that carries both.
     *
     * `bundle` and `gift` are not priced here: a bundle is a fixed price for a
     * named set and a gift is a named dish, and both need the LINES rather than
     * the total. The till prices those against the ticket it is holding; this
     * answers the two that are basket-wide.
     */
    public function discountFor(int $subtotal): int
    {
        if ($subtotal <= 0 || $subtotal < $this->min_tiyin) {
            return 0;
        }

        $raw = match ($this->kind) {
            'basket_off' => $this->value <= 100
                ? intdiv($subtotal * $this->value, 100)
                : $this->value,
            default => 0,
        };

        return max(0, min($raw, $subtotal));
    }

    // ============ Scopes ============

    public function scopeLive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // Pausing an offer is the write this screen exists for, and "who
            // switched the business lunch off on a Tuesday" is the question.
            ->logOnly(['name', 'kind', 'value', 'min_tiyin', 'is_active', 'branch_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.promotion');
    }
}

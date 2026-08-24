<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\PromoCodeFactory;

/**
 * A campaign: a word a guest types and what it is worth.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $code
 * @property array<array-key, mixed>|null $title
 * @property string $kind percent|fixed
 * @property int $value Whole percents, or tiyin when kind=fixed
 * @property int $min_tiyin
 * @property int|null $max_discount_tiyin
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property int|null $max_uses
 * @property int $used_count
 * @property int $per_customer_limit
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, PromoRedemption> $redemptions
 * @property-read int|null $redemptions_count
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\PromoCodeFactory factory($count = null, $state = [])
 * @method static Builder<static>|PromoCode newModelQuery()
 * @method static Builder<static>|PromoCode newQuery()
 * @method static Builder<static>|PromoCode onlyTrashed()
 * @method static Builder<static>|PromoCode query()
 * @method static Builder<static>|PromoCode withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|PromoCode withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class PromoCode extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PromoCodeFactory> */
    use HasFactory;

    use HasTranslations;
    use SoftDeletes;

    protected $table = 'crm.promo_codes';

    public const KINDS = ['percent', 'fixed'];

    /** @var array<int, string> */
    protected array $translatable = ['title'];

    protected $fillable = [
        'tenant_id',
        'code',
        'title',
        'kind',
        'value',
        'min_tiyin',
        'max_discount_tiyin',
        'starts_at',
        'ends_at',
        'max_uses',
        'per_customer_limit',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'title' => 'array',
            'value' => 'integer',
            'min_tiyin' => 'integer',
            'max_discount_tiyin' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'max_uses' => 'integer',
            'used_count' => 'integer',
            'per_customer_limit' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected static function newFactory(): PromoCodeFactory
    {
        return PromoCodeFactory::new();
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(PromoRedemption::class);
    }

    /**
     * `osh15` and `OSH15` are one campaign.
     *
     * Normalised on the way in rather than compared case-insensitively on the
     * way out: `lower(code) = ?` cannot use the unique index, and this is the
     * lookup a cart runs on every keystroke of the promo field.
     */
    public static function normalise(string $code): string
    {
        return mb_strtoupper(trim($code));
    }

    /** What this code takes off a basket of `$subtotal` tiyin. Never more than the basket. */
    public function discountFor(int $subtotal): int
    {
        $raw = $this->kind === 'fixed'
            ? $this->value
            // Integer arithmetic end to end — `intdiv` after the multiply, so
            // 15% of 47 333 tiyin is 7 099 and not 7 099.95 rounded by chance.
            : intdiv($subtotal * $this->value, 100);

        if ($this->max_discount_tiyin !== null) {
            $raw = min($raw, $this->max_discount_tiyin);
        }

        // A discount larger than the basket would make the bill negative, which
        // is a refund the restaurant never agreed to.
        return max(0, min($raw, $subtotal));
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}

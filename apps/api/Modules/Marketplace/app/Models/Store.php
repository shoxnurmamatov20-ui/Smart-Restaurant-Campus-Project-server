<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Marketplace\Database\Factories\StoreFactory;

/**
 * One restaurant's shop window on MyPOS.
 *
 * Money is integer tiyin, and the rating is integer tenths for the same reason:
 * 4.9 has no exact binary form, and the screen this number exists for sorts
 * restaurants by it.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $slug
 * @property string $name
 * @property array<array-key, mixed>|null $kind
 * @property string $cuisine
 * @property string $vertical
 * @property int $rating_tenths
 * @property int $reviews_count
 * @property int $delivery_fee_tiyin
 * @property int $min_order_tiyin
 * @property int $minutes_from
 * @property int $minutes_to
 * @property int $commission_percent
 * @property string $status
 * @property bool $is_open
 * @property string|null $logo_url
 * @property string|null $cover_url
 * @property string|null $initials
 * @property string|null $tint
 * @property array<array-key, mixed>|null $offer
 * @property string|null $offer_tone
 * @property int|null $latitude_e6
 * @property int|null $longitude_e6
 * @property array<array-key, mixed>|null $payout
 * @property string|null $payout_state
 * @property Carbon|null $payout_verified_at
 * @property array<array-key, mixed>|null $notification_prefs
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Branch|null $branch
 *
 * @method static Builder<static>|Store live()
 * @method static \Modules\Marketplace\Database\Factories\StoreFactory factory($count = null, $state = [])
 * @method static Builder<static>|Store newModelQuery()
 * @method static Builder<static>|Store newQuery()
 * @method static Builder<static>|Store query()
 *
 * @mixin \Eloquent
 */
final class Store extends Model
{
    /** @use HasFactory<StoreFactory> */
    use BelongsToTenant, HasFactory, HasTranslations, SoftDeletes;

    /** Lives in the `marketplace` schema. */
    protected $table = 'marketplace.stores';

    /** Trading, paused by the platform, or not reviewed yet. */
    public const STATUSES = ['live', 'paused', 'pending_review'];

    /**
     * What the marketplace keeps, when nobody has negotiated.
     *
     * Nine, and it is the platform's own argument — "Komissiya 9%, 27% emas" is
     * the third reason the marketing site gives a restaurant to join.
     * `MARKETPLACE_COMMISSION_PERCENT` in `packages/surfaces/src/mp/data.ts` is
     * the same number for the same screens; change one and change the other.
     */
    public const DEFAULT_COMMISSION_PERCENT = 9;

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'branch_id', 'slug', 'name', 'kind', 'cuisine', 'vertical',
        'rating_tenths', 'reviews_count', 'delivery_fee_tiyin', 'min_order_tiyin',
        'minutes_from', 'minutes_to', 'commission_percent', 'status', 'is_open',
        'logo_url', 'cover_url', 'initials', 'tint', 'offer', 'offer_tone',
        'latitude_e6', 'longitude_e6', 'notification_prefs',
    ];

    /**
     * `payout` is deliberately NOT fillable.
     *
     * It decides where a week's takings land, and the one path to it is
     * `savePayout()` — which resets the review state on every write. A merchant
     * settings form that could reach it through a mass assignment would be a
     * bank account changed without a human ever looking at it again.
     */

    /** @var list<string> */
    protected array $translatable = ['kind', 'offer'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => 'array',
            'offer' => 'array',
            'is_open' => 'boolean',
            'rating_tenths' => 'integer',
            'reviews_count' => 'integer',
            'delivery_fee_tiyin' => 'integer',
            'min_order_tiyin' => 'integer',
            'minutes_from' => 'integer',
            'minutes_to' => 'integer',
            'commission_percent' => 'integer',
            'latitude_e6' => 'integer',
            'longitude_e6' => 'integer',
            'payout' => 'array',
            'payout_verified_at' => 'datetime',
            'notification_prefs' => 'array',
        ];
    }

    /** The route key is the public URL segment, never the id. */
    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /**
     * The venue that cooks for this window.
     *
     * A plain relation rather than the `BelongsToBranch` trait, and the
     * difference is the global scope that trait adds: a storefront must stay
     * visible in the directory whatever branch a merchant's own request happens
     * to be pinned to. The branch is read from here when an order needs to know
     * whose kitchen and whose trading day it belongs to.
     *
     * ------------------------------------------------------------------------
     * A storefront with no venue is a storefront with no 86 sheet
     *
     * Nullable in the schema, because a single-venue restaurant has nothing to
     * choose between — but the consequences are real and not obvious, so they
     * are written here rather than discovered:
     *
     *   the stop list  is a KITCHEN's, scoped by `BranchContext`. With no
     *                  branch, `MenuCatalog::board()` reports nothing stopped
     *                  and the window shows every dish as available however
     *                  many the kitchen has run out of.
     *   the trading day and the takings have no venue to be attributed to, so a
     *                  branch comparison report simply cannot see them.
     *
     * `MarketplaceDatabaseSeeder` sets one, and a restaurant joining the
     * platform should be given one.
     */
    /** @return BelongsTo<Branch, $this> */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    /** @return HasMany<StoreItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(StoreItem::class, 'store_id');
    }

    /** @return HasMany<MarketOrder, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(MarketOrder::class, 'store_id');
    }

    /** @return HasMany<DeliveryZone, $this> */
    public function zones(): HasMany
    {
        return $this->hasMany(DeliveryZone::class, 'store_id');
    }

    /** @return HasMany<Placement, $this> */
    public function placements(): HasMany
    {
        return $this->hasMany(Placement::class, 'store_id');
    }

    /** Waiting for a human, looked at by one, or never filled in. */
    public const PAYOUT_STATES = ['incomplete', 'pending_review', 'verified'];

    /**
     * Where the weekly payout goes, and the review it re-enters by being changed.
     *
     * Every write resets the state to `pending_review`, and that is the whole
     * point of the method rather than a fillable column. An account number is
     * exactly the field somebody with a stolen session would edit, and
     * "verified" has to mean a person looked at THIS account rather than at an
     * earlier one on the same row. The merchant screen says so before the save,
     * because a payout that silently stops on the Thursday it was due is worse
     * than one that was never promised.
     *
     * @param array{bank_name: string, mfo: string, account: string, inn: string, holder: string} $details
     */
    public function savePayout(array $details): void
    {
        $this->forceFill([
            'payout' => $details,
            'payout_state' => 'pending_review',
            'payout_verified_at' => null,
        ])->save();
    }

    /**
     * The account with everything but the last four digits taken out.
     *
     * What the platform console and a statement show. A reviewer needs to see
     * that an account was entered and to tell two of them apart; they do not
     * need the digits, and a bank account printed in full on a screen that a
     * support agent shares is a payout somebody else can redirect.
     */
    public function payoutMasked(): ?string
    {
        $account = $this->payout['account'] ?? null;

        if (! is_string($account) || $account === '') {
            return null;
        }

        return mb_substr($account, -4);
    }

    /**
     * What the directory is allowed to show.
     *
     * `status = live` only. A storefront still in review has never been looked
     * at by a human, and one that is paused was pulled for a reason — showing
     * either takes an order the platform then has to apologise for. `is_open`
     * is NOT part of this: a closed shop is drawn dimmed with its hours, which
     * is what the design does and what a guest planning tomorrow needs.
     *
     * @param Builder<Store> $query
     */
    public function scopeLive(Builder $query): void
    {
        $query->where('status', 'live');
    }

    /** Tenths back to the number a person reads: 49 → 4.9. */
    public function rating(): float
    {
        return round($this->rating_tenths / 10, 1);
    }

    /**
     * How far this shop is from a point, in metres, or null if either end is
     * unknown.
     *
     * Haversine on a sphere. Not a projection and not PostGIS: the answer is
     * printed as "1.2 km" beside a restaurant name, the error over the few
     * kilometres a courier will ride is metres, and a geometry column would be
     * an extension to install for a number nobody navigates by.
     */
    public function metresFrom(?float $latitude, ?float $longitude): ?int
    {
        if ($latitude === null || $longitude === null
            || $this->latitude_e6 === null || $this->longitude_e6 === null) {
            return null;
        }

        $earthRadius = 6_371_000;

        $lat1 = deg2rad($this->latitude_e6 / 1_000_000);
        $lat2 = deg2rad($latitude);
        $dLat = $lat2 - $lat1;
        $dLon = deg2rad($longitude - $this->longitude_e6 / 1_000_000);

        $a = sin($dLat / 2) ** 2 + cos($lat1) * cos($lat2) * sin($dLon / 2) ** 2;

        return (int) round($earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a)));
    }

    /**
     * Named explicitly, because Laravel guesses `Database\Factories\…`
     * from the model's namespace and a module's factories are not there.
     */
    protected static function newFactory(): StoreFactory
    {
        return StoreFactory::new();
    }
}

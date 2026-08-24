<?php

declare(strict_types=1);

namespace Modules\Board\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Modules\Board\Database\Factories\BoardBannerFactory;
use Modules\Board\Models\Concerns\ReachesTheScreens;

/**
 * The promo strip along the bottom of the wall.
 *
 * The text is read out loud by a stranger standing at a counter, so it is
 * `{uz,ru,en}` like every other guest-facing string on this platform — a
 * Russian-speaking guest and an Uzbek one read the same board at the same
 * moment.
 *
 * Only one banner shows at a time; several live ones alternate. That is the
 * design's own sentence and it lives on the wall, not here: this table says
 * which banners are eligible, and the screen decides what to do with more than
 * one of them.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $slug
 * @property array<array-key, mixed> $text
 * @property string $kind
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property bool $is_live
 * @property Carbon|null $published_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 * @property-read string|null $title
 *
 * @method static Builder<static>|BoardBanner live()
 * @method static Builder<static>|BoardBanner running(Carbon|null $at = null)
 * @method static Builder<static>|BoardBanner behindTheScreens()
 * @method static \Modules\Board\Database\Factories\BoardBannerFactory factory($count = null, $state = [])
 * @method static Builder<static>|BoardBanner newModelQuery()
 * @method static Builder<static>|BoardBanner newQuery()
 * @method static Builder<static>|BoardBanner query()
 *
 * @mixin \Eloquent
 */
final class BoardBanner extends Model
{
    /** Lives in the `board` schema — see the 0000_01_01_000000 migration. */
    protected $table = 'board.banners';

    /** The three the console draws a coloured chip for. */
    public const KINDS = ['offer', 'new', 'loyalty'];

    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<BoardBannerFactory> */
    use HasFactory;

    use HasTranslations;
    use ReachesTheScreens;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'slug',
        'text',
        'kind',
        'starts_at',
        'ends_at',
        'is_live',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['text'];

    protected function casts(): array
    {
        return [
            'text' => 'array',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'is_live' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    protected static function newFactory(): BoardBannerFactory
    {
        return BoardBannerFactory::new();
    }

    // ============ Accessors ============

    /** The strip's own words, in the request's language. */
    protected function title(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->translate('text'));
    }

    // ============ Scopes ============

    /** Switched on by a person. Says nothing about the dates. */
    public function scopeLive(Builder $query): Builder
    {
        return $query->where('is_live', true);
    }

    /**
     * Actually on the wall right now: switched on AND inside its window.
     *
     * Both halves, because they fail differently. A banner left live after its
     * campaign ended is last month's offer being read by today's queue; a
     * banner inside its dates but switched off is a draft somebody is still
     * wording. Neither belongs on a screen and only one of them looks wrong in
     * the list.
     *
     * Compared against a passed-in moment rather than `now()` inside the query
     * so a test can prove the boundary rather than sleep through it — the same
     * reason the tables module takes a clock.
     */
    public function scopeRunning(Builder $query, ?Carbon $at = null): Builder
    {
        $moment = $at ?? Carbon::now();

        // `scopeLive` called directly rather than as `$query->live()`: the
        // parameter is a plain Builder, and a scope reached through the magic
        // call is a method static analysis cannot see on it.
        return $this->scopeLive($query)
            ->where(function (Builder $inner) use ($moment): void {
                $inner->whereNull('starts_at')->orWhere('starts_at', '<=', $moment);
            })
            ->where(function (Builder $inner) use ($moment): void {
                $inner->whereNull('ends_at')->orWhere('ends_at', '>=', $moment);
            });
    }
}

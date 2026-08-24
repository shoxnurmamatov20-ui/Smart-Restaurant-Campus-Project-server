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
use Modules\Board\Database\Factories\BoardScreenFactory;
use Modules\Board\Models\Concerns\ReachesTheScreens;

/**
 * One entry in the rotation — `board.playlist`.
 *
 * Named for what it is rather than for its table: a row here is a screen the
 * wall shows, and `BoardPlaylist` would be a model named after a collection of
 * itself.
 *
 * Two kinds of row, and the difference is the whole tab:
 *
 *   ROTATING   `seconds` is set. The screen takes its turn and hands over.
 *   SCHEDULED  `window_start`/`window_end` are set and `seconds` is null. It
 *              does not take a turn at all — between eight and eleven it *is*
 *              the board, and at eleven it stops existing.
 *
 * Exactly one of the two, and the database says so as well as the FormRequest:
 * a row that carried both would make `rotationSeconds()` count a screen that
 * never comes round, so the "one full turn" figure a manager sets every other
 * duration against would be wrong all day.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $slug
 * @property array<array-key, mixed> $name
 * @property int|null $seconds
 * @property string|null $window_start
 * @property string|null $window_end
 * @property bool $is_active
 * @property int $position
 * @property Carbon|null $published_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 * @property-read string|null $title
 * @property-read bool $is_scheduled
 *
 * @method static Builder<static>|BoardScreen active()
 * @method static Builder<static>|BoardScreen inBoardOrder()
 * @method static Builder<static>|BoardScreen behindTheScreens()
 * @method static \Modules\Board\Database\Factories\BoardScreenFactory factory($count = null, $state = [])
 * @method static Builder<static>|BoardScreen newModelQuery()
 * @method static Builder<static>|BoardScreen newQuery()
 * @method static Builder<static>|BoardScreen query()
 *
 * @mixin \Eloquent
 */
final class BoardScreen extends Model
{
    /** Lives in the `board` schema — see the 0000_01_01_000000 migration. */
    protected $table = 'board.playlist';

    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<BoardScreenFactory> */
    use HasFactory;

    use HasTranslations;
    use ReachesTheScreens;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'slug',
        'name',
        'seconds',
        'window_start',
        'window_end',
        'is_active',
        'position',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['name'];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'seconds' => 'integer',
            'is_active' => 'boolean',
            'position' => 'integer',
            'published_at' => 'datetime',
        ];
    }

    protected static function newFactory(): BoardScreenFactory
    {
        return BoardScreenFactory::new();
    }

    // ============ Accessors ============

    /** What this screen is called, in the request's language. */
    protected function title(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->translate('name'));
    }

    /**
     * Whether this replaces the rotation rather than joining it.
     *
     * Read off `seconds` rather than off the window, because `seconds` is the
     * column the check constraint pivots on: a scheduled row is exactly one
     * with no duration, and asking about the window instead would answer
     * differently for a row the constraint already refuses.
     */
    protected function isScheduled(): Attribute
    {
        return Attribute::get(fn (): bool => $this->seconds === null);
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** The order the rotation runs in; `id` breaks ties — see BoardColumn. */
    public function scopeInBoardOrder(Builder $query): Builder
    {
        return $query->orderBy('position')->orderBy('id');
    }
}

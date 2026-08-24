<?php

declare(strict_types=1);

namespace Modules\Board\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Modules\Board\Database\Factories\BoardColumnFactory;
use Modules\Board\Models\Concerns\ReachesTheScreens;

/**
 * One heading on the wall, and the menu section under it.
 *
 * The row holds an ordering, a colour and a pointer into the catalogue —
 * nothing else. What is under the heading, what it costs and whether the
 * kitchen has run out are read from Menu at render time; see the migration for
 * why a board that keeps its own copy of a price is a board that lies.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $menu_category_id
 * @property string $accent
 * @property int $position
 * @property bool $is_visible
 * @property Carbon|null $published_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|BoardColumn visible()
 * @method static Builder<static>|BoardColumn inBoardOrder()
 * @method static Builder<static>|BoardColumn behindTheScreens()
 * @method static \Modules\Board\Database\Factories\BoardColumnFactory factory($count = null, $state = [])
 * @method static Builder<static>|BoardColumn newModelQuery()
 * @method static Builder<static>|BoardColumn newQuery()
 * @method static Builder<static>|BoardColumn query()
 *
 * @mixin \Eloquent
 */
final class BoardColumn extends Model
{
    /** Lives in the `board` schema — see the 0000_01_01_000000 migration. */
    protected $table = 'board.columns';

    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<BoardColumnFactory> */
    use HasFactory;

    use ReachesTheScreens;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'menu_category_id',
        'accent',
        'position',
        'is_visible',
    ];

    protected function casts(): array
    {
        return [
            'menu_category_id' => 'integer',
            'position' => 'integer',
            'is_visible' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    protected static function newFactory(): BoardColumnFactory
    {
        return BoardColumnFactory::new();
    }

    // ============ Scopes ============

    public function scopeVisible(Builder $query): Builder
    {
        return $query->where('is_visible', true);
    }

    /**
     * Left to right, the way the wall reads.
     *
     * `id` is the tie-break rather than `created_at`, and it matters: two
     * columns inserted in the same second by a seeder share a timestamp to the
     * millisecond, and a board whose two rightmost headings swap places between
     * renders is a board somebody reports as flickering.
     */
    public function scopeInBoardOrder(Builder $query): Builder
    {
        return $query->orderBy('position')->orderBy('id');
    }
}

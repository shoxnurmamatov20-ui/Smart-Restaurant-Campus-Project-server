<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One item of the opening checklist, ticked.
 *
 * A row exists only while the box is ticked: un-ticking deletes it. See the
 * migration — an item nobody has reached and an item somebody undid are the
 * same state, and a `false` row would invent a third the screen cannot draw.
 *
 * The SEVEN ITEMS live here rather than in the console, and that is the point
 * of the constant. A checklist whose items are defined in a browser is a
 * checklist that changes when somebody edits a fixture file, silently orphaning
 * every tick recorded against the old wording; the server owning the list is
 * what makes "four of seven done on 14 August" mean the same thing next year.
 *
 * No factory and no soft deletes. Rows are written by one controller and
 * deleted by the same one, and a journal that can be soft-deleted from is a
 * journal with two truths in it.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property Carbon $business_day
 * @property string $item
 * @property int|null $user_id
 * @property string|null $by_name
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $user
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|OpeningChecklistTick newModelQuery()
 * @method static Builder<static>|OpeningChecklistTick newQuery()
 * @method static Builder<static>|OpeningChecklistTick query()
 *
 * @mixin \Eloquent
 */
final class OpeningChecklistTick extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    protected $table = 'staff.opening_checklist_ticks';

    /**
     * The opening checklist, in the order a manager works down it.
     *
     * Seven, and they are the design's own (`Smart Restaurant OS.dc.html`,
     * the Schedule screen). Slugs rather than `c1..c7` because a tick recorded
     * in March has to still be readable in November, and `c4` is only readable
     * beside the file that numbered it.
     *
     * The words are NOT here. A key is stable and a sentence is not — a
     * restaurant reads this list in three languages and the console already
     * carries all three. What the server owns is which items exist.
     *
     * @var list<string>
     */
    public const ITEMS = [
        'float_counted',
        'fridge_temps',
        'dining_room',
        'sold_out_marked',
        'terminals_tested',
        'uniform_checked',
        'target_briefed',
    ];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'business_day',
        'item',
        'user_id',
        'by_name',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'business_day' => 'date',
            'user_id' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

<?php

declare(strict_types=1);

namespace Modules\Menu\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One dish, off in one kitchen.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $branch_id
 * @property int $menu_item_id
 * @property int|null $stopped_by
 * @property string|null $reason
 * @property Carbon|null $stopped_until
 * @property Carbon|null $cleared_at
 * @property int|null $cleared_by
 * @property-read bool $is_active
 * @property-read MenuItem|null $item
 *
 * @method static Builder<static>|MenuStopEntry open()
 * @method static Builder<static>|MenuStopEntry query()
 */
final class MenuStopEntry extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    protected $table = 'menu.menu_stop_list';

    protected $fillable = [
        'branch_id',
        'menu_item_id',
        'stopped_by',
        'reason',
        'stopped_until',
        'cleared_at',
        'cleared_by',
    ];

    protected function casts(): array
    {
        return [
            'stopped_until' => 'datetime',
            'cleared_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }

    /**
     * The rows that are still stopping something.
     *
     * Two conditions, and the second is the one that is easy to forget: a row
     * nobody cleared but whose `stopped_until` has passed is history as much as a
     * cleared one. Without it "no lamb until six" would keep lamb off the menu at
     * midnight, and the only way back would be a chef noticing.
     */
    public function scopeOpen(Builder $query): Builder
    {
        return $query
            ->whereNull('cleared_at')
            ->where(function (Builder $inner): void {
                $inner->whereNull('stopped_until')->orWhere('stopped_until', '>', now());
            });
    }

    /** Whether this row is stopping the dish right now. */
    public function isActive(): bool
    {
        return $this->cleared_at === null
            && ($this->stopped_until === null || $this->stopped_until->isFuture());
    }
}

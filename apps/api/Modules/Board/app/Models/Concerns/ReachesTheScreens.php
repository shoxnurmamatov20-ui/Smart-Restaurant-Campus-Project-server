<?php

declare(strict_types=1);

namespace Modules\Board\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * `published_at`, shared by all three lists.
 *
 * A row here is a working copy until somebody presses "push to board"; the
 * stamp is how the console answers "is the wall showing what I am looking at".
 * Three tables need the same two sentences about it, and three copies of a
 * comparison whose `>=` could drift to `>` in one of them is how a console ends
 * up telling one tab it is up to date and another that it is not.
 *
 * @phpstan-require-extends Model
 */
trait ReachesTheScreens
{
    /**
     * Changed since it last reached the screens.
     *
     * Never published counts as behind — a row nobody has pushed is a row the
     * wall has never heard of, which is a stronger form of out of date rather
     * than an exception to it.
     */
    public function isBehindTheScreens(): bool
    {
        if ($this->published_at === null) {
            return true;
        }

        return $this->updated_at !== null && $this->updated_at->greaterThan($this->published_at);
    }

    /**
     * The same question asked of a whole table, in SQL.
     *
     * `published_at is null or updated_at > published_at`, which is what the
     * method above says one row at a time. The console asks this once per
     * render for three tables, and doing it in PHP would mean loading every
     * banner a venue has ever written to find out whether any of them is newer
     * than the last push.
     *
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeBehindTheScreens(Builder $query): Builder
    {
        $table = $this->getTable();

        return $query->where(function (Builder $inner) use ($table): void {
            $inner->whereNull($table.'.published_at')
                ->orWhereColumn($table.'.updated_at', '>', $table.'.published_at');
        });
    }
}

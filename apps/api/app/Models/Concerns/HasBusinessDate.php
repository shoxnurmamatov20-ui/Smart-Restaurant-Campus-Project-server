<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Support\Tenancy\BusinessDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Stamp the trading day on the way in.
 *
 * DECISIONS Q3: the word "today" means the same thing everywhere, and it is
 * not the calendar's. A bill rung up at 01:30 belongs to the evening that is
 * still finishing, and every report has to agree about that without each one
 * re-deriving it — which is how two reports come to disagree.
 *
 * Written once, at creation, from the venue's own boundary. Deriving it at
 * read time would mean a branch that moves its opening hour silently rewrites
 * last month's Z-reports.
 */
trait HasBusinessDate
{
    public static function bootHasBusinessDate(): void
    {
        static::creating(function ($model): void {
            if ($model->business_date !== null) {
                return;
            }

            $source = $model->{static::businessDateSource()} ?? null;

            $model->business_date = app(BusinessDay::class)->dateFor(
                $source !== null ? CarbonImmutable::parse($source) : null,
            );
        });
    }

    /**
     * The timestamp the trading day is taken from.
     *
     * A payment's day is when it was taken, not when the row appeared, and an
     * order's is when it was fired. Models override this; the fallback is the
     * moment of creation.
     */
    protected static function businessDateSource(): string
    {
        return 'created_at';
    }

    /**
     * Rows belonging to one trading day.
     *
     * @param  Builder<*>  $query
     *
     * @return Builder<*>
     */
    public function scopeForBusinessDate(Builder $query, string $date): Builder
    {
        return $query->where('business_date', $date);
    }

    /**
     * Rows belonging to the trading day in progress.
     *
     * @param  Builder<*>  $query
     *
     * @return Builder<*>
     */
    public function scopeForCurrentBusinessDate(Builder $query): Builder
    {
        return $query->where('business_date', app(BusinessDay::class)->dateFor());
    }
}

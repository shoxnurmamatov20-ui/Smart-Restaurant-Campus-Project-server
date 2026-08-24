<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Modules\Tables\Database\Factories\BookingWindowFactory;

/**
 * When a venue takes bookings, in slots, with a ceiling per slot.
 *
 * One row is "Fridays, 18:00 to 23:00, every thirty minutes, twenty covers a
 * slot". A two-sitting restaurant has two rows for the same weekday; a venue
 * that is shut on Mondays simply has none, and the chooser draws no Mondays.
 *
 * See the migration for why capacity counts covers rather than tables, and why
 * `weekday` is ISO-8601.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $branch_id
 * @property int $weekday ISO-8601: 1 = Monday … 7 = Sunday
 * @property string $opens_at
 * @property string $closes_at
 * @property int $slot_minutes
 * @property int $capacity Guests per slot
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Tables\Database\Factories\BookingWindowFactory factory($count = null, $state = [])
 * @method static Builder<static>|BookingWindow active()
 * @method static Builder<static>|BookingWindow newModelQuery()
 * @method static Builder<static>|BookingWindow newQuery()
 * @method static Builder<static>|BookingWindow query()
 *
 * @mixin \Eloquent
 */
final class BookingWindow extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<BookingWindowFactory> */
    use HasFactory;

    protected $table = 'tables.booking_windows';

    /**
     * The shortest sitting anybody books in, and the longest.
     *
     * Fifteen minutes at the bottom because a canteen turns a table that fast;
     * four hours at the top because beyond that a "slot" is not a slot, it is
     * the evening, and a capacity spread over the whole evening tells a host
     * nothing about seven o'clock.
     */
    public const SLOT_MIN = 15;

    public const SLOT_MAX = 240;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'weekday',
        'opens_at',
        'closes_at',
        'slot_minutes',
        'capacity',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'weekday' => 'integer',
            'slot_minutes' => 'integer',
            'capacity' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected static function newFactory(): BookingWindowFactory
    {
        return BookingWindowFactory::new();
    }

    /**
     * @param  Builder<BookingWindow>  $query
     * @return Builder<BookingWindow>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * The instants this window offers on a given date.
     *
     * The last slot STARTS before `closes_at` rather than ending by it: a
     * restaurant that closes at 23:00 seats a table at 22:30, and a rule that
     * required the sitting to finish first would refuse the last booking of
     * every evening — which is the one a host most wants.
     *
     * Built on the date handed in, so the caller decides the timezone. The site
     * means the venue's own wall clock: `19:00` on a restaurant's page is seven
     * in the evening at that restaurant, which is the rule the booking form
     * already states.
     *
     * @return array<int, Carbon>
     */
    public function slotsOn(Carbon $day): array
    {
        $slot = max(self::SLOT_MIN, $this->slot_minutes);

        $cursor = $day->copy()->setTimeFromTimeString($this->opens_at);
        $closes = $day->copy()->setTimeFromTimeString($this->closes_at);

        /*
         * A window that closes before it opens runs past midnight — a bar
         * taking bookings from 18:00 to 01:00 — so the closing edge belongs to
         * the following day. Without this the loop below produces nothing and
         * the venue silently stops taking bookings on its busiest nights.
         */
        if ($closes->lessThanOrEqualTo($cursor)) {
            $closes->addDay();
        }

        $slots = [];

        while ($cursor->lessThan($closes)) {
            $slots[] = $cursor->copy();
            $cursor->addMinutes($slot);
        }

        return $slots;
    }

    /** Does this instant fall exactly on one of the window's slots? */
    public function covers(Carbon $at): bool
    {
        foreach ($this->slotsOn($at->copy()->startOfDay()) as $slot) {
            if ($slot->equalTo($at)) {
                return true;
            }
        }

        return false;
    }
}

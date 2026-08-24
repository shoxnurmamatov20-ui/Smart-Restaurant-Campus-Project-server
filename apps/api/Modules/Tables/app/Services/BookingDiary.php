<?php

declare(strict_types=1);

namespace Modules\Tables\Services;

use App\Models\Branch;
use Illuminate\Support\Carbon;
use Modules\Tables\Models\BookingWindow;
use Modules\Tables\Models\Reservation;

/**
 * What a venue can still take, slot by slot.
 *
 * One place, because two callers ask the same question from opposite sides and
 * they must never disagree: the website's time chooser asks "which slots may I
 * draw", and the booking endpoint asks "is this instant one of them, and is
 * there room". A chooser that offered a slot the endpoint refuses is a form
 * that rejects its own answers; an endpoint that accepted a slot the chooser
 * never drew is a booking nobody planned for.
 *
 * ---------------------------------------------------------------------------
 * Every clock here is a wall clock, read as it arrived
 *
 * `19:00` on a restaurant's own site means seven in the evening AT THAT
 * RESTAURANT. The booking form sends the time the guest picked with no zone on
 * it and says why: *"Stamping the browser's offset onto it would book a guest
 * in London a table at midnight."* A window's `opens_at` is a wall clock for
 * the same reason, and `starts_at` is stored exactly as it was sent.
 *
 * So nothing here converts anything. Three values in one frame compare
 * correctly; the moment one of them is re-zoned, an estate whose application
 * runs on UTC starts refusing its own evening service — measured, on the
 * ordering endpoint next door, before this comment existed.
 */
final class BookingDiary
{
    /**
     * Statuses that still hold a seat.
     *
     * A cancelled booking and a no-show do not, which is the whole point of
     * keeping them as separate words: the table they were going to have is
     * available again, and a capacity check that counted them would leave a
     * Friday looking full because four people rang to cancel.
     *
     * @var list<string>
     */
    private const HOLDING = ['pending', 'confirmed', 'seated'];

    /**
     * Every slot this venue offers on a date, with what is left in each.
     *
     * @return array<int, array{at: Carbon, capacity: int, booked: int, remaining: int}>
     */
    public function slotsOn(Branch $branch, Carbon $day): array
    {
        $local = $day->copy()->startOfDay();

        $windows = BookingWindow::query()
            ->active()
            ->where('branch_id', $branch->getKey())
            ->where('weekday', $local->isoWeekday())
            ->orderBy('opens_at')
            ->get();

        if ($windows->isEmpty()) {
            return [];
        }

        $booked = $this->bookedByMinute($branch, $local);
        $slots = [];

        foreach ($windows as $window) {
            foreach ($window->slotsOn($local) as $at) {
                $taken = $this->guestsIn($booked, $at, $window->slot_minutes);

                /*
                 * Keyed by the instant, so two windows that overlap — a split
                 * service somebody typed with a ragged edge — produce one slot
                 * rather than two competing capacities. The later window wins,
                 * which is arbitrary and stated here so it is not mistaken for a
                 * rule; overlapping windows are a data-entry mistake and the
                 * console's own form is where they should be refused.
                 */
                $slots[$at->getTimestamp()] = [
                    'at' => $at,
                    'capacity' => $window->capacity,
                    'booked' => $taken,
                    'remaining' => max(0, $window->capacity - $taken),
                ];
            }
        }

        ksort($slots);

        return array_values($slots);
    }

    /**
     * Can this venue take this party at this instant?
     *
     * Null means yes. Anything else is the sentence to show the guest, in Uzbek,
     * because it is read by somebody with no member of staff beside them.
     *
     * A venue with NO windows at all accepts everything, and that is deliberate:
     * booking windows are a feature a restaurant switches on by filling them in,
     * and every restaurant on the platform today has none. Refusing every
     * booking until somebody visits a settings page would be a feature that
     * looks like an outage.
     */
    public function refuse(Branch $branch, Carbon $at, int $guests): ?string
    {
        $configured = BookingWindow::query()
            ->where('branch_id', $branch->getKey())
            ->exists();

        if (! $configured) {
            return null;
        }

        foreach ($this->slotsOn($branch, $at->copy()->startOfDay()) as $slot) {
            if (! $slot['at']->equalTo($at)) {
                continue;
            }

            return $slot['remaining'] >= $guests
                ? null
                : 'Bu vaqtda joy qolmadi — boshqa vaqtni tanlang.';
        }

        return 'Bu vaqtda bron qabul qilinmaydi — boshqa vaqtni tanlang.';
    }

    /**
     * Every held cover on that date, keyed by the minute it starts.
     *
     * One query for the whole day rather than one per slot: an evening has
     * twenty-two slots in it and a chooser is redrawn every time a guest changes
     * the date.
     *
     * A range on the raw column, never `whereDate()` — `ModuleBoundaryTest`
     * refuses that family by name, because wrapping the column in a function
     * makes the index unusable and turns a public endpoint into a sequential
     * scan of the diary.
     *
     * @return array<int, int> minute-of-day => guests
     */
    private function bookedByMinute(Branch $branch, Carbon $day): array
    {
        $start = $day->copy()->startOfDay();

        $rows = Reservation::query()
            ->where('branch_id', $branch->getKey())
            ->whereIn('status', self::HOLDING)
            ->where('starts_at', '>=', $start)
            // Two days, because a window that runs past midnight puts its last
            // slots on tomorrow's date — see BookingWindow::slotsOn().
            ->where('starts_at', '<', $start->copy()->addDays(2))
            ->get(['starts_at', 'guests_count']);

        $booked = [];

        foreach ($rows as $row) {
            $minute = $row->starts_at->getTimestamp();
            $booked[$minute] = ($booked[$minute] ?? 0) + (int) $row->guests_count;
        }

        return $booked;
    }

    /**
     * How many covers are held inside one slot.
     *
     * The slot's own length, not an hour: a booking at 19:15 belongs to the
     * 19:00 sitting of a thirty-minute venue and to the 19:15 sitting of a
     * fifteen-minute one, and counting it against both would refuse bookings
     * a restaurant could take.
     *
     * @param array<int, int> $booked
     */
    private function guestsIn(array $booked, Carbon $at, int $slotMinutes): int
    {
        $from = $at->getTimestamp();
        $until = $from + max(1, $slotMinutes) * 60;
        $total = 0;

        foreach ($booked as $minute => $guests) {
            if ($minute >= $from && $minute < $until) {
                $total += $guests;
            }
        }

        return $total;
    }
}

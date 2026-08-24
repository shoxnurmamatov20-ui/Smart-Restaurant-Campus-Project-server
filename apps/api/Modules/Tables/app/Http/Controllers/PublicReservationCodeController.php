<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Modules\Tables\Models\Reservation;

/**
 * A guest's own booking, read and answered with the code they were given.
 *
 * The booking endpoint next door creates a row and tells the guest a code. This
 * is what the code is for. Without it a stranger who wants to confirm — or, far
 * more usefully to the restaurant, to CANCEL — has to telephone a room that is
 * busy serving dinner. What happens instead is nothing: the table stays held
 * for a party that is not coming, and the evening is short one cover that
 * somebody else wanted.
 *
 * ---------------------------------------------------------------------------
 * The code is the whole credential, and that is a decision
 *
 * Ten random characters from a 31-letter alphabet with the confusable pairs
 * removed — see `Reservation::newCode()`. Unguessable rather than secret: it
 * travels by SMS and gets read aloud, exactly like a table's printed QR token.
 *
 * The order-tracking endpoint next door asks for a second factor (the last four
 * digits of the phone) and this deliberately does not, because the two are not
 * the same risk. A bill number is SEQUENTIAL — `A-0041` is one keystroke from
 * somebody else's address — so it needs the second half. A random code has no
 * neighbour to guess.
 *
 * What it exposes is also narrower than tracking: a name, a party size, a time
 * and a status. No address, no telephone number, no other bookings, and nothing
 * about the rest of the restaurant's evening. A public endpoint that echoed the
 * diary back would be a reconnaissance tool with a booking form attached.
 *
 * ---------------------------------------------------------------------------
 * Why confirming is a guest's to do at all
 *
 * A public booking lands `pending` and a manager confirms it against the diary.
 * That is the restaurant's half. The guest's half is the other direction: "yes,
 * we are still coming", which is what the reminder message asks and what turns a
 * maybe into a table somebody will actually sit at. Both write the same word,
 * and the row records which source asked for it.
 */
final class PublicReservationCodeController extends Controller
{
    /** What the guest booked, as much of it as is theirs to see. */
    public function show(string $code): JsonResponse
    {
        return response()->json(['data' => $this->payload($this->findOrFail($code))]);
    }

    /**
     * "Yes, we are coming."
     *
     * Idempotent by construction: `Reservation::confirm()` accepts a booking
     * that is already `confirmed` and answers true, so a guest who taps the link
     * in the message twice is told the same thing twice rather than being shown
     * an error for agreeing.
     */
    public function confirm(string $code): JsonResponse
    {
        $reservation = $this->findOrFail($code);

        if (! $reservation->confirm()) {
            throw ApiException::of('tables.reservation_closed', field: 'code');
        }

        return response()->json(['data' => $this->payload($reservation->refresh())]);
    }

    /**
     * "We are not coming after all."
     *
     * The most commercially valuable request on this controller and the reason
     * it exists. A cancelled booking releases its covers immediately — see
     * `BookingDiary::HOLDING` — so the slot is back on the website's chooser
     * before the guest has put their phone down.
     *
     * Refused once the party has been seated: a booking somebody is sitting at
     * is not a booking any more, and letting a code cancel it would take a live
     * table off the floor plan from outside the building.
     */
    public function cancel(string $code): JsonResponse
    {
        $reservation = $this->findOrFail($code);

        if (in_array($reservation->status, Reservation::CLOSED_STATUSES, true) || $reservation->status === 'seated') {
            throw ApiException::of('tables.reservation_closed', field: 'code');
        }

        $reservation->cancel();

        return response()->json(['data' => $this->payload($reservation->refresh())]);
    }

    /**
     * The booking, or 404 — never "wrong restaurant" and never "wrong code".
     *
     * One answer for every miss, because the alternatives together are an
     * oracle: a code that answered "not yours" would confirm that it exists.
     */
    private function findOrFail(string $code): Reservation
    {
        $reservation = Reservation::findByCode($code);

        if ($reservation === null) {
            throw ApiException::of('tables.reservation_not_found', field: 'code');
        }

        return $reservation;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Reservation $reservation): array
    {
        return [
            'code' => $reservation->code,
            'status' => $reservation->status,
            'guest_name' => $reservation->guest_name,
            'guests_count' => (int) $reservation->guests_count,
            'starts_at' => $reservation->starts_at->toIso8601String(),
            'branch_id' => $reservation->branch_id === null ? null : (int) $reservation->branch_id,
            /*
             * Says a table is held, not that a request landed. The site prints
             * "we will ring you back" until this turns true, which is the promise
             * `PublicReservationController` makes and this one has to keep.
             */
            'confirmed' => $reservation->status === 'confirmed',
            // Whether the guest may still call it off from here. A seated party
            // cannot, and a screen that drew the button anyway would be offering
            // an action that always fails.
            'cancellable' => ! in_array($reservation->status, Reservation::CLOSED_STATUSES, true)
                && $reservation->status !== 'seated',
        ];
    }
}

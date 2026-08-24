<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Modules\Tables\Http\Requests\PublicReservationRequest;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Services\BookingDiary;

/**
 * "Stol band qilish" on a restaurant's own website.
 *
 * The second thing this platform lets a stranger write, after nothing. That is
 * the whole design brief: every decision below is about a form on the open
 * internet that creates rows in a real restaurant's diary.
 *
 * ---------------------------------------------------------------------------
 * What stops it being a spam cannon
 *
 * **Throttled at the route** — five a minute per address, which is four more
 * than a person booking dinner needs and far fewer than a script wants.
 *
 * **`pending`, always.** A public booking is a request, not a reservation. A
 * manager confirms it against the diary, and until they do it holds no table —
 * so a flood costs a list to clear rather than a night's covers.
 *
 * **One live booking per number per day.** A guest who submits twice because
 * the first tap did not look like it worked gets their own booking back rather
 * than a second one, and somebody filling the diary with one number has to
 * bring a new number for each row.
 *
 * ---------------------------------------------------------------------------
 * What it answers with, and what it does not
 *
 * The id, the time and the status. Not the table, because none is assigned yet;
 * not the diary around it, because "who else is coming on Friday" is not a
 * stranger's business. A public endpoint that echoed the restaurant's evening
 * back would be a reconnaissance tool with a booking form attached.
 */
final class PublicReservationController extends Controller
{
    public function __construct(private readonly BookingDiary $diary) {}

    public function __invoke(PublicReservationRequest $request): JsonResponse
    {
        $phone = $this->normalise((string) $request->string('guest_phone'));
        $startsAt = $request->date('starts_at');
        $branch = $this->branchOrNull($request->input('branch_id'));

        if ($startsAt === null) {
            // Unreachable through validation; here because `date()` is nullable
            // and a null below would become a booking for the epoch.
            throw ApiException::of('tables.reservation_invalid', field: 'starts_at');
        }

        /*
         * The same number, the same day, still live.
         *
         * Returned rather than refused. A guest who taps twice on a slow
         * connection has not done anything wrong, and an error would send them
         * to submit a third time — the outcome they wanted has already
         * happened, so this says so.
         */
        /*
         * A range on the raw column, never `whereDate()`.
         *
         * `whereDate` compiles to `date(starts_at) = ?`, and PostgreSQL cannot
         * use an index on a column it has to transform first — so this check
         * would sequentially scan the diary. On an anonymous endpoint anybody
         * may call five times a minute, that is a scan somebody else chose to
         * run on the table that grows fastest. `ModuleBoundaryTest` refuses the
         * whole family by name, which is how this was caught here rather than
         * noticed in production a year from now.
         *
         * **Not `BusinessDay` either**, and that is worth stating because it is
         * the helper the test's own message points at. It answers a trading-day
         * question in the *venue's* timezone — the till's day, which runs past
         * midnight — and `starts_at` is compared in the application's. Measured:
         * with the venue five hours ahead, a 19:00 booking landed exactly on the
         * window's exclusive edge and every duplicate check missed. A diary's
         * day is the calendar day of the value itself, in the frame it is
         * stored in, and this is that with no translation in between.
         */
        $dayStart = $startsAt->copy()->startOfDay();

        $existing = Reservation::query()
            ->where('guest_phone', $phone)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('starts_at', '>=', $dayStart)
            ->where('starts_at', '<', $dayStart->copy()->addDay())
            ->first();

        if ($existing !== null) {
            return $this->answer($existing, duplicate: true);
        }

        /*
         * The diary's own answer, and the reason booking windows exist.
         *
         * Until now this endpoint accepted any instant inside ninety days, so a
         * stranger could book 04:30 on a Tuesday and the only thing stopping a
         * table being held was that a person had to read it and ring back. That
         * call is one the restaurant pays for, about a slot the website should
         * never have offered.
         *
         * A venue with no windows configured accepts everything — see
         * `BookingDiary::refuse()` for why that is the right default rather than
         * an oversight.
         */
        $refusal = $branch === null
            ? null
            : $this->diary->refuse($branch, $startsAt, $request->integer('guests_count'));

        if ($refusal !== null) {
            // `$branch` cannot be null here — a null branch skips the diary
            // above and leaves `$refusal` null — but PHPStan cannot see that
            // through the ternary, and a nullsafe cast that answers 0 would put
            // a venue id nobody has on the wire.
            throw ApiException::of('tables.slot_unavailable', field: 'starts_at', meta: [
                'detail' => $refusal,
                'branch_id' => $branch === null ? null : (int) $branch->getKey(),
            ]);
        }

        $reservation = Reservation::create([
            // Null leaves it to `BelongsToBranch` and then to the manager who
            // confirms — see `branchOrNull()`.
            'branch_id' => $branch?->getKey(),
            'guest_name' => trim((string) $request->string('guest_name')),
            'guest_phone' => $phone,
            'guests_count' => $request->integer('guests_count'),
            'starts_at' => $startsAt,
            // Never from the request — see PublicReservationRequest.
            'status' => 'pending',
            'source' => 'web',
            'note' => $request->filled('note') ? trim((string) $request->string('note')) : null,
        ]);

        return $this->answer($reservation, duplicate: false);
    }

    /**
     * Which venue is holding the table, when anybody can say.
     *
     * Softer than `PublicOrderController::branchOrFail()` next door, and the
     * difference is real rather than an oversight. An order has to be COOKED
     * somewhere, so a delivery with no venue is a request nobody can act on. A
     * booking is a request for a table: it lands `pending`, holds nothing, and
     * the manager who confirms it is the person who decides which room — which
     * is exactly what has been happening since this endpoint was written, with
     * no `branch_id` at all.
     *
     * So: an id that was sent must be a real, open venue of this restaurant — a
     * guest who picked Sergeli and was quietly booked into Chilonzor is a family
     * standing in the wrong doorway. An id that was NOT sent resolves to the
     * single venue when there is only one, and to nothing when there is a choice
     * to make. Null means the diary check is skipped too, because windows belong
     * to a room and there is no room yet.
     */
    private function branchOrNull(mixed $branchId): ?Branch
    {
        if ($branchId === null || $branchId === '') {
            $venues = Branch::query()->where('status', 'active')->take(2)->get();

            return $venues->count() === 1 ? $venues->first() : null;
        }

        /** @var Branch|null $branch */
        $branch = Branch::query()->whereKey((int) $branchId)->first();

        if ($branch === null || ! $branch->isActive()) {
            throw ApiException::of('tables.branch_required', field: 'branch_id');
        }

        return $branch;
    }

    /**
     * Digits and a leading plus, and nothing else.
     *
     * `+998 90 123 45 67`, `998901234567` and `+998-90-123-45-67` are one guest
     * ringing one number, and stored as written they are three rows the
     * duplicate check above cannot see. Normalising is what makes that check
     * mean anything.
     */
    private function normalise(string $phone): string
    {
        $digits = preg_replace('/[^0-9+]/', '', $phone) ?? '';

        // A plus is only a plus at the front. `998+90` is a typo, not a country.
        return str_starts_with($digits, '+')
            ? '+'.str_replace('+', '', mb_substr($digits, 1))
            : str_replace('+', '', $digits);
    }

    private function answer(Reservation $reservation, bool $duplicate): JsonResponse
    {
        return response()->json([
            'data' => [
                'id' => $reservation->id,
                'status' => $reservation->status,
                /* `->`, not `?->`: `starts_at` is a required column with a `datetime`
                 * cast, so the model always answers a Carbon here. The nullsafe
                 * read said otherwise and made a reader wonder which reservations
                 * have no time. */
                'starts_at' => $reservation->starts_at->toIso8601String(),
                'guests_count' => $reservation->guests_count,
                /*
                 * Says the request landed rather than that a table is held.
                 *
                 * The site prints "we will ring you back", and this is the flag
                 * that keeps that promise honest: a screen that said "booked"
                 * would have a guest arriving on Friday expecting a table
                 * nobody agreed to.
                 */
                'confirmed' => $reservation->status === 'confirmed',
                'duplicate' => $duplicate,
                'branch_id' => $reservation->branch_id === null ? null : (int) $reservation->branch_id,
                /*
                 * The code, and it is the only thing the guest is given.
                 *
                 * With it they can read this booking back, confirm it, or call
                 * it off — see PublicReservationCodeController. Without it a
                 * stranger who wants to cancel has to telephone a restaurant
                 * that is busy serving dinner, which is how a table stays held
                 * for a party that is not coming.
                 */
                'code' => $reservation->code,
            ],
        ], $duplicate ? 200 : 201);
    }
}

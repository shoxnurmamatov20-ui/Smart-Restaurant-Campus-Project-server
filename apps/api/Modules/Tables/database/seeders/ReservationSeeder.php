<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Models\RestaurantTable;

/**
 * Tonight's book.
 *
 * TablesDatabaseSeeder lays out three halls and twenty-four tables and books
 * none of them, so the floor screen's reservation panel is empty and the
 * "reserved" tile state — one of the five the design draws — never appears.
 *
 * Today's bookings are placed relative to the moment of seeding rather than at
 * fixed hours. A diary written at 12:00 and 13:00 is a diary with nothing left
 * in it if the database is built after lunch, and the state a host spends the
 * shift on — the party that has not arrived yet — is the one that would go
 * missing. So: one party seated an hour ago, one that never turned up, two
 * still to come, and tomorrow evening already filling.
 *
 * Each booking is sized to its table and holds it for two hours. Two parties
 * are never given the same table at the same time — a double-booked table is
 * not a busy restaurant, it is a bug, and seeding one would hide the check that
 * should catch it.
 *
 * The tables are moved to match. A seated party makes its table occupied and a
 * confirmed booking later today makes its table reserved, so the floor screen
 * and the diary tell the same story; a demo where the book says 19:00 and the
 * plan says the table is free teaches the reader to trust neither.
 */
final class ReservationSeeder extends Seeder
{
    /**
     * The diary. `at` is hours from now for today's bookings, and `day` is 1
     * for tomorrow's — which are at fixed hours, because tomorrow has a whole
     * evening in it whatever time this runs.
     *
     * @var array<int, array{name: string, phone: string, guests: int, day: int, at: int, status: string, source: string, note: ?string}>
     */
    private const BOOKINGS = [
        [
            'name' => 'Kamolov Rustam', 'phone' => '+998901234501', 'guests' => 6,
            'day' => 0, 'at' => -1, 'status' => 'seated', 'source' => 'phone',
            'note' => "Deraza yonidagi stol so'radi",
        ],
        [
            // The one that teaches the screen its job: a no-show still holds a
            // record, because the host needs to know before the same number
            // books again.
            'name' => 'Ergashev Otabek', 'phone' => '+998901234504', 'guests' => 4,
            'day' => 0, 'at' => -2, 'status' => 'no_show', 'source' => 'phone', 'note' => null,
        ],
        [
            'name' => 'Yusupova Nilufar', 'phone' => '+998901234502', 'guests' => 4,
            'day' => 0, 'at' => 1, 'status' => 'confirmed', 'source' => 'bot', 'note' => null,
        ],
        [
            'name' => 'Toshev Sherzod', 'phone' => '+998901234503', 'guests' => 2,
            'day' => 0, 'at' => 3, 'status' => 'confirmed', 'source' => 'web',
            'note' => "Tug'ilgan kun — tort olib kelishadi",
        ],
        [
            'name' => 'Sobirova Zilola', 'phone' => '+998901234505', 'guests' => 8,
            'day' => 1, 'at' => 18, 'status' => 'pending', 'source' => 'web',
            'note' => 'Korporativ kechki ovqat, hisob-faktura kerak',
        ],
        [
            'name' => 'Aliyev Doniyor', 'phone' => '+998901234506', 'guests' => 3,
            'day' => 1, 'at' => 20, 'status' => 'confirmed', 'source' => 'bot', 'note' => null,
        ],
    ];

    /** How long a table is held. Two hours is the industry's default turn. */
    private const HOURS_HELD = 2;

    public function run(): void
    {
        $tables = RestaurantTable::query()
            ->where('is_active', true)
            ->orderBy('seats')
            ->orderBy('id')
            ->get();

        if ($tables->isEmpty()) {
            $this->command?->warn('⏭  Tables: stol yo\'q — avval TablesDatabaseSeeder.');

            return;
        }

        /** @var array<int, array<int, array{0: Carbon, 1: Carbon}>> $held */
        $held = [];
        /** @var array<int, string> $floor */
        $floor = [];
        $booked = 0;

        foreach (self::BOOKINGS as $booking) {
            $starts = self::startOf($booking);
            $ends = $starts->copy()->addHours(self::HOURS_HELD);

            $fits = fn (RestaurantTable $candidate): bool => $candidate->seats >= $booking['guests'];

            // The smallest table that fits and is untouched — then, only if the
            // room is full of half-used tables, the smallest that fits and is
            // merely free for this window.
            //
            // Both halves matter. Seating four at a twelve-top on a busy night
            // is how a restaurant turns away the party of twelve; seating two
            // parties at the same top is how it loses one of them. And a host
            // spreads a quiet evening across the room rather than turning one
            // table six times, which is what picking purely by size produced —
            // four of six bookings on the same four-seater.
            $table = $tables->first(
                fn (RestaurantTable $candidate): bool => $fits($candidate)
                    && ! isset($held[$candidate->id]),
            ) ?? $tables->first(
                fn (RestaurantTable $candidate): bool => $fits($candidate)
                    && ! self::clashes($held[$candidate->id] ?? [], $starts, $ends),
            );

            if ($table === null) {
                continue;
            }

            $held[$table->id][] = [$starts, $ends];

            Reservation::query()->updateOrCreate(
                ['guest_phone' => $booking['phone']],
                [
                    'tenant_id' => $table->tenant_id,
                    'branch_id' => $table->branch_id,
                    'restaurant_table_id' => $table->id,
                    'guest_name' => $booking['name'],
                    'guests_count' => $booking['guests'],
                    'starts_at' => $starts,
                    'ends_at' => $ends,
                    'status' => $booking['status'],
                    'source' => $booking['source'],
                    'note' => $booking['note'],
                ],
            );

            $booked++;

            // A party in their seats outranks a party expected later: the same
            // table can be both, and only one of them is what a host sees when
            // they look at the room.
            if ($booking['status'] === 'seated') {
                $floor[$table->id] = 'occupied';
            } elseif (($floor[$table->id] ?? null) === null && self::holdsToday($booking['status'], $starts)) {
                $floor[$table->id] = 'reserved';
            }
        }

        foreach ($floor as $tableId => $status) {
            RestaurantTable::query()->whereKey($tableId)->update(['status' => $status]);
        }

        $this->command?->info(sprintf(
            '✅ Tables: %d ta bron yozildi, %d stol holati yangilandi.',
            $booked,
            count($floor),
        ));
    }

    /** @param  array{name: string, phone: string, guests: int, day: int, at: int, status: string, source: string, note: ?string}  $booking */
    private static function startOf(array $booking): Carbon
    {
        return $booking['day'] === 0
            ? now()->startOfHour()->addHours($booking['at'])
            : now()->startOfDay()->addDays($booking['day'])->addHours($booking['at']);
    }

    /**
     * Does this window run into one the table already holds?
     *
     * Touching ends do not clash: a table released at 19:00 can be booked from
     * 19:00, which is how a restaurant turns a table twice in an evening.
     *
     * @param  array<int, array{0: Carbon, 1: Carbon}>  $windows
     */
    private static function clashes(array $windows, Carbon $starts, Carbon $ends): bool
    {
        foreach ($windows as [$heldFrom, $heldTo]) {
            if ($starts->lt($heldTo) && $ends->gt($heldFrom)) {
                return true;
            }
        }

        return false;
    }

    /** A booking that still has to be honoured today, and so holds its table. */
    private static function holdsToday(string $status, Carbon $starts): bool
    {
        return in_array($status, ['pending', 'confirmed'], true)
            && $starts->isFuture()
            && $starts->isToday();
    }
}

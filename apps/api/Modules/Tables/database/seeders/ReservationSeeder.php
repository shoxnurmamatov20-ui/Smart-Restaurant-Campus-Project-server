<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Models\RestaurantTable;

/**
 * Tonight's book.
 *
 * TablesDatabaseSeeder lays out three halls and twenty-four tables and books
 * none of them, so the floor screen's reservation panel is empty and the
 * "reserved" tile state — one of the five the design draws — never appears.
 *
 * Bookings run from this morning into tomorrow evening, because a host reads
 * two things: who is still to arrive today, and what tomorrow looks like. One
 * party has already been seated, one did not turn up, and one is waiting to be
 * confirmed — the three states a host actually resolves during a shift.
 *
 * Each booking is sized to its table. A party of ten at a four-top is not a
 * booking, it is a bug, and seeding one would hide the check that should catch
 * it.
 */
final class ReservationSeeder extends Seeder
{
    /**
     * @var array<int, array{name: string, phone: string, guests: int, hour: int, day: int, status: string, source: string, note: ?string}>
     */
    private const BOOKINGS = [
        [
            'name' => 'Kamolov Rustam', 'phone' => '+998901234501', 'guests' => 6,
            'hour' => 12, 'day' => 0, 'status' => 'seated', 'source' => 'phone',
            'note' => 'Deraza yonidagi stol so\'radi',
        ],
        [
            'name' => 'Yusupova Nilufar', 'phone' => '+998901234502', 'guests' => 4,
            'hour' => 13, 'day' => 0, 'status' => 'confirmed', 'source' => 'bot', 'note' => null,
        ],
        [
            'name' => 'Toshev Sherzod', 'phone' => '+998901234503', 'guests' => 2,
            'hour' => 19, 'day' => 0, 'status' => 'confirmed', 'source' => 'web',
            'note' => 'Tug\'ilgan kun — tort olib kelishadi',
        ],
        [
            // The one that teaches the screen its job: a no-show still holds a
            // record, because the host needs to know before the same number
            // books again.
            'name' => 'Ergashev Otabek', 'phone' => '+998901234504', 'guests' => 4,
            'hour' => 14, 'day' => 0, 'status' => 'no_show', 'source' => 'phone', 'note' => null,
        ],
        [
            'name' => 'Sobirova Zilola', 'phone' => '+998901234505', 'guests' => 8,
            'hour' => 18, 'day' => 1, 'status' => 'pending', 'source' => 'web',
            'note' => 'Korporativ kechki ovqat, hisob-faktura kerak',
        ],
        [
            'name' => 'Aliyev Doniyor', 'phone' => '+998901234506', 'guests' => 3,
            'hour' => 20, 'day' => 1, 'status' => 'confirmed', 'source' => 'bot', 'note' => null,
        ],
    ];

    /** How long a table is held. Two hours is the industry's default turn. */
    private const HOURS_HELD = 2;

    public function run(): void
    {
        $tables = RestaurantTable::query()->where('is_active', true)->orderBy('seats')->get();

        if ($tables->isEmpty()) {
            $this->command?->warn('⏭  Tables: stol yo\'q — avval TablesDatabaseSeeder.');

            return;
        }

        $booked = 0;

        foreach (self::BOOKINGS as $booking) {
            // The smallest table that fits. Seating four at a twelve-top on a
            // busy night is how a restaurant turns away the party of twelve.
            $table = $tables->first(fn ($candidate): bool => $candidate->seats >= $booking['guests']);

            if ($table === null) {
                continue;
            }

            $starts = now()->startOfDay()->addDays($booking['day'])->addHours($booking['hour']);

            Reservation::query()->updateOrCreate(
                ['guest_phone' => $booking['phone'], 'starts_at' => $starts],
                [
                    'tenant_id' => $table->tenant_id,
                    'branch_id' => $table->branch_id,
                    'restaurant_table_id' => $table->id,
                    'guest_name' => $booking['name'],
                    'guests_count' => $booking['guests'],
                    'ends_at' => $starts->copy()->addHours(self::HOURS_HELD),
                    'status' => $booking['status'],
                    'source' => $booking['source'],
                    'note' => $booking['note'],
                ],
            );

            $booked++;
        }

        $this->command?->info("✅ Tables: {$booked} ta bron yozildi (bugun va ertaga).");
    }
}

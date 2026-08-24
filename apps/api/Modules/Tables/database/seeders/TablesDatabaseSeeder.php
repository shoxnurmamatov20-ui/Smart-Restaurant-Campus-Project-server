<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;
use Modules\Tables\Models\BookingWindow;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;

/**
 * A believable floor plan: three halls, 24 tables — and the hours it takes
 * bookings in.
 */
final class TablesDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $plan = [
            ['code' => 'MAIN', 'name' => 'Asosiy zal', 'prefix' => 'A', 'count' => 12, 'seats' => 4, 'kind' => 'regular'],
            ['code' => 'TERR', 'name' => 'Terassa', 'prefix' => 'T', 'count' => 8, 'seats' => 6, 'kind' => 'terrace'],
            ['code' => 'VIP', 'name' => 'VIP zal', 'prefix' => 'V', 'count' => 4, 'seats' => 10, 'kind' => 'vip'],
        ];

        $tables = 0;
        $sort = 10;

        foreach ($plan as $row) {
            $hall = Hall::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'capacity' => $row['count'] * $row['seats'],
                    'sort_order' => $sort,
                    'is_active' => true,
                ],
            );
            $sort += 10;

            for ($i = 1; $i <= $row['count']; $i++) {
                RestaurantTable::query()->updateOrCreate(
                    ['label' => sprintf('%s-%d', $row['prefix'], $i)],
                    [
                        'hall_id' => $hall->id,
                        'seats' => $row['seats'],
                        'kind' => $row['kind'],
                        'status' => 'free',
                        /*
                         * No `qr_token` here, and its absence is the fix.
                         *
                         * This seeder is `updateOrCreate` and re-run often, and
                         * it used to mint a fresh token every time — so every
                         * `db:seed` silently invalidated every QR sticker in a
                         * demo venue. The model issues one on create and nothing
                         * re-issues it afterwards.
                         */
                        'is_active' => true,
                    ],
                );
                $tables++;
            }
        }

        $windows = $this->bookingWindows();

        $this->command?->info(sprintf(
            '✅ Tables: %d zal, %d stol, %d bron oynasi yaratildi.',
            count($plan),
            $tables,
            $windows,
        ));
    }

    /**
     * Every venue takes bookings every day, 10:00 to 23:00, in half hours.
     *
     * Generous on purpose. These windows are what the website's chooser draws
     * and what the public booking endpoint enforces, so a demo restaurant with
     * narrow ones would look broken to whoever tries the form — and the point of
     * the seed is that the feature is visible, not that it is restrictive. A
     * real venue narrows them on the console's own screen.
     *
     * Forty covers a slot is roughly the seeded floor plan: 24 tables at an
     * average of five seats is 120 seats, and a half-hour sitting turning them
     * three times over an evening is about this.
     *
     * `updateOrCreate` on the natural key, like everything else here, so a
     * re-seed does not double a venue's capacity — and `withoutGlobalScope`
     * on the venue, which is what makes that true.
     *
     * `BookingWindow` carries `BelongsToBranch`, so its lookups are narrowed to
     * whatever venue happens to be in context. A seed run is a long process and
     * an earlier seeder leaves one there; the second `db:seed` in the same
     * process then searched for "branch 12's Monday, inside branch 7" — found
     * nothing, inserted, and hit `booking_windows_one_per_start`. The branch is
     * named in the key below, so the scope has nothing to add and everything to
     * break. Tenancy is deliberately left ON: this must never reach across
     * restaurants.
     */
    private function bookingWindows(): int
    {
        $made = 0;

        foreach (Branch::query()->get() as $branch) {
            for ($weekday = 1; $weekday <= 7; $weekday++) {
                BookingWindow::query()->withoutGlobalScope('branch')->updateOrCreate(
                    ['branch_id' => $branch->getKey(), 'weekday' => $weekday, 'opens_at' => '10:00'],
                    [
                        'closes_at' => '23:00',
                        'slot_minutes' => 30,
                        'capacity' => 40,
                        'is_active' => true,
                    ],
                );
                $made++;
            }
        }

        return $made;
    }
}

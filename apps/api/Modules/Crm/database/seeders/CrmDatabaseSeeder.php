<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\CustomerDish;

/**
 * The demo restaurant's four regulars.
 *
 * Each one now carries a segment, a last visit and a usual order, because a
 * console whose guests have none of the three draws exactly the screens this
 * wave was built to stop drawing: an at-risk list with nobody on it, a "last
 * seen" column of dashes, and a caller card with two blank lines under a real
 * person's name.
 *
 * The four are chosen to put one guest in each state a screen has to render —
 * a regular seen this week, a corporate account, an occasional visitor, and one
 * who has quietly stopped coming. Deterministic, like every seeder here: the
 * days below are offsets from today, so the fourth guest is thirty-eight days
 * lapsed on Tuesday and on Thursday alike.
 */
final class CrmDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $guests = [
            [
                'phone' => '+998901112233', 'name' => 'Aziz Karimov', 'spent' => 620000000,
                'segment' => 'regular', 'seen' => 2, 'dish' => "Osh, to'y oshi", 'dish_id' => 101,
            ],
            [
                'phone' => '+998902223344', 'name' => 'Dilnoza Yusupova', 'spent' => 180000000,
                // Set by hand and never recomputed — `crm:segment` walks past it.
                'segment' => 'corporate', 'seen' => 1, 'dish' => "Lag'mon, qovurma", 'dish_id' => 102,
            ],
            [
                'phone' => '+998903334455', 'name' => 'Bekzod Tursunov', 'spent' => 45000000,
                'segment' => 'occasional', 'seen' => 12, 'dish' => 'Manti, 5 dona', 'dish_id' => 103,
            ],
            [
                'phone' => '+998904445566', 'name' => 'Malika Sobirova', 'spent' => 12000000,
                'segment' => 'at_risk', 'seen' => 38, 'dish' => 'Somsa, mol', 'dish_id' => 104,
            ],
        ];

        foreach ($guests as $g) {
            $customer = Customer::query()->updateOrCreate(
                ['phone' => $g['phone']],
                [
                    'name' => $g['name'],
                    'visits_count' => max(1, (int) ($g['spent'] / 8000000)),
                    'total_spent' => $g['spent'],
                    'points' => (int) ($g['spent'] / 100000),
                    'is_active' => true,
                    'segment' => $g['segment'],
                    'last_visit_at' => now()->subDays((int) $g['seen'])->setTime(19, 40),
                ],
            );
            $customer->recalculateTier();

            /*
             * The tally as well as the denormalised title, so the two agree from
             * the first render. Seeding only the column would leave a caller card
             * that says "usually orders plov" over a working that says nothing —
             * which is the drift the tally exists to prevent.
             */
            CustomerDish::query()->updateOrCreate(
                ['customer_id' => $customer->id, 'menu_item_id' => (int) $g['dish_id']],
                ['title' => (string) $g['dish'], 'times' => 4, 'last_at' => $customer->last_visit_at],
            );

            $customer->forceFill([
                'usual_order' => (string) $g['dish'],
                'usual_order_item_id' => (int) $g['dish_id'],
            ])->save();
        }

        $this->command?->info(sprintf('✅ CRM: %d mijoz yaratildi.', count($guests)));
    }
}

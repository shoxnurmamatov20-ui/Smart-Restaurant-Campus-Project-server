<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;

/**
 * The ledger that explains the shelf.
 *
 * InventoryDatabaseSeeder puts a balance on every ingredient and no history
 * behind it, so the storekeeper's screen shows a quantity nobody can account
 * for and the "last movement" column has nothing to say. A running balance with
 * no movements under it is not stock control; it is a number somebody typed.
 *
 * The week is built so it *arrives* at the balance that is already there. Each
 * ingredient's events are laid out first — the deliveries that actually
 * happened, the kitchen's daily draw, the odd write-off — and the opening count
 * is then whatever it must have been for today's figure to come out right. The
 * closing balance therefore equals `stock_quantity` by construction, not by
 * coincidence, which is the one property this file exists to guarantee: a
 * storekeeper who adds the column up gets the number on the shelf.
 *
 * Deliveries are read from the purchase orders rather than invented, so a
 * receipt of eighteen kilograms of lamb points at the document that brought it.
 * Read through the query builder, not the model: Inventory may not import
 * Suppliers — only the reverse edge is recorded in ModuleBoundaryTest — and
 * seeders are exempt from the raw-table rule precisely so a derived seeder can
 * do this without opening a runtime dependency.
 *
 * Derived once. A second `db:seed` leaves the ledger alone rather than laying a
 * second week on top of the first, which would double the history and break the
 * agreement above. `migrate:fresh --seed` rebuilds it.
 */
final class StockMovementSeeder extends Seeder
{
    /** How many days of history the ledger covers, ending today. */
    private const DAYS = 7;

    /**
     * When the kitchen opens and when it stops drawing stock.
     *
     * A closed day's consumption is booked once, at the end of service. Today's
     * is booked for however much of that window has already gone — a storekeeper
     * looking at the ledger at lunchtime should see the morning, not a full day
     * that has not happened yet.
     */
    private const SERVICE_FROM = 8;

    private const SERVICE_TO = 21;

    /**
     * The shape of a week's trade, as a percentage of the daily draw.
     *
     * A flat line would be simpler and would teach the screen nothing: a
     * kitchen consumes half again as much on a Saturday as on a Tuesday, and
     * the coverage rail is only interesting when the burn rate is not constant.
     *
     * @var array<int, int>
     */
    private const DAY_SHAPE = [90, 85, 100, 110, 130, 145, 95];

    /**
     * What was thrown away, and why.
     *
     * Perishables only, because that is what actually spoils, and two of them
     * dated today so the "waste today" figure above the table is a figure and
     * not a zero. A write-off with no reason is the one movement kind that is
     * worse than no movement at all — it is a loss nobody can analyse.
     *
     * @var array<string, array{quantity: int, day: int, hour: int, reason: string}>
     */
    private const WASTE = [
        'ING-0009' => ['quantity' => 1200, 'day' => 0, 'hour' => 9, 'reason' => 'Ezilib ketgan — yaroqsiz'],
        'ING-0003' => ['quantity' => 800, 'day' => 0, 'hour' => 10, 'reason' => 'Muddati tugadi'],
        'ING-0005' => ['quantity' => 2000, 'day' => -3, 'hour' => 16, 'reason' => 'Qurib qolgan, oshxona qaytardi'],
        'ING-0008' => ['quantity' => 1000, 'day' => -5, 'hour' => 11, 'reason' => 'Idish yorilgan'],
    ];

    /**
     * What the monthly count found, in thousandths of the reorder point.
     *
     * Signed: negative is stock that was on the book and not on the shelf,
     * which is the direction that costs money and the one a manager chases.
     * Three ingredients out of ten, because a count where everything balances
     * is a count nobody ran.
     *
     * @var array<string, int>
     */
    private const VARIANCE = [
        'ING-0002' => -35,
        'ING-0004' => -20,
        'ING-0006' => 15,
    ];

    public function run(): void
    {
        $ingredients = Ingredient::query()->orderBy('id')->get();

        if ($ingredients->isEmpty()) {
            $this->command?->warn('⏭  Inventory: ingredient yo\'q — avval InventoryDatabaseSeeder.');

            return;
        }

        if (StockMovement::query()->whereIn('ingredient_id', $ingredients->pluck('id'))->exists()) {
            $this->command?->warn('⏭  Inventory: ombor daftari allaqachon yozilgan — `migrate:fresh --seed` qayta quradi.');

            return;
        }

        $deliveries = $this->deliveriesByIngredient();
        $rows = 0;

        foreach ($ingredients as $ingredient) {
            $rows += $this->writeLedgerFor($ingredient, $deliveries[$ingredient->id] ?? []);
        }

        $this->command?->info(sprintf(
            '✅ Inventory: %d ta ombor harakati, %d ingredient uchun %d kunlik daftar.',
            $rows,
            $ingredients->count(),
            self::DAYS,
        ));
    }

    /**
     * Every line of every received purchase order, grouped by ingredient.
     *
     * Only received orders: a confirmed one is a promise, and a promise has not
     * moved any stock. A cancelled one never will.
     *
     * @return array<int, array<int, array{quantity: int, number: string, at: Carbon}>>
     */
    private function deliveriesByIngredient(): array
    {
        $lines = DB::table('suppliers.purchase_order_items as item')
            ->join('suppliers.purchase_orders as po', 'po.id', '=', 'item.purchase_order_id')
            ->where('po.status', 'received')
            ->whereNull('po.deleted_at')
            ->whereNull('item.deleted_at')
            ->whereNotNull('item.ingredient_id')
            ->whereNotNull('po.received_at')
            ->orderBy('po.received_at')
            ->get(['item.ingredient_id', 'item.quantity', 'po.number', 'po.received_at']);

        $byIngredient = [];

        foreach ($lines as $line) {
            $byIngredient[(int) $line->ingredient_id][] = [
                'quantity' => (int) $line->quantity,
                'number' => (string) $line->number,
                'at' => Carbon::parse((string) $line->received_at),
            ];
        }

        return $byIngredient;
    }

    /**
     * One ingredient's week, written in order.
     *
     * @param array<int, array{quantity: int, number: string, at: Carbon}> $deliveries
     */
    private function writeLedgerFor(Ingredient $ingredient, array $deliveries): int
    {
        $events = $this->eventsFor($ingredient, $deliveries);

        // What the shelf must have held before any of this happened. Negative
        // is impossible here — a delivery is sized well under the balance it
        // lands on, see PurchaseOrderSeeder — but it is clamped anyway, and the
        // reconciliation at the bottom picks up whatever the clamp costs.
        $net = array_sum(array_column($events, 'quantity'));
        $balance = max(0, $ingredient->stock_quantity - $net);

        $this->record(
            $ingredient,
            'stock_take',
            $balance,
            $balance,
            self::at(-self::DAYS, 8),
            "Ochilish sanog'i",
            null,
        );

        $written = 1;

        foreach ($events as $event) {
            // A movement can never take the shelf below empty. Clamping here
            // rather than trusting the arithmetic keeps a data change upstream
            // from writing a ledger that reads as an impossible week.
            $quantity = $event['quantity'] < 0
                ? -min($balance, -$event['quantity'])
                : $event['quantity'];

            if ($quantity === 0) {
                continue;
            }

            $balance += $quantity;

            $this->record(
                $ingredient,
                $event['kind'],
                $quantity,
                $balance,
                $event['at'],
                $event['reason'],
                $event['reference'],
            );

            $written++;
        }

        // The book against the shelf. With sane data this is zero and nothing
        // is written; when it is not, a stock-take is the honest way to say so,
        // because that is exactly what a stock-take is for.
        if ($balance !== $ingredient->stock_quantity) {
            $difference = $ingredient->stock_quantity - $balance;

            $this->record(
                $ingredient,
                'stock_take',
                $difference,
                $ingredient->stock_quantity,
                self::at(0, 7),
                'Inventarizatsiya — kitob va javon farqi',
                null,
            );

            $written++;
        }

        return $written;
    }

    /**
     * The week's events for one ingredient, oldest first.
     *
     * @param array<int, array{quantity: int, number: string, at: Carbon}> $deliveries
     *
     * @return array<int, array{kind: string, quantity: int, at: Carbon, reason: ?string, reference: ?string}>
     */
    private function eventsFor(Ingredient $ingredient, array $deliveries): array
    {
        $events = [];

        foreach ($deliveries as $delivery) {
            $events[] = [
                'kind' => 'receipt',
                'quantity' => $delivery['quantity'],
                'at' => $delivery['at'],
                'reason' => null,
                'reference' => $delivery['number'],
            ];
        }

        // The kitchen's daily draw, taken at close of service. A quarter of the
        // reorder point per day is what makes the reorder point mean something:
        // the level is set so a delivery is due about four days after the last
        // one landed.
        $base = max(1, intdiv($ingredient->min_quantity, 4));
        $sofar = self::servedToday();

        for ($day = self::DAYS - 1; $day >= 0; $day--) {
            $shape = self::DAY_SHAPE[(self::DAYS - 1 - $day) % count(self::DAY_SHAPE)];
            $full = max(1, intdiv($base * $shape, 100));

            // Today is only as far along as it is. A ledger seeded at eleven in
            // the morning that already books tonight's service is a ledger with
            // entries dated in the future, and the balance it reports is one no
            // storekeeper could count on the shelf.
            $drawn = $day === 0 ? intdiv($full * $sofar, 100) : $full;

            if ($drawn === 0) {
                continue;
            }

            $events[] = [
                'kind' => 'consumption',
                'quantity' => -$drawn,
                'at' => $day === 0 ? now() : self::at(-$day, self::SERVICE_TO),
                'reason' => 'Kunlik ishlab chiqarish',
                'reference' => null,
            ];
        }

        /*
         * The monthly count, three days back.
         *
         * `writeLedgerFor` already writes two `stock_take` rows — an opening
         * count and, when the arithmetic needs it, a closing reconciliation —
         * and both are bookkeeping: the first is where the week starts and the
         * second exists only when a clamp cost something. Neither is what a
         * manager opens the ledger for, which is a count that *found* something.
         *
         * So three ingredients are counted mid-week and three disagree with the
         * book. An unbroken run of perfect counts is what a fabricated ledger
         * looks like.
         *
         * Small on purpose. A variance is a discrepancy, not a delivery: sized
         * against the reorder point rather than the balance, so it stays
         * plausible for a sack of rice and for a tray of eggs alike. The
         * closing balance is unaffected — the opening count is derived from the
         * net of every event including this one.
         */
        $variance = self::VARIANCE[$ingredient->sku] ?? null;

        if ($variance !== null) {
            $shifted = intdiv($ingredient->min_quantity * $variance, 1000);

            if ($shifted !== 0) {
                $events[] = [
                    'kind' => 'stock_take',
                    'quantity' => $shifted,
                    'at' => self::notInFuture(self::at(-3, 22)),
                    'reason' => $shifted < 0 ? 'Sanoqda kam chiqdi' : 'Sanoqda ortiq chiqdi',
                    'reference' => 'SANOQ-'.now()->format('Y-m'),
                ];
            }
        }

        $waste = self::WASTE[$ingredient->sku] ?? null;

        if ($waste !== null) {
            $events[] = [
                'kind' => 'write_off',
                'quantity' => -$waste['quantity'],
                'at' => self::notInFuture(self::at($waste['day'], $waste['hour'])),
                'reason' => $waste['reason'],
                'reference' => null,
            ];
        }

        usort($events, fn (array $a, array $b): int => $a['at']->getTimestamp() <=> $b['at']->getTimestamp());

        return $events;
    }

    /**
     * One row.
     *
     * Written directly rather than through `Ingredient::move()`, which is right
     * for a single movement and wrong here: it would rewrite the running
     * balance ten times per ingredient on its way to the figure the seeder is
     * deliberately preserving.
     */
    private function record(
        Ingredient $ingredient,
        string $kind,
        int $quantity,
        int $balanceAfter,
        Carbon $at,
        ?string $reason,
        ?string $reference,
    ): void {
        StockMovement::query()->updateOrCreate(
            ['ingredient_id' => $ingredient->id, 'kind' => $kind, 'happened_at' => $at],
            [
                'tenant_id' => $ingredient->tenant_id,
                'quantity' => $quantity,
                'balance_after' => $balanceAfter,
                'reason' => $reason,
                'reference' => $reference,
            ],
        );
    }

    private static function at(int $day, int $hour): Carbon
    {
        return now()->startOfDay()->addDays($day)->addHours($hour);
    }

    /**
     * How much of today's service has already run, as a percentage.
     *
     * Zero before the kitchen opens, which is why the loop above skips a draw
     * of nothing rather than writing a row saying nothing happened.
     */
    private static function servedToday(): int
    {
        $minutes = now()->diffInMinutes(self::at(0, self::SERVICE_FROM), absolute: false);
        $elapsed = max(0, (int) -$minutes);
        $window = (self::SERVICE_TO - self::SERVICE_FROM) * 60;

        return min(100, intdiv($elapsed * 100, $window));
    }

    /** A ledger records what happened, so nothing in it is dated later than now. */
    private static function notInFuture(Carbon $at): Carbon
    {
        return $at->isFuture() ? now() : $at;
    }
}

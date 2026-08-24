<?php

declare(strict_types=1);

namespace Modules\Orders\Database\Seeders;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Modules\Orders\Models\Order;

/**
 * A week of paid trading, kept ending today.
 *
 * `OrdersDatabaseSeeder` writes the first day's bills once and then stands
 * aside — a second run would double yesterday. Which is right for trading
 * history and wrong for a demo: seeded on the 12th, by the 22nd every "this
 * week" figure on the dashboard, the waiter leaderboard and the P&L is zero,
 * and the product looks abandoned to the person it is being shown to.
 *
 * So this one is a window, not a batch. Every run makes sure each of the last
 * seven days has its paid bills, with a waiter on every one of them (the
 * leaderboard counts nothing without one) and a `business_date` (every report
 * ranges on it). The bills are keyed by a number of their own — `D250816-03`,
 * the day and the slot — so a run finds what the last one wrote and leaves it
 * alone: idempotent by construction, which is what lets the scheduler run it
 * every morning. `D` rather than the `A-` counter, because the counter is a
 * promise to the till that the next number is free, and a seeder writing
 * through it would be spending numbers a real guest is about to be handed.
 *
 * Deterministic, not random. The same day produces the same bills on every
 * box, so a screenshot taken on one machine matches the database on another,
 * and `SeedDemoTenantTest` can run the set twice and expect the same counts.
 */
final class DemoTradingSeeder extends Seeder
{
    /** How far back the window reaches, today included. */
    public const DAYS = 7;

    /** Bills per weekday (Sunday first) — a restaurant's week has a shape. */
    private const BILLS_BY_WEEKDAY = [9, 6, 6, 7, 8, 12, 14];

    public function run(): void
    {
        $dishes = collect(app(MenuCatalog::class)->sellable())
            ->flatMap(static fn (Section $section): array => $section->dishes)
            ->values();

        if ($dishes->isEmpty()) {
            $this->command?->warn('⚠️  Orders: menyu bo\'sh — avval MenuDatabaseSeeder ni ishga tushiring.');

            return;
        }

        $tenantId = app(TenantContext::class)->id();

        if ($tenantId === null) {
            $this->command?->warn('⚠️  Orders: tenant tanlanmagan — demo:seed orqali ishga tushiring.');

            return;
        }

        $waiters = User::query()
            ->where('tenant_id', $tenantId)
            ->role('waiter')
            ->orderBy('id')
            ->get();

        if ($waiters->isEmpty()) {
            $this->command?->warn('⚠️  Orders: ofitsiant yo\'q — avval UserSeeder.');

            return;
        }

        $created = 0;
        $now = CarbonImmutable::now();

        for ($back = self::DAYS - 1; $back >= 0; $back--) {
            $day = $now->startOfDay()->subDays($back);
            $bills = self::BILLS_BY_WEEKDAY[$day->dayOfWeek];

            for ($slot = 1; $slot <= $bills; $slot++) {
                // Spread from 11:00 to about 22:00, earlier slots earlier in
                // the day. Today's bills stop at the current hour: a demo that
                // shows this evening's takings at breakfast is lying.
                $placedAt = $day->addHours(11)->addMinutes(intdiv(660 * ($slot - 1), max($bills - 1, 1)));

                if ($placedAt->addMinutes(40) > $now) {
                    continue;
                }

                $number = sprintf('D%s-%02d', $day->format('ymd'), $slot);
                $waiter = $waiters[($day->dayOfYear + $slot) % $waiters->count()];
                $seat = (($day->dayOfYear * 7) + ($slot * 3)) % 12 + 1;

                if (Order::query()->where('number', $number)->exists()) {
                    continue;
                }

                $order = new Order([
                    'tenant_id' => $tenantId,
                    'number' => $number,
                    'business_date' => $day->toDateString(),
                    'channel' => $slot % 5 === 0 ? 'takeaway' : 'dine_in',
                    'source' => 'pos',
                    'status' => 'paid',
                    'table_label' => $slot % 5 === 0 ? null : sprintf('A-%d', $seat),
                    'waiter_user_id' => $waiter->id,
                    'guests_count' => ($slot % 4) + 1,
                    'placed_at' => $placedAt,
                    'closed_at' => $placedAt->addMinutes(40),
                    'payment_state' => 'paid',
                ]);

                // `branch_id` is deliberately not fillable — a request must never
                // choose its branch — so the seeder, which may, sets it by hand.
                $order->forceFill(['branch_id' => $waiter->branch_id])->save();

                // Two or three dishes, chosen by the slot so the same day always
                // orders the same food; quantity leans on one.
                $count = 2 + ($slot % 2);

                for ($i = 0; $i < $count; $i++) {
                    $dish = $dishes[($day->dayOfYear + ($slot * 5) + ($i * 3)) % $dishes->count()];
                    $quantity = 1 + (($slot + $i) % 3 === 0 ? 1 : 0);

                    $order->items()->create([
                        'menu_item_id' => $dish->id,
                        'sku' => $dish->sku,
                        'title' => $dish->title,
                        'station' => $dish->station,
                        'quantity' => $quantity,
                        'unit_price' => $dish->price,
                        'total_price' => $dish->price * $quantity,
                        'status' => 'served',
                    ]);
                }

                $order->recalculateTotals();
                $created++;
            }
        }

        $this->command?->info(sprintf('✅ Orders: demo savdo — oxirgi %d kun uchun %d yangi chek.', self::DAYS, $created));
    }
}

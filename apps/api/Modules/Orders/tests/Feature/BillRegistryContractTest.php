<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Services\EloquentBillRegistry;
use RuntimeException;
use Tests\TestCase;

/**
 * The bill, as everything outside Orders is allowed to touch it.
 *
 * This contract is what lets the POS run a table without importing a single
 * Orders class. The tests below are therefore not really about Orders — they
 * are about the promises the till is being asked to rely on: prices are
 * snapshotted, totals are derived, closed bills do not move, and a split leaves
 * exactly the money it started with.
 */
final class BillRegistryContractTest extends TestCase
{
    use RefreshDatabase;

    private BillRegistry $bills;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->bills = app(BillRegistry::class);
    }

    private function dish(int $priceTiyin = 4_500_000, string $sku = 'OSH-001'): MenuItem
    {
        return MenuItem::factory()->create([
            'sku' => $sku,
            'price' => $priceTiyin,
            'is_available' => true,
            'status' => 'active',
        ]);
    }

    // ============ The contract is wired up ============

    public function test_the_platform_resolves_orders_own_implementation(): void
    {
        $this->assertInstanceOf(
            EloquentBillRegistry::class,
            app(BillRegistry::class),
            'Orders must win over the refusing fallback bound in AppServiceProvider.',
        );
    }

    // ============ Opening and adding ============

    public function test_a_bill_opens_empty_and_costs_nothing(): void
    {
        $bill = $this->bills->open('dine_in', tableId: 7, tableLabel: 'A-7', guests: 3);

        $this->assertSame('draft', $bill->status);
        $this->assertSame('A-7', $bill->tableLabel);
        $this->assertSame(3, $bill->guestsCount);
        $this->assertSame(0, $bill->total);
        $this->assertSame([], $bill->lines);
        $this->assertTrue($bill->isOpen());
    }

    public function test_an_unknown_channel_is_refused(): void
    {
        $this->expectException(RuntimeException::class);

        $this->bills->open('carrier_pigeon');
    }

    public function test_adding_a_line_snapshots_the_price_and_name(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->open('dine_in');

        $bill = $this->bills->addLine($bill->id, $dish->id, 2);

        $line = $bill->lines[0];
        $this->assertSame('OSH-001', $line->sku);
        $this->assertSame(2, $line->quantity);
        $this->assertSame(4_500_000, $line->unitPrice);
        $this->assertSame(9_000_000, $line->totalPrice);
        $this->assertSame(9_000_000, $bill->total);

        // Repricing the menu tomorrow must not rewrite tonight's receipt.
        $dish->update(['price' => 9_900_000]);

        $this->assertSame(4_500_000, $this->bills->find($bill->id)?->lines[0]->unitPrice);
    }

    public function test_the_price_comes_from_the_catalogue_not_the_caller(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->open('dine_in');

        // No override given: the catalogue decides, so a client cannot undercharge.
        $bill = $this->bills->addLine($bill->id, $dish->id, 1);

        $this->assertSame(4_500_000, $bill->lines[0]->unitPrice);
    }

    public function test_a_price_override_is_honoured_when_it_is_asked_for(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->open('dine_in');

        $bill = $this->bills->addLine($bill->id, $dish->id, 1, unitPriceOverride: 3_000_000);

        $this->assertSame(3_000_000, $bill->lines[0]->unitPrice);
        $this->assertSame(3_000_000, $bill->total);
    }

    public function test_an_unknown_dish_is_refused(): void
    {
        $bill = $this->bills->open('dine_in');

        $this->expectException(RuntimeException::class);
        $this->bills->addLine($bill->id, 999_999, 1);
    }

    public function test_a_zero_quantity_is_refused(): void
    {
        $dish = $this->dish();
        $bill = $this->bills->open('dine_in');

        $this->expectException(RuntimeException::class);
        $this->bills->addLine($bill->id, $dish->id, 0);
    }

    // ============ Voiding ============

    public function test_voiding_a_line_keeps_it_visible_and_zeroes_the_money(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->open('dine_in');
        $bill = $this->bills->addLine($bill->id, $dish->id, 2);

        $bill = $this->bills->voidLine($bill->id, $bill->lines[0]->id, 'Mehmon fikridan qaytdi');

        // Cancelled, not deleted. "Which lines came off, and why" is the first
        // question anybody asks about a short till.
        $this->assertCount(1, $bill->lines);
        $this->assertSame('cancelled', $bill->lines[0]->status);
        $this->assertSame(0, $bill->lines[0]->totalPrice);
        $this->assertSame(0, $bill->total);
        $this->assertStringContainsString('Mehmon fikridan qaytdi', (string) $bill->lines[0]->note);
    }

    public function test_a_line_from_another_bill_cannot_be_voided(): void
    {
        $dish = $this->dish();
        $mine = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);
        $other = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);

        $this->expectException(RuntimeException::class);
        $this->bills->voidLine($mine->id, $other->lines[0]->id, 'nope');
    }

    // ============ Money ============

    public function test_a_discount_reduces_the_total_but_not_the_lines(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->open('dine_in');
        $bill = $this->bills->addLine($bill->id, $dish->id, 2);

        $bill = $this->bills->applyDiscount($bill->id, 1_000_000, 'Doimiy mijoz');

        $this->assertSame(9_000_000, $bill->subtotal);
        $this->assertSame(1_000_000, $bill->discountTotal);
        $this->assertSame(8_000_000, $bill->total);
    }

    public function test_a_discount_larger_than_the_bill_is_refused(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);

        $this->expectException(RuntimeException::class);
        $this->bills->applyDiscount($bill->id, 9_999_999_9, 'nope');
    }

    public function test_a_service_charge_is_added_on_top(): void
    {
        $dish = $this->dish(4_500_000);
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 2);

        $bill = $this->bills->applyServiceCharge($bill->id, 900_000);

        $this->assertSame(9_900_000, $bill->total);
    }

    // ============ Flow ============

    public function test_sending_an_empty_bill_to_the_kitchen_is_refused(): void
    {
        $bill = $this->bills->open('dine_in');

        $this->expectException(RuntimeException::class);
        $this->bills->send($bill->id);
    }

    public function test_a_bill_goes_from_draft_through_the_kitchen_to_paid(): void
    {
        $dish = $this->dish();
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);

        $bill = $this->bills->send($bill->id);
        $this->assertSame('in_kitchen', $bill->status);

        $bill = $this->bills->close($bill->id);
        $this->assertSame('paid', $bill->status);
        $this->assertFalse($bill->isOpen());
    }

    public function test_a_paid_bill_cannot_be_changed(): void
    {
        $dish = $this->dish();
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);
        $bill = $this->bills->close($this->bills->send($bill->id)->id);

        $this->expectException(RuntimeException::class);
        $this->bills->addLine($bill->id, $dish->id, 1);
    }

    public function test_reopening_a_paid_bill_puts_it_back_on_the_floor(): void
    {
        $dish = $this->dish();
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);
        $bill = $this->bills->close($this->bills->send($bill->id)->id);

        $bill = $this->bills->reopen($bill->id, 'Mehmon yana qahva buyurdi');

        $this->assertSame('served', $bill->status);
        $this->assertTrue($bill->isOpen());
        $this->assertStringContainsString('Qayta ochildi', (string) $bill->note);

        // And it takes lines again.
        $this->assertCount(2, $this->bills->addLine($bill->id, $dish->id, 1)->lines);
    }

    public function test_an_open_bill_cannot_be_reopened(): void
    {
        $bill = $this->bills->open('dine_in');

        $this->expectException(RuntimeException::class);
        $this->bills->reopen($bill->id, 'nope');
    }

    // ============ Splitting, merging, moving ============

    public function test_a_split_moves_the_chosen_lines_and_conserves_the_money(): void
    {
        $osh = $this->dish(4_500_000, 'OSH-001');
        $choy = $this->dish(500_000, 'CHOY-001');

        $bill = $this->bills->open('dine_in', tableId: 3, tableLabel: 'B-3');
        $bill = $this->bills->addLine($bill->id, $osh->id, 2);
        $bill = $this->bills->addLine($bill->id, $choy->id, 4);
        $this->assertSame(11_000_000, $bill->total);

        $choyLine = collect($bill->lines)->firstWhere('sku', 'CHOY-001');
        $new = $this->bills->split($bill->id, [$choyLine->id]);
        $original = $this->bills->find($bill->id);

        $this->assertSame(2_000_000, $new->total);
        $this->assertSame(9_000_000, $original?->total);
        // Nothing appears and nothing evaporates.
        $this->assertSame(11_000_000, $new->total + $original->total);

        // The new bill sits at the same table, with the same waiter.
        $this->assertSame('B-3', $new->tableLabel);
        $this->assertSame(3, $new->tableId);
    }

    public function test_splitting_every_line_is_refused(): void
    {
        $dish = $this->dish();
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);

        $this->expectException(RuntimeException::class);
        $this->bills->split($bill->id, [$bill->lines[0]->id]);
    }

    public function test_merging_moves_everything_and_closes_the_source(): void
    {
        $dish = $this->dish(4_500_000);

        $a = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);
        $b = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 2);

        $merged = $this->bills->merge($a->id, $b->id);

        $this->assertSame(13_500_000, $merged->total);
        $this->assertCount(2, $merged->lines);
        $this->assertSame('cancelled', $this->bills->find($a->id)?->status);
    }

    public function test_a_bill_cannot_be_merged_into_itself(): void
    {
        $bill = $this->bills->open('dine_in');

        $this->expectException(RuntimeException::class);
        $this->bills->merge($bill->id, $bill->id);
    }

    public function test_transferring_moves_the_table_and_the_waiter(): void
    {
        $bill = $this->bills->open('dine_in', tableId: 1, tableLabel: 'A-1', waiterUserId: 10);

        $bill = $this->bills->transfer($bill->id, tableId: 9, tableLabel: 'C-9', waiterUserId: 22);

        $this->assertSame(9, $bill->tableId);
        $this->assertSame('C-9', $bill->tableLabel);
        $this->assertSame(22, $bill->waiterUserId);
    }

    // ============ Tenancy ============

    public function test_a_bill_from_another_restaurant_is_invisible(): void
    {
        $context = app(TenantContext::class);

        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $context->set($other);
        $theirs = Order::factory()->create();
        $context->set($this->tenant);

        $this->assertNull($this->bills->find((int) $theirs->id));
    }

    /** The DTO is what other modules hold, so its shape is part of the contract. */
    public function test_the_bill_serialises_to_the_shape_clients_expect(): void
    {
        $dish = $this->dish();
        $bill = $this->bills->addLine($this->bills->open('dine_in')->id, $dish->id, 1);

        $this->assertInstanceOf(Bill::class, $bill);
        $this->assertSame(
            ['id', 'number', 'channel', 'status', 'is_open', 'table_id', 'table_label',
                'waiter_user_id', 'customer_id', 'guests_count', 'subtotal', 'discount_total',
                'service_charge', 'total', 'note', 'lines'],
            array_keys($bill->toArray()),
        );
    }
}

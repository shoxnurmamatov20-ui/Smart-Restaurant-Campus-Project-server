<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * A service charge belongs to the room, not to the business.
 *
 * `Branch::setting()` has carried this argument since it was written — *"a 10%
 * service charge on the terrace is not always the same as in the hall"* — and
 * nothing consulted it: `Order::servicePercent()` read the tenant's own figure,
 * so an estate with one canteen and one restaurant had to be wrong about one of
 * them.
 *
 * The design's sign asked for the rate on the HALL and that is the wrong table:
 * a hall is a drawing of furniture, it holds no settings and no money, and a
 * bill knows its branch long before it knows which room a chair is in — a
 * takeaway has a branch and no hall at all.
 */
final class ServiceChargeByVenueTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
            // The business charges ten, which is what every venue inherits
            // unless it says otherwise.
            'settings' => ['service_charge_percent' => 10],
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    /** A dine-in bill at this venue, with one 100 000 so'm dish on it. */
    private function billAt(Branch $branch): Order
    {
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch->getKey(),
            'channel' => 'dine_in',
            'status' => 'placed',
        ]);

        $dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'OSH-'.$branch->getKey(),
            'price' => 100_000_00,
            'is_available' => true,
            'status' => 'active',
        ]);

        $order->items()->create([
            'tenant_id' => $this->tenant->id,
            'menu_item_id' => $dish->id,
            'sku' => $dish->sku,
            'title' => 'Osh',
            'station' => 'hot',
            'quantity' => 1,
            'unit_price' => 100_000_00,
            'total_price' => 100_000_00,
        ]);

        return $order->recalculateTotals()->refresh();
    }

    public function test_a_venue_that_says_nothing_charges_what_the_business_charges(): void
    {
        $branch = Branch::factory()->create(['tenant_id' => $this->tenant->id, 'settings' => []]);

        $bill = $this->billAt($branch);

        $this->assertSame(10_000_00, (int) $bill->service_charge);
        $this->assertSame(110_000_00, (int) $bill->total);
    }

    public function test_the_canteen_in_the_same_business_charges_nothing(): void
    {
        $canteen = Branch::factory()->create([
            'tenant_id' => $this->tenant->id,
            'settings' => ['service_charge_percent' => 0],
        ]);

        $bill = $this->billAt($canteen);

        // Zero, and not the tenant's ten. A canteen adding a service charge is
        // exactly the line a guest photographs.
        $this->assertSame(0, (int) $bill->service_charge);
        $this->assertSame(100_000_00, (int) $bill->total);
    }

    public function test_the_terrace_can_charge_more_than_the_hall(): void
    {
        $terrace = Branch::factory()->create([
            'tenant_id' => $this->tenant->id,
            'settings' => ['service_charge_percent' => 15],
        ]);

        $bill = $this->billAt($terrace);

        $this->assertSame(15_000_00, (int) $bill->service_charge);
        $this->assertSame(115_000_00, (int) $bill->total);
    }

    public function test_a_bill_with_no_venue_still_falls_back_to_the_business(): void
    {
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => null,
            'channel' => 'dine_in',
            'status' => 'placed',
        ]);

        $dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'OSH-NONE', 'price' => 100_000_00, 'is_available' => true, 'status' => 'active',
        ]);

        $order->items()->create([
            'tenant_id' => $this->tenant->id,
            'menu_item_id' => $dish->id,
            'sku' => $dish->sku, 'title' => 'Osh', 'station' => 'hot',
            'quantity' => 1, 'unit_price' => 100_000_00, 'total_price' => 100_000_00,
        ]);

        // Every bill on the platform before venues had settings is this one, and
        // it must keep charging what it charged yesterday.
        $this->assertSame(10_000_00, (int) $order->recalculateTotals()->refresh()->service_charge);
    }
}

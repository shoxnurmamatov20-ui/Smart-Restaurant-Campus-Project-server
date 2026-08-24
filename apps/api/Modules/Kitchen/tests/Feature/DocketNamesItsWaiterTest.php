<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Feature;

use App\Contracts\Orders\BillRegistry;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The name the pass shouts.
 *
 * A plate under the heat lamp is not "table 12's", it is "Dilnoza's" — she is
 * the person who will come and take it. `kds-server.ts` drew a dash in that
 * column and said exactly why: *"the ticket carries no waiter. The order it
 * came from does; resolving it belongs on the endpoint, not in a request per
 * ticket."*
 *
 * Snapshotted onto the docket rather than joined, for the same reason
 * `table_label` and `lines` are: Kitchen may not read `orders.orders`, and a
 * docket has to keep meaning what it meant when it was fired.
 */
final class DocketNamesItsWaiterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function bills(): BillRegistry
    {
        return app(BillRegistry::class);
    }

    private function actingAsCook(): User
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        return $user;
    }

    public function test_firing_a_bill_copies_the_waiter_onto_every_docket(): void
    {
        $this->actingAsCook();

        $waiter = User::factory()->create(['name' => 'Dilnoza Karimova']);
        $waiter->assignRole('waiter');

        $bill = $this->bills()->open('dine_in', tableLabel: 'A-7', waiterUserId: (int) $waiter->getKey());
        $this->bills()->addLine($bill->id, MenuItem::factory()->create(['sku' => 'GRL-1', 'station' => 'grill'])->id, 1);
        $this->bills()->addLine($bill->id, MenuItem::factory()->create(['sku' => 'BAR-1', 'station' => 'bar'])->id, 1);
        $this->bills()->send($bill->id);

        // Two stations, two dockets, and both of them know whose table it is —
        // the grill and the bar each shout for the same person.
        $tickets = KitchenTicket::query()->where('order_id', $bill->id)->get();

        $this->assertCount(2, $tickets);
        $this->assertSame(
            [(int) $waiter->getKey(), (int) $waiter->getKey()],
            $tickets->pluck('waiter_user_id')->map(static fn ($id): int => (int) $id)->sort()->values()->all(),
        );
    }

    public function test_the_pass_reads_the_waiters_name_and_not_their_id(): void
    {
        $this->actingAsCook();

        $waiter = User::factory()->create(['name' => 'Dilnoza Karimova']);
        $waiter->assignRole('waiter');

        $bill = $this->bills()->open('dine_in', tableLabel: 'A-7', waiterUserId: (int) $waiter->getKey());
        $this->bills()->addLine($bill->id, MenuItem::factory()->create(['sku' => 'GRL-2', 'station' => 'grill'])->id, 1);
        $this->bills()->send($bill->id);

        $this->getJson('/api/v1/kitchen/tickets')
            ->assertOk()
            ->assertJsonPath('data.0.waiter.id', (int) $waiter->getKey())
            ->assertJsonPath('data.0.waiter.name', 'Dilnoza Karimova');
    }

    /**
     * Most of the platform's bills belong to nobody.
     *
     * A takeaway ordered from a phone and an aggregator ticket have no waiter,
     * and `null` is the answer a screen can render as a blank. An empty string
     * or a zero would be a name the board tries to print.
     */
    public function test_a_docket_with_no_waiter_answers_null_rather_than_a_blank_name(): void
    {
        $this->actingAsCook();

        $bill = $this->bills()->open('takeaway');
        $this->bills()->addLine($bill->id, MenuItem::factory()->create(['sku' => 'HOT-9', 'station' => 'hot'])->id, 1);
        $this->bills()->send($bill->id);

        $this->getJson('/api/v1/kitchen/tickets')
            ->assertOk()
            ->assertJsonPath('data.0.waiter', null);
    }
}

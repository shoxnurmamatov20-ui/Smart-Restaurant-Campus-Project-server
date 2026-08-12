<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * The kitchen display: what the brigade sees, and the four buttons they press.
 */
final class KitchenTicketTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsCook(): User
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        return $user;
    }

    private function actingAsChef(): User
    {
        $user = User::factory()->create();
        $user->assignRole('chef');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_see_the_pass(): void
    {
        $this->getJson('/api/v1/kitchen/tickets')->assertStatus(401);
    }

    public function test_courier_has_no_kitchen_access(): void
    {
        $user = User::factory()->create();
        $user->assignRole('courier');
        $this->actingAs($user);

        $this->getJson('/api/v1/kitchen/tickets')->assertStatus(403);
    }

    public function test_cook_can_work_tickets_but_not_create_stations(): void
    {
        $this->actingAsCook();
        $ticket = KitchenTicket::factory()->create();

        $this->getJson('/api/v1/kitchen/tickets')->assertOk();
        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/start")->assertOk();
        $this->postJson('/api/v1/kitchen/stations', ['code' => 'wok', 'name' => 'Wok'])->assertStatus(403);
    }

    // ============ The four buttons ============

    public function test_a_ticket_moves_new_to_cooking_to_ready_to_served(): void
    {
        $this->actingAsCook();
        $ticket = KitchenTicket::factory()->create();

        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/start")
            ->assertOk()->assertJsonPath('data.status', 'cooking');

        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/ready")
            ->assertOk()->assertJsonPath('data.status', 'ready');

        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/serve")
            ->assertOk()->assertJsonPath('data.status', 'served');

        $ticket->refresh();
        $this->assertNotNull($ticket->started_at);
        $this->assertNotNull($ticket->ready_at);
        $this->assertNotNull($ticket->served_at);
    }

    public function test_a_ticket_cannot_be_served_before_it_is_ready(): void
    {
        $this->actingAsCook();
        $ticket = KitchenTicket::factory()->cooking()->create();

        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/serve")->assertStatus(422);
    }

    public function test_recalling_a_ready_ticket_restarts_the_clock(): void
    {
        $this->actingAsCook();
        $ticket = KitchenTicket::factory()->ready()->create();

        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/recall")
            ->assertOk()
            ->assertJsonPath('data.status', 'recalled')
            ->assertJsonPath('data.ready_at', null);
    }

    // ============ SLA ============

    public function test_a_ticket_past_its_sla_is_flagged_late(): void
    {
        $this->actingAsCook();
        $ticket = KitchenTicket::factory()->late()->create();

        $this->getJson("/api/v1/kitchen/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.is_late', true);
    }

    public function test_a_finished_ticket_is_never_late(): void
    {
        $this->actingAsCook();
        // Took 40 minutes against a 10 minute SLA — but it is out, so the red
        // flag serves no one.
        $ticket = KitchenTicket::factory()->create([
            'status' => 'ready',
            'sla_minutes' => 10,
            'started_at' => now()->subMinutes(40),
            'ready_at' => now(),
        ]);

        $this->getJson("/api/v1/kitchen/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.is_late', false);
    }

    // ============ Station board ============

    public function test_tickets_can_be_filtered_to_one_station(): void
    {
        $this->actingAsCook();
        KitchenTicket::factory()->count(2)->create(['station' => 'grill']);
        KitchenTicket::factory()->count(3)->create(['station' => 'bar']);

        $this->getJson('/api/v1/kitchen/tickets?filter[station]=grill')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_active_filter_hides_finished_tickets(): void
    {
        $this->actingAsCook();
        KitchenTicket::factory()->count(2)->create();
        KitchenTicket::factory()->count(3)->create(['status' => 'served']);

        $this->getJson('/api/v1/kitchen/tickets?filter[active]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Dispatch ============

    public function test_an_order_becomes_one_ticket_per_station(): void
    {
        $this->actingAsChef();
        KitchenStation::factory()->create(['code' => 'grill', 'sla_minutes' => 25]);

        $order = Order::factory()->create(['table_label' => 'A-7']);
        OrderItem::factory()->count(2)->create(['order_id' => $order->id, 'station' => 'grill']);
        OrderItem::factory()->create(['order_id' => $order->id, 'station' => 'bar']);

        $this->postJson('/api/v1/kitchen/dispatch', ['order_id' => $order->id])
            ->assertCreated()
            ->assertJsonCount(2, 'tickets');

        $grill = KitchenTicket::where('order_id', $order->id)->where('station', 'grill')->firstOrFail();
        $this->assertCount(2, $grill->lines);
        $this->assertSame('A-7', $grill->table_label);
        $this->assertSame(25, $grill->sla_minutes, 'The station SLA must win over the default');
    }

    public function test_redispatching_an_edited_order_updates_the_ticket_in_place(): void
    {
        $this->actingAsChef();
        $order = Order::factory()->create();
        OrderItem::factory()->create(['order_id' => $order->id, 'station' => 'hot']);

        $this->postJson('/api/v1/kitchen/dispatch', ['order_id' => $order->id])->assertCreated();
        OrderItem::factory()->create(['order_id' => $order->id, 'station' => 'hot']);
        $this->postJson('/api/v1/kitchen/dispatch', ['order_id' => $order->id])->assertCreated();

        // One ticket, not two — the cook must not have to reconcile duplicates.
        $this->assertSame(1, KitchenTicket::where('order_id', $order->id)->count());
        $this->assertCount(2, KitchenTicket::where('order_id', $order->id)->firstOrFail()->lines);
    }

    // ============ Module info ============

    public function test_module_info_counts_active_and_late_tickets(): void
    {
        $this->actingAsCook();
        KitchenStation::factory()->create(['code' => 'hot']);
        KitchenTicket::factory()->count(3)->create();
        KitchenTicket::factory()->count(2)->late()->create();
        KitchenTicket::factory()->create(['status' => 'served']);

        $this->getJson('/api/v1/kitchen/')
            ->assertOk()
            ->assertJsonPath('module', 'Kitchen')
            ->assertJsonPath('counts.tickets_active', 5)
            ->assertJsonPath('counts.tickets_late', 2);
    }

    // ============ Tenant isolation ============

    public function test_one_kitchen_never_sees_another_restaurants_tickets(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        KitchenTicket::factory()->count(3)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('chef');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/kitchen/tickets')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/kitchen/tickets')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }

    public function test_dispatch_snapshots_the_dish_titles(): void
    {
        $this->actingAsChef();
        $dish = MenuItem::factory()->create(['station' => 'hot']);
        $order = Order::factory()->create();
        OrderItem::factory()->create([
            'order_id' => $order->id,
            'station' => 'hot',
            'sku' => $dish->sku,
            'title' => 'Osh (to\'y palov)',
            'quantity' => 2,
        ]);

        $this->postJson('/api/v1/kitchen/dispatch', ['order_id' => $order->id])->assertCreated();

        $ticket = KitchenTicket::where('order_id', $order->id)->firstOrFail();
        $this->assertSame("Osh (to'y palov)", $ticket->lines[0]['title']);
        $this->assertSame(2, $ticket->lines[0]['quantity']);
    }
}

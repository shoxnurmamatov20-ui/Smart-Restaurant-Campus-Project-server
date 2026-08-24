<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Feature;

use App\Contracts\Orders\BillRegistry;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;
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

    /**
     * The registry, resolved fresh each time it is asked for.
     *
     * A property set in setUp() would be resolved before `actingAs` has put a
     * tenant in the context, and the bill it opened would belong to nobody.
     */
    private function bills(): BillRegistry
    {
        return app(BillRegistry::class);
    }

    /** A dish that comes off one station. */
    private function dish(string $station, string $sku = 'KIT-1'): MenuItem
    {
        return MenuItem::factory()->create([
            'sku' => $sku.'-'.$station,
            'station' => $station,
            'price' => 4_500_000,
        ]);
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

    /*
     * Firing goes through the bill, not through a door of its own.
     *
     * These called `POST /kitchen/dispatch`, which no longer exists. It was the
     * second half of a two-call fire: the client transitioned the bill and then
     * had to remember to ask for the dockets, and a tablet that lost signal in
     * between left a bill reading "sent" with nothing on any pass. `send()` now
     * does both in one transaction, so the only way to fire is to fire.
     */
    public function test_a_fired_bill_becomes_one_ticket_per_station(): void
    {
        $this->actingAsChef();
        KitchenStation::factory()->create(['code' => 'grill', 'sla_minutes' => 25]);

        $bill = $this->bills()->open('dine_in', tableLabel: 'A-7');
        $this->bills()->addLine($bill->id, $this->dish('grill')->id, 2);
        $this->bills()->addLine($bill->id, $this->dish('bar')->id, 1);

        $this->bills()->send($bill->id);

        $this->assertSame(2, KitchenTicket::where('order_id', $bill->id)->count());

        $grill = KitchenTicket::where('order_id', $bill->id)->where('station', 'grill')->firstOrFail();
        $this->assertCount(1, $grill->lines, 'Two of one dish is one line of quantity two');
        $this->assertSame('A-7', $grill->table_label);
        $this->assertSame(25, $grill->sla_minutes, 'The station SLA must win over the default');
    }

    public function test_refiring_an_edited_bill_updates_the_ticket_in_place(): void
    {
        $this->actingAsChef();

        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $this->dish('hot')->id, 1);
        $this->bills()->send($bill->id);

        $this->bills()->addLine($bill->id, $this->dish('hot', 'HOT-2')->id, 1);
        $this->bills()->send($bill->id);

        // One ticket, not two — the cook must not have to reconcile duplicates.
        $this->assertSame(1, KitchenTicket::where('order_id', $bill->id)->count());
        $this->assertCount(2, KitchenTicket::where('order_id', $bill->id)->firstOrFail()->lines);
    }

    public function test_the_docket_carries_what_the_guest_actually_asked_for(): void
    {
        /*
         * The field that matters most on the whole ticket. "No onion" is not a
         * preference — for somebody with an allergy it is the reason they can
         * eat — and the docket carried sku, title, quantity and note and
         * nothing else. From the day modifiers shipped, a cook would have
         * plated exactly the wrong dish while the tablet showed the right one.
         */
        $this->actingAsChef();

        $dish = $this->dish('grill');
        $group = ModifierGroup::factory()->create(['is_multi' => true, 'min_choices' => 0, 'max_choices' => 3]);
        $noOnion = ModifierOption::factory()->free()->create(['modifier_group_id' => $group->id]);
        $dish->modifierGroups()->attach($group->id, ['tenant_id' => $dish->tenant_id]);

        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $dish->id, 1, seatNo: 3, modifierChoiceIds: [$noOnion->id]);
        $this->bills()->send($bill->id);

        $ticket = KitchenTicket::where('order_id', $bill->id)->firstOrFail();
        $line = $ticket->lines[0];

        $this->assertSame(['Piyozsiz'], $line['modifiers']);
        // And which guest, so a runner can put four steaks down in front of the
        // right four people without asking.
        $this->assertSame(3, $line['seat_no']);
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
            ->assertApiError('tenant.mismatch');
    }

    public function test_the_docket_snapshots_the_dish_title(): void
    {
        // The cook is holding paper, or a screen that has not refreshed. What
        // it names has to keep meaning what it meant when it was fired — the
        // same rule the receipt follows on the money.
        $this->actingAsChef();

        $dish = $this->dish('hot');
        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $dish->id, 1);
        $this->bills()->send($bill->id);

        $dish->forceFill(['name' => ['uz' => 'Boshqa nom', 'ru' => 'Другое', 'en' => 'Renamed']])->save();

        $ticket = KitchenTicket::where('order_id', $bill->id)->firstOrFail();

        $this->assertNotSame('Boshqa nom', $ticket->lines[0]['title']);
    }
}

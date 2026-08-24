<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\IntakePolicy;
use Tests\TestCase;

/**
 * The intake desk's own rules, and the one of them the server actually enforces.
 *
 * The four switches and the prep picker on `/calls` → Kanallar wrote React
 * state and nothing else. That is worse on an automation switch than on an
 * ordinary control: an operator who has "switched on" auto-accept stops
 * watching the queue, and the queue is the whole job.
 */
final class IntakePolicyTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $termiz;

    private MenuItem $dish;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $this->termiz = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Termiz', 'slug' => 'termiz',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $section = MenuCategory::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $section->id,
            'price' => 45_000_00,
            'is_available' => true,
        ]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsOperator(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('order-operator');
        $this->actingAs($user);

        return $user;
    }

    /** A guest's basket, through the website, at one venue. */
    private function order(Branch $at): TestResponse
    {
        return $this->withHeader('X-Tenant', $this->tenant->slug)->postJson('/api/v1/public/orders', [
            'branch_id' => $at->id,
            'channel' => 'delivery',
            'source' => 'web',
            'payment_method' => 'cash',
            'customer' => ['name' => 'Rustam', 'phone' => '+99890'.random_int(1000000, 9999999)],
            'address' => ['line' => 'Chilonzor 12', 'lat' => 41.28, 'lng' => 69.2],
            'items' => [['menu_item_id' => $this->dish->id, 'quantity' => 1]],
        ]);
    }

    // ============ Reading ============

    public function test_a_restaurant_that_has_never_opened_the_screen_reads_the_defaults(): void
    {
        $this->actingAsOperator();

        $this->getJson('/api/v1/orders/intake-rules')
            ->assertOk()
            ->assertJsonPath('data.prep_minutes', 25)
            ->assertJsonPath('data.auto_accept_prepaid', true)
            ->assertJsonPath('data.call_on_cash', false)
            ->assertJsonPath('data.peak_ticket_limit', 12)
            // Three of the four are recorded intentions today. A screen that
            // could not tell them apart would let an operator believe the
            // queue is being answered without them.
            ->assertJsonPath('data.enforced.pause_at_peak', true)
            ->assertJsonPath('data.enforced.auto_accept_prepaid', false);
    }

    // ============ Writing ============

    public function test_the_prep_picker_writes_and_leaves_the_switches_where_they_were(): void
    {
        $this->actingAsOperator();

        $this->putJson('/api/v1/orders/intake-rules', ['prep_minutes' => 40])
            ->assertOk()
            ->assertJsonPath('data.prep_minutes', 40)
            // The whole point of a partial body: the switches in the card above
            // must not be rewritten by whatever the browser last held.
            ->assertJsonPath('data.auto_accept_prepaid', true)
            ->assertJsonPath('data.pause_at_peak', true);

        $this->getJson('/api/v1/orders/intake-rules')
            ->assertOk()
            ->assertJsonPath('data.prep_minutes', 40);
    }

    public function test_a_switch_writes_without_disturbing_the_prep_time(): void
    {
        $this->actingAsOperator();

        $this->putJson('/api/v1/orders/intake-rules', ['prep_minutes' => 15])->assertOk();
        $this->putJson('/api/v1/orders/intake-rules', ['call_on_cash' => true])
            ->assertOk()
            ->assertJsonPath('data.call_on_cash', true)
            ->assertJsonPath('data.prep_minutes', 15);
    }

    public function test_an_impossible_prep_time_is_refused_rather_than_stored(): void
    {
        $this->actingAsOperator();

        // Three hours is the ceiling: it is a number a guest reads on the site
        // and at the aggregators, not an internal preference.
        $this->putJson('/api/v1/orders/intake-rules', ['prep_minutes' => 600])
            ->assertStatus(422);

        $this->putJson('/api/v1/orders/intake-rules', ['peak_ticket_limit' => 0])
            ->assertStatus(422);
    }

    public function test_a_waiter_may_not_change_how_the_intake_desk_behaves(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        $this->putJson('/api/v1/orders/intake-rules', ['prep_minutes' => 60])
            ->assertForbidden();
    }

    public function test_one_venues_rules_do_not_reach_another(): void
    {
        $this->actingAsOperator();

        $this->withHeader('X-Branch', 'chilonzor')
            ->putJson('/api/v1/orders/intake-rules', ['prep_minutes' => 45])
            ->assertOk()
            ->assertJsonPath('data.branch_id', $this->chilonzor->id);

        // Termiz has no row of its own, so it falls through to the business —
        // which nobody has set, so the platform default.
        $this->withHeader('X-Branch', 'termiz')
            ->getJson('/api/v1/orders/intake-rules')
            ->assertOk()
            ->assertJsonPath('data.prep_minutes', 25);
    }

    public function test_another_restaurant_cannot_read_these_rules(): void
    {
        $this->actingAsOperator();
        $this->putJson('/api/v1/orders/intake-rules', ['prep_minutes' => 55])->assertOk();

        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($other);

        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('order-operator');
        $this->actingAs($stranger);

        $this->withHeader('X-Tenant', $other->slug)
            ->getJson('/api/v1/orders/intake-rules')
            ->assertOk()
            ->assertJsonPath('data.prep_minutes', 25);
    }

    // ============ The one rule the server acts on ============

    public function test_a_buried_kitchen_refuses_a_strangers_order_when_the_rule_is_on(): void
    {
        $this->actingAsOperator();
        $this->putJson('/api/v1/orders/intake-rules', ['peak_ticket_limit' => 2])->assertOk();

        KitchenTicket::factory()->count(2)->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'status' => 'cooking',
        ]);

        $this->order($this->chilonzor)->assertApiError('order.kitchen_at_capacity');

        // The other venue's line is empty and its guests are not refused: the
        // ceiling is per venue, like the doors beside it.
        $this->order($this->termiz)->assertCreated();
    }

    public function test_switching_the_peak_rule_off_lets_the_orders_through(): void
    {
        $this->actingAsOperator();
        $this->putJson('/api/v1/orders/intake-rules', [
            'peak_ticket_limit' => 1,
            'pause_at_peak' => false,
        ])->assertOk();

        KitchenTicket::factory()->count(3)->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'status' => 'cooking',
        ]);

        $this->order($this->chilonzor)->assertCreated();
    }

    public function test_the_defaults_leave_an_ordinary_service_alone(): void
    {
        // Eleven dockets against the shipped ceiling of twelve: a busy Friday
        // is not a closed website, and a rule that shut the door on an ordinary
        // service would be switched off within a week and never switched back.
        KitchenTicket::factory()->count(11)->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'status' => 'cooking',
        ]);

        $this->assertSame(12, IntakePolicy::resolve($this->chilonzor->id)->peak_ticket_limit);

        $this->order($this->chilonzor)->assertCreated();
    }
}

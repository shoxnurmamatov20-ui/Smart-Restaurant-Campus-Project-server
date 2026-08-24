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
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\ChannelSetting;
use Tests\TestCase;

/**
 * Shutting one intake door without shutting the others.
 *
 * The switch on the intake screen used to `flash()` and write nothing, and its
 * own TODO explained why binding it to `settings.channels` would have been
 * worse than doing nothing: two of the five switches would have written the
 * same value and one would have written none. So the assertions that matter
 * here are the ones about which door a refusal actually closes.
 */
final class ChannelSettingsTest extends TestCase
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

    private function actingAsManager(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('branch-manager');
        $this->actingAs($user);

        return $user;
    }

    /** A guest's basket, through one door at one venue. */
    private function order(string $source, Branch $at): TestResponse
    {
        return $this->withHeader('X-Tenant', $this->tenant->slug)->postJson('/api/v1/public/orders', [
            'branch_id' => $at->id,
            'channel' => 'delivery',
            'source' => $source,
            'payment_method' => 'cash',
            'customer' => ['name' => 'Rustam', 'phone' => '+998901234567'],
            'address' => ['line' => 'Chilonzor 12', 'lat' => 41.28, 'lng' => 69.2],
            'items' => [['menu_item_id' => $this->dish->id, 'quantity' => 1]],
        ]);
    }

    public function test_all_five_doors_are_listed_even_when_nobody_has_touched_them(): void
    {
        $this->actingAsManager();

        $this->getJson('/api/v1/orders/channels')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('data.0.key', 'tel')
            ->assertJsonPath('data.0.is_open', true)
            // The phone has no endpoint to refuse, so the switch stores an
            // intention. The screen has to be able to say so.
            ->assertJsonPath('data.0.enforced', false)
            ->assertJsonPath('data.2.key', 'web')
            ->assertJsonPath('data.2.enforced', true);
    }

    public function test_shutting_the_website_refuses_a_website_order_and_leaves_telegram_open(): void
    {
        $this->actingAsManager();

        $this->patchJson('/api/v1/orders/channels/web', ['is_open' => false])
            ->assertOk()
            ->assertJsonPath('data.accepts', false);

        $this->order('web', $this->chilonzor)->assertApiError('order.channel_paused');

        // The bot is a different door and was never touched.
        $this->order('telegram', $this->chilonzor)->assertCreated();
    }

    public function test_the_mobile_app_is_the_same_door_as_the_website(): void
    {
        $this->actingAsManager();
        $this->patchJson('/api/v1/orders/channels/web', ['is_open' => false])->assertOk();

        // One decision — "we are not taking online orders" — not two switches
        // that can disagree.
        $this->order('app', $this->chilonzor)->assertApiError('order.channel_paused');
    }

    public function test_a_pause_names_a_reason_and_expires_by_itself(): void
    {
        $this->actingAsManager();

        $this->patchJson('/api/v1/orders/channels/web', [
            'paused_minutes' => 40,
            'reason' => 'Fritur ishlamayapti',
        ])
            ->assertOk()
            ->assertJsonPath('data.accepts', false)
            ->assertJsonPath('data.pause_reason', 'Fritur ishlamayapti')
            // Still open as a decision — this is a Friday, not a cancelled
            // contract, and the screen must be able to tell them apart.
            ->assertJsonPath('data.is_open', true);

        $this->order('web', $this->chilonzor)
            ->assertApiError('order.channel_paused')
            ->assertJsonPath('error.reason', 'Fritur ishlamayapti')
            ->assertJsonPath('error.channel', 'web');

        // Zero is "resume now", which is the button beside the pause.
        $this->patchJson('/api/v1/orders/channels/web', ['paused_minutes' => 0])
            ->assertOk()
            ->assertJsonPath('data.accepts', true);

        $this->order('web', $this->chilonzor)->assertCreated();
    }

    public function test_one_venue_shutting_a_door_does_not_shut_it_everywhere(): void
    {
        $this->actingAsManager();

        $this->patchJson('/api/v1/orders/channels/web', [
            'is_open' => false,
            'branch_id' => $this->chilonzor->id,
        ])->assertOk();

        $this->order('web', $this->chilonzor)->assertApiError('order.channel_paused');
        // Termiz's kitchen is fine.
        $this->order('web', $this->termiz)->assertCreated();
    }

    public function test_a_venue_row_overrides_the_business_wide_one(): void
    {
        $this->actingAsManager();

        // The business is shut; Termiz says otherwise for itself.
        $this->patchJson('/api/v1/orders/channels/web', ['is_open' => false, 'branch_id' => null])->assertOk();
        $this->patchJson('/api/v1/orders/channels/web', ['is_open' => true, 'branch_id' => $this->termiz->id])
            ->assertOk();

        $this->order('web', $this->chilonzor)->assertApiError('order.channel_paused');
        $this->order('web', $this->termiz)->assertCreated();
    }

    public function test_an_unknown_door_is_not_a_door(): void
    {
        $this->actingAsManager();

        $this->patchJson('/api/v1/orders/channels/glovo', ['is_open' => false])
            ->assertApiError('request.not_found');
    }

    public function test_a_waiter_may_not_shut_the_website(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        // Adding a dish to a bill and deciding the restaurant stops trading
        // online are different powers.
        $this->patchJson('/api/v1/orders/channels/web', ['is_open' => false])->assertForbidden();
    }

    public function test_another_restaurants_switch_is_invisible(): void
    {
        $this->actingAsManager();
        $this->patchJson('/api/v1/orders/channels/web', ['is_open' => false])->assertOk();

        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('branch-manager');

        $this->actingAs($stranger)
            ->withHeader('X-Tenant', $other->slug)
            ->getJson('/api/v1/orders/channels')
            ->assertOk()
            // Every door open, because the other restaurant's rows are not
            // theirs to read.
            ->assertJsonPath('data.2.is_open', true);

        $this->assertSame(1, ChannelSetting::query()->withoutGlobalScopes()->count());
    }
}

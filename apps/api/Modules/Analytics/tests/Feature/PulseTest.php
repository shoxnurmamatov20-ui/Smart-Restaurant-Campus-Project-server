<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Modules\Finance\Models\CashShift;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * The status strip's four counts — GET /api/v1/dashboard/pulse.
 *
 * Every role with a home screen reads it, on every page. A brand-new
 * restaurant must read zeros and "no till open", not the design's "32 of 32
 * tables, 7 dockets" — which is what the strip said from the catalogue for a
 * week.
 */
final class PulseTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Omad Manti', 'slug' => 'omad-manti', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
        $this->branch = Branch::factory()->named('Markaziy', 'M1')->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function signIn(string $role): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);
    }

    public function test_a_restaurant_that_has_not_traded_reads_zeros_and_no_till(): void
    {
        $this->signIn('owner');

        $this->getJson('/api/v1/dashboard/pulse', ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('data.shift_open_since', null)
            ->assertJsonPath('data.floor.occupied', 0)
            ->assertJsonPath('data.floor.free', 0)
            ->assertJsonPath('data.kitchen.open', 0)
            ->assertJsonPath('data.kitchen.oldest_minutes', null)
            ->assertJsonPath('data.stock.low', 0)
            ->assertJsonPath('data.orders_open', 0)
            ->assertJsonPath('data.cases_open', 0);
    }

    public function test_it_counts_what_is_true_right_now(): void
    {
        $this->signIn('owner');

        foreach (['occupied', 'occupied', 'free', 'reserved'] as $i => $status) {
            RestaurantTable::factory()->create([
                'tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id,
                'label' => 'A-'.($i + 1), 'status' => $status, 'is_active' => true,
            ]);
        }

        $shift = CashShift::factory()->create([
            'tenant_id' => $this->tenant->id, 'status' => 'open',
            'opened_at' => now()->subHours(2),
        ]);
        $shift->forceFill(['branch_id' => $this->branch->id])->save();

        KitchenTicket::factory()->create([
            'tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id,
            'status' => 'cooking', 'created_at' => now()->subMinutes(11),
        ]);
        KitchenTicket::factory()->create([
            'tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id,
            'status' => 'new', 'created_at' => now()->subMinutes(2),
        ]);
        KitchenTicket::factory()->create([
            'tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id,
            'status' => 'served', 'created_at' => now()->subMinutes(40),
        ]);

        $answer = $this->getJson('/api/v1/dashboard/pulse', ['X-Tenant' => $this->tenant->slug])->assertOk();

        // Reserved counts as taken: it cannot be given away.
        $answer->assertJsonPath('data.floor.occupied', 3)->assertJsonPath('data.floor.free', 1);
        // Served is off the line; the longest wait is the eleven-minute docket.
        $answer->assertJsonPath('data.kitchen.open', 2);
        $this->assertSame(11, $answer->json('data.kitchen.oldest_minutes'));
        $this->assertNotNull($answer->json('data.shift_open_since'));
    }

    public function test_every_role_with_a_home_screen_may_read_it(): void
    {
        foreach (['waiter', 'cashier', 'chef', 'storekeeper', 'accountant'] as $role) {
            $this->signIn($role);
            $this->getJson('/api/v1/dashboard/pulse', ['X-Tenant' => $this->tenant->slug])->assertOk();
        }
    }
}

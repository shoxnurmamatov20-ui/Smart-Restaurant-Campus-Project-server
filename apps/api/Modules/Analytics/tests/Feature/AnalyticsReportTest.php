<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * Reporting. These assertions are arithmetic, not smoke tests: a dashboard that
 * is confidently wrong is worse than one that is missing.
 */
final class AnalyticsReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_read_reports(): void
    {
        $this->getJson('/api/v1/analytics/dashboard')->assertStatus(401);
    }

    public function test_waiter_cannot_read_the_business_numbers(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/analytics/dashboard')->assertStatus(403);
    }

    public function test_accountant_can_read_reports(): void
    {
        $user = User::factory()->create();
        $user->assignRole('accountant');
        $this->actingAs($user);

        $this->getJson('/api/v1/analytics/dashboard')->assertOk();
    }

    // ============ Dashboard ============

    public function test_dashboard_counts_only_paid_orders(): void
    {
        $this->actingAsOwner();

        Order::factory()->paid()->create(['total' => 10000000, 'guests_count' => 2]);
        Order::factory()->paid()->create(['total' => 20000000, 'guests_count' => 3]);
        // Still open — must not be counted as revenue.
        Order::factory()->create(['total' => 99000000, 'guests_count' => 4]);

        $this->getJson('/api/v1/analytics/dashboard')
            ->assertOk()
            ->assertJsonPath('revenue_tiyin', 30000000)
            ->assertJsonPath('orders_count', 2)
            ->assertJsonPath('guests_count', 5)
            ->assertJsonPath('average_cheque_tiyin', 15000000)
            ->assertJsonPath('open_orders', 1);
    }

    public function test_dashboard_survives_a_day_with_no_trading(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/dashboard')
            ->assertOk()
            ->assertJsonPath('revenue_tiyin', 0)
            ->assertJsonPath('average_cheque_tiyin', 0);
    }

    // ============ Sales series ============

    public function test_sales_series_returns_one_row_per_day_including_empty_ones(): void
    {
        $this->actingAsOwner();
        Order::factory()->paid()->create(['total' => 5000000]);

        $response = $this->getJson('/api/v1/analytics/sales?days=7')->assertOk();

        $response->assertJsonPath('days', 7)
            ->assertJsonCount(7, 'data')
            ->assertJsonPath('total_revenue_tiyin', 5000000);

        // A closed day must read as an explicit zero, not vanish from the chart.
        $zeros = collect($response->json('data'))->where('revenue_tiyin', 0)->count();
        $this->assertSame(6, $zeros);
    }

    public function test_sales_window_is_capped(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/sales?days=9999')
            ->assertOk()
            ->assertJsonPath('days', 90);
    }

    // ============ ABC ============

    public function test_abc_classifies_dishes_by_share_of_revenue(): void
    {
        $this->actingAsOwner();
        $order = Order::factory()->paid()->create();

        // 80 / 15 / 5 split across three dishes.
        OrderItem::factory()->create(['order_id' => $order->id, 'sku' => 'OSH', 'title' => 'Osh', 'quantity' => 1, 'unit_price' => 8000000, 'total_price' => 8000000]);
        OrderItem::factory()->create(['order_id' => $order->id, 'sku' => 'MNT', 'title' => 'Manti', 'quantity' => 1, 'unit_price' => 1500000, 'total_price' => 1500000]);
        OrderItem::factory()->create(['order_id' => $order->id, 'sku' => 'CHY', 'title' => 'Choy', 'quantity' => 1, 'unit_price' => 500000, 'total_price' => 500000]);

        $response = $this->getJson('/api/v1/analytics/abc')->assertOk();

        $response->assertJsonPath('total_revenue_tiyin', 10000000)
            ->assertJsonPath('data.0.sku', 'OSH')
            ->assertJsonPath('data.0.class', 'A')
            ->assertJsonPath('data.0.share_percent', 80)
            ->assertJsonPath('data.1.sku', 'MNT')
            ->assertJsonPath('data.1.class', 'B')
            ->assertJsonPath('data.2.sku', 'CHY')
            ->assertJsonPath('data.2.class', 'C');
    }

    public function test_abc_groups_the_same_dish_across_orders(): void
    {
        $this->actingAsOwner();
        $a = Order::factory()->paid()->create();
        $b = Order::factory()->paid()->create();

        foreach ([$a, $b] as $order) {
            OrderItem::factory()->create([
                'order_id' => $order->id, 'sku' => 'OSH', 'title' => 'Osh',
                'quantity' => 2, 'unit_price' => 4500000, 'total_price' => 9000000,
            ]);
        }

        $this->getJson('/api/v1/analytics/abc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.quantity', 4)
            ->assertJsonPath('data.0.revenue_tiyin', 18000000);
    }

    // ============ Food cost ============

    public function test_food_cost_reports_percent_per_dish(): void
    {
        $this->actingAsOwner();
        MenuItem::factory()->create(['sku' => 'OSH', 'price' => 4500000, 'cost_price' => 1350000]);

        $this->getJson('/api/v1/analytics/food-cost')
            ->assertOk()
            ->assertJsonPath('items_costed', 1)
            ->assertJsonPath('data.0.food_cost_percent', 30)
            ->assertJsonPath('data.0.margin_percent', 70)
            ->assertJsonPath('average_food_cost_percent', 30);
    }

    public function test_an_uncosted_dish_reports_null_not_a_perfect_margin(): void
    {
        $this->actingAsOwner();
        MenuItem::factory()->create(['sku' => 'NEW', 'price' => 3000000, 'cost_price' => null]);

        $this->getJson('/api/v1/analytics/food-cost')
            ->assertOk()
            ->assertJsonPath('items_costed', 0)
            ->assertJsonPath('data.0.food_cost_percent', null)
            ->assertJsonPath('data.0.margin_percent', null)
            ->assertJsonPath('average_food_cost_percent', null);
    }

    // ============ Channels ============

    public function test_channels_split_revenue_by_where_it_came_from(): void
    {
        $this->actingAsOwner();
        Order::factory()->paid()->count(2)->create(['channel' => 'dine_in', 'total' => 10000000]);
        Order::factory()->paid()->create(['channel' => 'delivery', 'total' => 6000000]);

        $response = $this->getJson('/api/v1/analytics/channels')->assertOk();

        $response->assertJsonPath('total_revenue_tiyin', 26000000)
            ->assertJsonPath('data.0.channel', 'dine_in')
            ->assertJsonPath('data.0.orders_count', 2)
            ->assertJsonPath('data.0.revenue_tiyin', 20000000)
            ->assertJsonPath('data.0.average_cheque_tiyin', 10000000)
            ->assertJsonPath('data.1.channel', 'delivery');
    }

    // ============ Peak hours ============

    public function test_peak_hours_always_returns_all_24_hours(): void
    {
        $this->actingAsOwner();
        Order::factory()->paid()->create(['total' => 5000000]);

        $this->getJson('/api/v1/analytics/peak-hours')
            ->assertOk()
            ->assertJsonCount(24, 'data')
            ->assertJsonPath('data.0.hour', 0)
            ->assertJsonPath('data.23.hour', 23);
    }

    // ============ Tenant isolation ============

    public function test_reports_never_mix_two_restaurants(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $b = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Order::factory()->paid()->create(['tenant_id' => $a->id, 'total' => 10000000]);
        Order::factory()->paid()->create(['tenant_id' => $b->id, 'total' => 77000000]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        // The owner sees their own takings only — never the 87 000 000 that
        // both restaurants add up to.
        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/analytics/dashboard')
            ->assertOk()
            ->assertJsonPath('revenue_tiyin', 10000000);

        // Reaching for the other restaurant's report is refused outright.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/analytics/dashboard')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}

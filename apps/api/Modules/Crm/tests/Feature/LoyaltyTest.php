<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;
use Modules\Crm\Models\LoyaltyTransaction;
use Tests\TestCase;

/**
 * Guests and loyalty. Points are money the restaurant has promised to honour,
 * so the balance rules get the same scrutiny as the till.
 */
final class LoyaltyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsMarketer(): User
    {
        $user = User::factory()->create();
        $user->assignRole('marketer');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_read_the_guest_list(): void
    {
        $this->getJson('/api/v1/crm/customers')->assertStatus(401);
    }

    public function test_cook_has_no_access_to_guest_data(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        $this->getJson('/api/v1/crm/customers')->assertStatus(403);
    }

    public function test_waiter_can_look_a_guest_up_but_not_edit_them(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);
        $customer = Customer::factory()->create();

        $this->getJson('/api/v1/crm/customers')->assertOk();
        $this->patchJson("/api/v1/crm/customers/{$customer->id}", ['name' => 'X'])->assertStatus(403);
    }

    // ============ Guests ============

    public function test_marketer_can_register_a_guest(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/customers', [
            'phone' => '+998901112233',
            'name' => 'Aziz Karimov',
            'allergens' => ['nuts'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.phone', '+998901112233')
            ->assertJsonPath('data.points', 0)
            ->assertJsonPath('data.tier', 'bronze')
            ->assertJsonPath('data.allergens.0', 'nuts');
    }

    public function test_a_phone_number_identifies_one_guest_per_restaurant(): void
    {
        $this->actingAsMarketer();
        Customer::factory()->create(['phone' => '+998901112233']);

        $this->postJson('/api/v1/crm/customers', ['phone' => '+998901112233'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('phone');
    }

    public function test_average_cheque_is_derived_from_visits(): void
    {
        $this->actingAsMarketer();
        $customer = Customer::factory()->create(['visits_count' => 4, 'total_spent' => 40000000]);

        $this->getJson("/api/v1/crm/customers/{$customer->id}")
            ->assertOk()
            ->assertJsonPath('data.average_cheque', 10000000);
    }

    // ============ Loyalty points ============

    public function test_earning_points_moves_the_balance_and_leaves_a_ledger_line(): void
    {
        $this->actingAsMarketer();
        $customer = Customer::factory()->withPoints(100)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/points", [
            'kind' => 'earn',
            'points' => 250,
        ])
            ->assertCreated()
            ->assertJsonPath('transaction.points', 250)
            ->assertJsonPath('transaction.balance_after', 350)
            ->assertJsonPath('customer.points', 350);

        $this->assertDatabaseHas('loyalty_transactions', [
            'customer_id' => $customer->id,
            'kind' => 'earn',
            'points' => 250,
        ]);
    }

    public function test_redeeming_points_subtracts_them(): void
    {
        $this->actingAsMarketer();
        $customer = Customer::factory()->withPoints(500)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/points", [
            'kind' => 'redeem',
            'points' => 200,
        ])
            ->assertCreated()
            ->assertJsonPath('transaction.points', -200)
            ->assertJsonPath('customer.points', 300);
    }

    public function test_a_guest_cannot_spend_points_they_do_not_have(): void
    {
        $this->actingAsMarketer();
        $customer = Customer::factory()->withPoints(50)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/points", [
            'kind' => 'redeem',
            'points' => 500,
        ])->assertStatus(422);

        // Balance untouched and no ledger line written.
        $this->assertSame(50, $customer->refresh()->points);
        $this->assertSame(0, LoyaltyTransaction::where('customer_id', $customer->id)->count());
    }

    public function test_the_ledger_always_agrees_with_the_balance(): void
    {
        $this->actingAsMarketer();
        $customer = Customer::factory()->withPoints(0)->create();

        foreach ([['earn', 300], ['earn', 200], ['redeem', 150]] as [$kind, $points]) {
            $this->postJson("/api/v1/crm/customers/{$customer->id}/points", [
                'kind' => $kind, 'points' => $points,
            ])->assertCreated();
        }

        $sum = (int) LoyaltyTransaction::where('customer_id', $customer->id)->sum('points');

        $this->assertSame(350, $customer->refresh()->points);
        $this->assertSame($sum, $customer->points);
    }

    public function test_tier_follows_lifetime_spend(): void
    {
        $this->actingAsMarketer();

        $bronze = Customer::factory()->create(['total_spent' => 50000000]);
        $silver = Customer::factory()->create(['total_spent' => 150000000]);
        $gold = Customer::factory()->create(['total_spent' => 800000000]);

        foreach ([$bronze, $silver, $gold] as $customer) {
            $customer->recalculateTier();
        }

        $this->assertSame('bronze', $bronze->refresh()->tier);
        $this->assertSame('silver', $silver->refresh()->tier);
        $this->assertSame('gold', $gold->refresh()->tier);
    }

    // ============ Feedback ============

    public function test_a_score_outside_one_to_five_is_rejected(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/feedbacks', ['score' => 9])
            ->assertStatus(422)
            ->assertJsonValidationErrors('score');
    }

    public function test_negative_feedback_can_be_filtered_and_resolved(): void
    {
        $this->actingAsMarketer();
        Feedback::factory()->count(3)->create(['score' => 5]);
        $bad = Feedback::factory()->negative()->create();

        $this->getJson('/api/v1/crm/feedbacks?filter[negative]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->postJson("/api/v1/crm/feedbacks/{$bad->id}/resolve")
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved');

        $this->assertNotNull($bad->refresh()->resolved_at);
    }

    // ============ Module info ============

    public function test_module_info_surfaces_urgent_feedback(): void
    {
        $this->actingAsMarketer();
        Customer::factory()->count(3)->create();
        Feedback::factory()->count(2)->create();
        Feedback::factory()->negative()->create();
        Feedback::factory()->resolved()->create();

        $this->getJson('/api/v1/crm/')
            ->assertOk()
            ->assertJsonPath('module', 'Crm')
            ->assertJsonPath('counts.feedback_unresolved', 3)
            ->assertJsonPath('counts.feedback_urgent', 1);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_guests(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Customer::factory()->count(4)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/customers')->assertOk()->assertJsonCount(4, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/crm/customers')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}

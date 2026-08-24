<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\CouponReservation;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\CustomerAddress;
use Tests\TestCase;

/**
 * A guest reading and editing their own account.
 *
 * Every endpoint here takes its subject from the token rather than from the
 * path, so most of these tests are about the same question asked five ways:
 * can a guest reach anything that is not theirs. The answer has to be no even
 * when the id is right and the restaurant is right — two guests at one
 * restaurant are still two people.
 */
final class CustomerAccountTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Customer $guest;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        $this->guest = Customer::factory()->create([
            'phone' => '+998901234567',
            'name' => 'Dilnoza Aliyeva',
            'points' => 2480,
            'visits_count' => 38,
        ]);
        $this->token = $this->tokenFor($this->guest);
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function tokenFor(Customer $guest): string
    {
        return $guest->createToken('test', ['customer'], now()->addDays(90))->plainTextToken;
    }

    /** @param array<string, mixed> $body */
    private function asGuest(string $method, string $path, array $body = [], ?string $token = null, ?Tenant $at = null): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => ($at ?? $this->tenant)->slug,
            'Authorization' => 'Bearer '.($token ?? $this->token),
            'Accept' => 'application/json',
        ])->json($method, $path, $body);
    }

    // ============ The door ============

    public function test_no_token_is_refused(): void
    {
        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->getJson('/api/v1/public/me')
            ->assertApiError('crm.customer_token_required');
    }

    public function test_a_staff_token_is_not_a_customer_token(): void
    {
        $staff = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $staffToken = $staff->createToken('console')->plainTextToken;

        // A perfectly valid token that simply has no "your" to answer with.
        $this->asGuest('GET', '/api/v1/public/me', token: $staffToken)
            ->assertApiError('crm.customer_token_required');
    }

    public function test_an_expired_token_says_so_rather_than_saying_nothing(): void
    {
        $this->guest->tokens()->update(['expires_at' => now()->subDay()]);

        $this->asGuest('GET', '/api/v1/public/me')
            ->assertApiError('crm.customer_token_expired');
    }

    public function test_a_blocked_guest_is_refused_with_their_own_code(): void
    {
        $this->guest->forceFill(['is_active' => false])->save();

        $this->asGuest('GET', '/api/v1/public/me')->assertApiError('crm.customer_blocked');
    }

    public function test_a_token_from_one_restaurant_is_nothing_at_another(): void
    {
        $other = $this->restaurant('lagmon-uyi');

        /*
         * The point of resolving the token AFTER tenancy: the customer row is
         * behind row-level security, so with the policies focused on another
         * restaurant the lookup returns nothing at all. Isolation inherited
         * from PostgreSQL rather than asserted in PHP.
         */
        $this->asGuest('GET', '/api/v1/public/me', at: $other)
            ->assertApiError('crm.customer_token_required');
    }

    // ============ The profile ============

    public function test_a_guest_reads_their_own_profile(): void
    {
        CustomerAddress::factory()->primary()->create([
            'customer_id' => $this->guest->id,
            'label' => 'Uy',
        ]);

        $this->asGuest('GET', '/api/v1/public/me')
            ->assertOk()
            ->assertJsonPath('data.name', 'Dilnoza Aliyeva')
            ->assertJsonPath('data.phone', '+998901234567')
            ->assertJsonPath('data.points', 2480)
            ->assertJsonPath('data.orders_count', 38)
            ->assertJsonPath('data.addresses.0.label', 'Uy');
    }

    public function test_the_profile_never_carries_what_the_restaurant_privately_thinks(): void
    {
        $this->guest->forceFill([
            'note' => 'Always complains about the bill',
            'credit_limit' => 50_000_00,
        ])->save();

        $answer = $this->asGuest('GET', '/api/v1/public/me')->assertOk();

        $body = (array) $answer->json('data');
        $this->assertArrayNotHasKey('note', $body);
        $this->assertArrayNotHasKey('credit_limit', $body);
        $this->assertArrayNotHasKey('account_balance', $body);
        $this->assertArrayNotHasKey('allergens', $body);
    }

    public function test_a_guest_may_change_their_name_and_language(): void
    {
        $this->asGuest('PATCH', '/api/v1/public/me', ['name' => 'Dilnoza A.', 'locale' => 'ru'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Dilnoza A.')
            ->assertJsonPath('data.locale', 'ru');
    }

    public function test_a_guest_cannot_write_their_own_balance(): void
    {
        $this->asGuest('PATCH', '/api/v1/public/me', ['points' => 999999, 'phone' => '+998900000000'])
            ->assertOk();

        $this->guest->refresh();
        $this->assertSame(2480, $this->guest->points);
        $this->assertSame('+998901234567', $this->guest->phone);
    }

    public function test_signing_out_kills_only_this_device(): void
    {
        $second = $this->tokenFor($this->guest);

        $this->asGuest('DELETE', '/api/v1/public/me/session')->assertOk();

        // The other phone is still signed in — a guest handing one device over
        // must not be signed out on the tablet at home.
        $this->asGuest('GET', '/api/v1/public/me', token: $second)->assertOk();
        $this->asGuest('GET', '/api/v1/public/me')->assertApiError('crm.customer_token_required');
    }

    // ============ Addresses ============

    public function test_the_first_address_is_the_default_whether_or_not_it_asked_to_be(): void
    {
        $this->asGuest('POST', '/api/v1/public/addresses', [
            'label' => 'Uy',
            'line' => 'Chilonzor 9, 42-uy',
            'entrance' => '3',
            'floor' => '4',
            'flat' => '17',
        ])
            ->assertCreated()
            ->assertJsonPath('data.is_default', true)
            // Assembled on the server, in the order somebody walks them.
            ->assertJsonPath('data.full_line', 'Chilonzor 9, 42-uy, 3-podyezd, 4-qavat, 17-xonadon');
    }

    public function test_promoting_a_second_address_demotes_the_first(): void
    {
        $this->asGuest('POST', '/api/v1/public/addresses', ['label' => 'Uy', 'line' => 'Chilonzor 9'])
            ->assertCreated();
        $this->asGuest('POST', '/api/v1/public/addresses', [
            'label' => 'Ish', 'line' => 'Amir Temur 108', 'is_default' => true,
        ])->assertCreated();

        $defaults = CustomerAddress::query()->where('customer_id', $this->guest->id)
            ->where('is_default', true)->pluck('label')->all();

        $this->assertSame(['Ish'], $defaults);
    }

    public function test_deleting_the_default_promotes_another(): void
    {
        $home = $this->asGuest('POST', '/api/v1/public/addresses', ['label' => 'Uy', 'line' => 'Chilonzor 9'])
            ->assertCreated()->json('data.id');
        $this->asGuest('POST', '/api/v1/public/addresses', ['label' => 'Ish', 'line' => 'Amir Temur 108'])
            ->assertCreated();

        $this->asGuest('DELETE', "/api/v1/public/addresses/{$home}")->assertOk();

        $this->assertSame(
            ['Ish'],
            CustomerAddress::query()->where('customer_id', $this->guest->id)
                ->where('is_default', true)->pluck('label')->all(),
        );
    }

    public function test_half_a_coordinate_is_refused(): void
    {
        // A latitude with no longitude draws a point on the Greenwich meridian,
        // in the sea, and calls it the guest's flat.
        $this->asGuest('POST', '/api/v1/public/addresses', [
            'label' => 'Uy', 'line' => 'Chilonzor 9', 'lat' => 41.31,
        ])->assertStatus(422);
    }

    public function test_a_guest_cannot_delete_another_guests_address(): void
    {
        $stranger = Customer::factory()->create(['phone' => '+998907654321']);
        $theirs = CustomerAddress::factory()->create(['customer_id' => $stranger->id]);

        // Same restaurant, real id, and still not found: the lookup goes
        // through the caller's own relation.
        $this->asGuest('DELETE', "/api/v1/public/addresses/{$theirs->id}")
            ->assertApiError('crm.address_not_found', field: 'address');

        $this->assertDatabaseHas('crm.customer_addresses', ['id' => $theirs->id, 'deleted_at' => null]);
    }

    public function test_a_guest_only_sees_their_own_addresses(): void
    {
        $stranger = Customer::factory()->create(['phone' => '+998907654321']);
        CustomerAddress::factory()->create(['customer_id' => $stranger->id]);
        CustomerAddress::factory()->create(['customer_id' => $this->guest->id, 'label' => 'Uy']);

        $this->asGuest('GET', '/api/v1/public/addresses')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.label', 'Uy');
    }

    public function test_the_address_book_has_a_ceiling(): void
    {
        CustomerAddress::factory()->count(10)->create(['customer_id' => $this->guest->id]);

        $this->asGuest('POST', '/api/v1/public/addresses', ['label' => 'Yana', 'line' => 'Yana bir joy'])
            ->assertApiError('crm.address_limit_reached');
    }

    // ============ Loyalty coupons ============

    public function test_the_shelf_lists_what_is_on_it_and_what_the_guest_can_afford_it_with(): void
    {
        Coupon::factory()->costing(500)->create(['key' => 'pickup-5']);

        $this->asGuest('GET', '/api/v1/public/coupons')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'pickup-5')
            ->assertJsonPath('data.0.points_cost', 500)
            ->assertJsonPath('meta.points', 2480);
    }

    public function test_reserving_a_coupon_spends_the_points_and_mints_a_code(): void
    {
        $coupon = Coupon::factory()->costing(1200)->create(['key' => 'free-delivery']);

        $answer = $this->asGuest('POST', "/api/v1/public/coupons/{$coupon->id}/reserve")
            ->assertCreated();

        $this->assertSame(1200, $answer->json('data.points_spent'));
        $this->assertMatchesRegularExpression('/^SR[0-9A-Z]{8}$/', (string) $answer->json('data.code'));
        $this->assertSame(1280, $answer->json('meta.points'));
        $this->assertSame(1280, $this->guest->refresh()->points);

        // The deduction left a line behind it, rather than being a number that
        // changed.
        $this->assertDatabaseHas('crm.loyalty_transactions', [
            'customer_id' => $this->guest->id,
            'kind' => 'redeem',
            'points' => -1200,
        ]);
    }

    public function test_a_guest_who_cannot_afford_it_keeps_their_points(): void
    {
        $coupon = Coupon::factory()->costing(9000)->create();

        $this->asGuest('POST', "/api/v1/public/coupons/{$coupon->id}/reserve")
            ->assertApiError('crm.not_enough_points');

        $this->assertSame(2480, $this->guest->refresh()->points);
    }

    public function test_the_same_coupon_cannot_be_bought_twice(): void
    {
        $coupon = Coupon::factory()->costing(500)->create();

        $this->asGuest('POST', "/api/v1/public/coupons/{$coupon->id}/reserve")->assertCreated();
        $this->asGuest('POST', "/api/v1/public/coupons/{$coupon->id}/reserve")
            ->assertApiError('crm.coupon_already_held');

        // Once, not twice: the second attempt must not have cost anything.
        $this->assertSame(1980, $this->guest->refresh()->points);
        $this->assertSame(1, CouponReservation::query()->where('customer_id', $this->guest->id)->count());
    }

    public function test_another_restaurants_coupon_does_not_exist_here(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($other);
        $theirs = Coupon::factory()->create(['key' => 'their-offer']);
        app(TenantContext::class)->set($this->tenant);

        $this->asGuest('POST', "/api/v1/public/coupons/{$theirs->id}/reserve")
            ->assertApiError('crm.coupon_not_found', field: 'coupon');
    }

    public function test_a_withdrawn_coupon_cannot_be_reserved(): void
    {
        $coupon = Coupon::factory()->create(['is_active' => false]);

        $this->asGuest('POST', "/api/v1/public/coupons/{$coupon->id}/reserve")
            ->assertApiError('crm.coupon_not_found');
    }
}

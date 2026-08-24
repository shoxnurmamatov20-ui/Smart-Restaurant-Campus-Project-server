<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\PushToken;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Customer;
use Tests\TestCase;

/**
 * A restaurant's own guest registering the phone their order notice arrives on.
 *
 * The core `POST /api/v1/push/tokens` cannot take it — that route stamps
 * `$request->user()`, and a CRM customer is not a `User`: no password, no
 * Spatie role, no roster. So the customer app had somewhere to be notified and
 * nowhere to say where.
 *
 * The half worth testing hardest is the tenant. A guest's row IS stamped with
 * their restaurant, unlike the marketplace's, and a device registered against
 * one restaurant must not be reachable from another's sender.
 */
final class CustomerPushTokenTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'ExponentPushToken[crmguest00000001]';

    private Tenant $tenant;

    private Customer $guest;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        $this->guest = Customer::factory()->create(['phone' => '+998901234567', 'name' => 'Dilnoza Aliyeva']);
        $this->token = $this->guest->createToken('test', ['customer'], now()->addDays(90))->plainTextToken;
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @param array<string, mixed> $body */
    private function asGuest(string $method, string $path, array $body = [], ?string $token = null): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Authorization' => 'Bearer '.($token ?? $this->token),
            'Accept' => 'application/json',
        ])->json($method, $path, $body);
    }

    public function test_a_guests_phone_is_registered_against_their_own_restaurant(): void
    {
        $this->asGuest('POST', '/api/v1/public/push/tokens', [
            'token' => self::TOKEN,
            'platform' => 'ios',
            'device_name' => 'iPhone 15',
            'locale' => 'ru',
        ])->assertCreated();

        $row = PushToken::query()->withoutGlobalScopes()->where('token', self::TOKEN)->firstOrFail();

        $this->assertSame($this->tenant->id, (int) $row->tenant_id);
        // A guest is not a member of staff and holds no user row.
        $this->assertNull($row->user_id);
        $this->assertSame(PushToken::OF_CUSTOMER, $row->notifiable_type);
        $this->assertSame($this->guest->getKey(), (int) $row->notifiable_id);
        // Decided by the route, never sent by the client.
        $this->assertSame('customer', $row->surface);
        $this->assertSame('ru', $row->locale);
    }

    public function test_the_same_handset_moves_rather_than_multiplying(): void
    {
        $this->asGuest('POST', '/api/v1/public/push/tokens', ['token' => self::TOKEN, 'platform' => 'ios'])
            ->assertCreated();

        $second = Customer::factory()->create(['phone' => '+998907654321']);
        $secondToken = $second->createToken('test', ['customer'], now()->addDays(90))->plainTextToken;

        $this->asGuest('POST', '/api/v1/public/push/tokens', ['token' => self::TOKEN, 'platform' => 'ios'], $secondToken)
            ->assertCreated();

        // One install, one token, one owner at a time — otherwise the first
        // person's order notices keep arriving on a handset they no longer hold.
        $this->assertSame(1, PushToken::query()->withoutGlobalScopes()->where('token', self::TOKEN)->count());
        $this->assertSame(
            $second->getKey(),
            (int) PushToken::query()->withoutGlobalScopes()->where('token', self::TOKEN)->value('notifiable_id'),
        );
    }

    public function test_a_staff_token_is_not_a_customer_token(): void
    {
        $staff = User::factory()->create(['tenant_id' => $this->tenant->id]);

        $this->asGuest(
            'POST',
            '/api/v1/public/push/tokens',
            ['token' => self::TOKEN, 'platform' => 'ios'],
            $staff->createToken('console')->plainTextToken,
        )->assertApiError('crm.customer_token_required');
    }

    public function test_a_token_that_is_not_expos_is_refused(): void
    {
        $this->asGuest('POST', '/api/v1/public/push/tokens', ['token' => 'not-a-token', 'platform' => 'ios'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'push.token_invalid');
    }

    public function test_a_guest_can_say_the_phone_is_gone(): void
    {
        $this->asGuest('POST', '/api/v1/public/push/tokens', ['token' => self::TOKEN, 'platform' => 'ios'])
            ->assertCreated();

        $this->asGuest('DELETE', '/api/v1/public/push/tokens', ['token' => self::TOKEN])->assertNoContent();

        $this->assertSame(0, PushToken::query()->withoutGlobalScopes()->where('token', self::TOKEN)->count());
    }

    public function test_another_restaurants_guest_cannot_delete_this_row(): void
    {
        $this->asGuest('POST', '/api/v1/public/push/tokens', ['token' => self::TOKEN, 'platform' => 'ios'])
            ->assertCreated();

        $elsewhere = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($elsewhere);

        $stranger = Customer::factory()->create(['tenant_id' => $elsewhere->id, 'phone' => '+998905550000']);
        $strangerToken = $stranger->createToken('test', ['customer'], now()->addDays(90))->plainTextToken;

        $this->withHeaders([
            'X-Tenant' => $elsewhere->slug,
            'Authorization' => 'Bearer '.$strangerToken,
            'Accept' => 'application/json',
        ])->json('DELETE', '/api/v1/public/push/tokens', ['token' => self::TOKEN])->assertNoContent();

        // Answered 204 — a delete of something that is not yours is not found
        // rather than refused — and the row is still there.
        $this->assertSame(1, PushToken::query()->withoutGlobalScopes()->where('token', self::TOKEN)->count());
    }
}

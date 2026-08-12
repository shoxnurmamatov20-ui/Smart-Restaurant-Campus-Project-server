<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The front door. Everything else in the platform is unreachable until this
 * works, so the rules it enforces are asserted rather than assumed.
 */
final class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    /**
     * @return array<string, mixed>
     */
    private function registrationPayload(array $overrides = []): array
    {
        return array_merge([
            'restaurant_name' => 'Osh Markazi',
            'name' => 'Aziz Karimov',
            'email' => 'aziz@osh.uz',
            'phone' => '+998901112233',
            'password' => 'parol1234',
            'password_confirmation' => 'parol1234',
        ], $overrides);
    }

    // ============ Registration ============

    public function test_a_restaurant_can_sign_itself_up(): void
    {
        $response = $this->postJson('/api/v1/auth/register', $this->registrationPayload())
            ->assertCreated()
            ->assertJsonPath('user.email', 'aziz@osh.uz')
            ->assertJsonPath('tenant.name', 'Osh Markazi')
            ->assertJsonPath('tenant.slug', 'osh-markazi')
            ->assertJsonStructure(['token', 'user' => ['id', 'roles'], 'tenant' => ['id', 'slug']]);

        $this->assertNotEmpty($response->json('token'));

        // Whoever signs the restaurant up owns it.
        $this->assertSame(['owner'], $response->json('user.roles'));

        $this->assertDatabaseHas('tenants', ['slug' => 'osh-markazi', 'status' => 'active']);
        $this->assertDatabaseHas('users', ['email' => 'aziz@osh.uz', 'is_active' => true]);
    }

    public function test_the_owner_is_attached_to_the_new_tenant(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload())->assertCreated();

        $tenant = Tenant::query()->where('slug', 'osh-markazi')->firstOrFail();
        $user = User::query()->where('email', 'aziz@osh.uz')->firstOrFail();

        $this->assertSame($tenant->id, $user->tenant_id);
    }

    public function test_two_restaurants_with_the_same_name_get_different_slugs(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload())->assertCreated();
        $this->postJson('/api/v1/auth/register', $this->registrationPayload([
            'email' => 'boshqa@osh.uz',
        ]))
            ->assertCreated()
            ->assertJsonPath('tenant.slug', 'osh-markazi-2');
    }

    public function test_registration_rejects_a_weak_password(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload([
            'password' => 'short',
            'password_confirmation' => 'short',
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_registration_rejects_a_mismatched_confirmation(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload([
            'password_confirmation' => 'boshqacha1234',
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_a_failed_registration_creates_neither_tenant_nor_user(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registrationPayload([
            'restaurant_name' => '',
        ]))->assertStatus(422);

        $this->assertDatabaseCount('tenants', 0);
        $this->assertDatabaseCount('users', 0);
    }

    // ============ Login ============

    public function test_a_user_can_sign_in_with_email(): void
    {
        $user = User::factory()->create(['email' => 'aziz@osh.uz']);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'aziz@osh.uz',
            'password' => 'password',
            'device_name' => 'kassa-1',
        ])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonStructure(['token', 'user']);

        $this->assertNotNull($user->refresh()->last_login_at);
    }

    public function test_a_user_can_sign_in_with_a_phone_number(): void
    {
        $user = User::factory()->create(['phone' => '+998901112233']);

        $this->postJson('/api/v1/auth/login', [
            'phone' => '+998901112233',
            'password' => 'password',
        ])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_a_phone_without_the_plus_still_signs_in(): void
    {
        // Telegram hands back the number without a plus.
        User::factory()->create(['phone' => '+998901112233']);

        $this->postJson('/api/v1/auth/login', [
            'phone' => '998901112233',
            'password' => 'password',
        ])->assertOk();
    }

    public function test_a_wrong_password_is_refused(): void
    {
        User::factory()->create(['email' => 'aziz@osh.uz']);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'aziz@osh.uz',
            'password' => 'notoq',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_an_unknown_account_fails_the_same_way_as_a_wrong_password(): void
    {
        // Identical response: an attacker must not learn which emails exist.
        $unknown = $this->postJson('/api/v1/auth/login', [
            'email' => 'yoq@osh.uz',
            'password' => 'parol1234',
        ])->assertStatus(422);

        User::factory()->create(['email' => 'bor@osh.uz']);
        $wrongPassword = $this->postJson('/api/v1/auth/login', [
            'email' => 'bor@osh.uz',
            'password' => 'notoq1234',
        ])->assertStatus(422);

        $this->assertSame(
            $unknown->json('errors.email'),
            $wrongPassword->json('errors.email'),
        );
    }

    public function test_a_deactivated_employee_cannot_sign_in(): void
    {
        User::factory()->inactive()->create(['email' => 'ketgan@osh.uz']);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'ketgan@osh.uz',
            'password' => 'password',
        ])->assertStatus(422);
    }

    public function test_login_requires_an_identifier(): void
    {
        $this->postJson('/api/v1/auth/login', ['password' => 'parol1234'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'phone']);
    }

    public function test_signing_in_again_on_the_same_device_replaces_its_token(): void
    {
        $user = User::factory()->create(['email' => 'aziz@osh.uz']);

        foreach (range(1, 2) as $ignored) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'aziz@osh.uz',
                'password' => 'password',
                'device_name' => 'kassa-1',
            ])->assertOk();
        }

        // A re-paired tablet must not leave a working token behind.
        $this->assertSame(1, $user->tokens()->where('name', 'kassa-1')->count());
    }

    // ============ Session ============

    public function test_me_returns_the_account_behind_the_token(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.email', $user->email);
    }

    public function test_me_is_closed_to_anonymous_callers(): void
    {
        $this->getJson('/api/v1/auth/me')->assertStatus(401);
    }

    public function test_context_reports_the_tenant_roles_and_permissions(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $user = User::factory()->forTenant($tenant)->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $response = $this->getJson('/api/v1/auth/context')->assertOk()
            ->assertJsonPath('tenant.slug', 'osh-markazi')
            ->assertJsonPath('roles.0', 'waiter');

        // A client renders its navigation from this, so it must be real.
        $this->assertContains('orders.view', $response->json('permissions'));
        $this->assertNotContains('finance.manage', $response->json('permissions'));
    }

    public function test_logout_revokes_only_the_current_token(): void
    {
        $user = User::factory()->create(['email' => 'aziz@osh.uz']);

        $kassa = $this->postJson('/api/v1/auth/login', [
            'email' => 'aziz@osh.uz', 'password' => 'password', 'device_name' => 'kassa-1',
        ])->json('token');

        $this->postJson('/api/v1/auth/login', [
            'email' => 'aziz@osh.uz', 'password' => 'password', 'device_name' => 'oshxona-1',
        ])->assertOk();

        $this->withHeader('Authorization', "Bearer {$kassa}")
            ->postJson('/api/v1/auth/logout')->assertOk();

        // The kitchen screen keeps working; only this device signed out.
        $this->assertSame(0, $user->tokens()->where('name', 'kassa-1')->count());
        $this->assertSame(1, $user->tokens()->where('name', 'oshxona-1')->count());
    }

    // ============ Tenant pinning ============

    public function test_a_user_may_not_borrow_another_restaurants_context(): void
    {
        $mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $user = User::factory()->forTenant($mine)->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        // Refused outright — an empty list would look like "no data" and hide
        // the attempt.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/auth/context')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }

    public function test_a_users_own_tenant_resolves_without_any_header(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $user = User::factory()->forTenant($tenant)->create();
        $this->actingAs($user);

        // A waiter's tablet should not have to know its restaurant's slug.
        $this->getJson('/api/v1/auth/context')
            ->assertOk()
            ->assertJsonPath('tenant.slug', 'osh-markazi');
    }

    public function test_a_suspended_restaurant_locks_its_staff_out(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Yopilgan', 'slug' => 'yopilgan', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'suspended',
        ]);
        $user = User::factory()->forTenant($tenant)->create();
        $this->actingAs($user);

        $this->getJson('/api/v1/auth/context')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_INACTIVE');
    }

    // ============ Health ============

    public function test_health_probes_its_dependencies(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('checks.database.ok', true)
            ->assertJsonPath('checks.cache.ok', true)
            ->assertJsonPath('checks.migrations.ok', true)
            ->assertJsonPath('checks.storage.ok', true)
            ->assertJsonPath('checks.outbox.ok', true);
    }

    public function test_liveness_answers_without_touching_anything(): void
    {
        // Deliberately dependency-free: a database outage must not get the
        // container killed and restarted, which fixes nothing and removes
        // capacity from a service that is otherwise fine.
        $this->getJson('/api/health/live')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonMissingPath('checks');
    }

    public function test_readiness_reports_only_what_a_request_actually_needs(): void
    {
        $response = $this->getJson('/api/health/ready')->assertOk();

        $this->assertSame(
            ['database', 'cache', 'migrations'],
            array_keys($response->json('checks')),
        );

        foreach ($response->json('checks') as $name => $check) {
            $this->assertTrue($check['critical'], "{$name} must be a critical check.");
        }
    }

    public function test_an_undelivered_side_effect_shows_as_degraded_not_as_an_outage(): void
    {
        // Events nobody could deliver are worth alerting on, but the node still
        // serves requests correctly — pulling it from rotation would turn a
        // background problem into an outage.
        StoredDomainEvent::query()->create([
            'event_id' => '11111111-2222-4333-8444-555555555555',
            'name' => 'orders.paid',
            'module' => 'Orders',
            'schema_version' => 1,
            'payload' => [],
            'occurred_at' => now(),
        ])->forceFill([
            // Delivery bookkeeping is not fillable — only the bus writes it.
            'attempts' => StoredDomainEvent::MAX_ATTEMPTS,
        ])->save();

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('checks.outbox.ok', false);

        // Readiness never looks at the outbox, so traffic keeps flowing.
        $this->getJson('/api/health/ready')
            ->assertOk()
            ->assertJsonPath('status', 'ok');
    }
}

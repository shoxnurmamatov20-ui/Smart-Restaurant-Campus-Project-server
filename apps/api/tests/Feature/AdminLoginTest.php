<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\TenantSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * The platform operator's door — handoff §3.12, third tab.
 *
 * Three things must hold together: the password, the six-digit code, and the
 * `super-admin` role on an account belonging to no restaurant. The tests that
 * matter are the ones where two of the three hold, because that is the shape of
 * every real attack on this endpoint — a leaked password without a phone, a
 * stolen code without the password, and a restaurant owner with both of their
 * own but no business here.
 *
 * The other half is replay. A TOTP code is valid for a whole window, so the
 * same six digits work more than once unless something remembers. Something
 * does, and `test_a_code_cannot_be_used_twice` is what keeps it doing so.
 */
final class AdminLoginTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'JBSWY3DPEHPK3PXP';

    private function code(): string
    {
        return app(Google2FA::class)->getCurrentOtp(self::SECRET);
    }

    private function operator(array $overrides = []): User
    {
        $user = User::factory()->create([
            'tenant_id' => null,
            'email' => 'ops@campus.uz',
            'password' => 'password',
            'is_active' => true,
            ...$overrides,
        ]);

        $user->syncRoles(['super-admin']);
        $user->forceFill([
            'two_factor_secret' => self::SECRET,
            'two_factor_confirmed_at' => now(),
        ])->save();

        return $user->fresh();
    }

    private function attempt(array $payload)
    {
        return $this->postJson('/api/v1/admin/login', [
            'email' => 'ops@campus.uz',
            'password' => 'password',
            'code' => $this->code(),
            ...$payload,
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_the_platform_operator_signs_in_with_all_three(): void
    {
        $this->operator();

        $response = $this->attempt([])->assertOk();

        $this->assertNotEmpty($response->json('token'));
        $this->assertSame('ops@campus.uz', $response->json('user.email'));

        // The design caps the session at thirty minutes, and it is capped on
        // the token rather than left to the client to honour.
        $expires = $response->json('expires_at');
        $this->assertNotNull($expires);
        $this->assertEqualsWithDelta(
            30,
            now()->diffInMinutes($expires),
            1,
            'The platform session should expire in 30 minutes',
        );
    }

    public function test_the_password_alone_is_not_enough(): void
    {
        $this->operator();

        $this->attempt(['code' => '000000'])->assertStatus(422);
    }

    public function test_the_code_alone_is_not_enough(): void
    {
        $this->operator();

        $this->attempt(['password' => 'not-the-password'])->assertStatus(422);
    }

    public function test_a_restaurant_owner_may_not_open_the_platform_door(): void
    {
        // Both factors of their own, and still no. An owner administers one
        // business; this endpoint hands over all of them.
        $tenant = Tenant::query()->create([
            'name' => 'Demo', 'slug' => 'demo-x', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $owner = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'owner@campus.uz',
            'password' => 'password',
        ]);
        $owner->syncRoles(['owner']);
        $owner->forceFill([
            'two_factor_secret' => self::SECRET,
            'two_factor_confirmed_at' => now(),
        ])->save();

        $this->postJson('/api/v1/admin/login', [
            'email' => 'owner@campus.uz',
            'password' => 'password',
            'code' => $this->code(),
        ])->assertStatus(422);
    }

    public function test_an_account_belonging_to_a_restaurant_is_not_this_account(): void
    {
        // Same address, inside a tenant. The lookup is scoped to
        // `tenant_id IS NULL`, so this is a different person entirely.
        $tenant = Tenant::query()->create([
            'name' => 'Demo', 'slug' => 'demo-y', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $impostor = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'ops@campus.uz',
            'password' => 'password',
        ]);
        $impostor->syncRoles(['super-admin']);
        $impostor->forceFill([
            'two_factor_secret' => self::SECRET,
            'two_factor_confirmed_at' => now(),
        ])->save();

        $this->attempt([])->assertStatus(422);
    }

    public function test_an_unenrolled_operator_cannot_sign_in_at_all(): void
    {
        // No secret means no second factor, and a door that falls back to one
        // factor when the second is missing is a door with no second factor.
        $user = $this->operator();
        $user->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null])->save();

        $this->attempt([])->assertStatus(422);
    }

    public function test_an_unconfirmed_secret_does_not_count(): void
    {
        // Enrolled but never proved: whoever wrote the secret can pass the
        // check, which is the one thing a second factor must not allow.
        $user = $this->operator();
        $user->forceFill(['two_factor_confirmed_at' => null])->save();

        $this->attempt([])->assertStatus(422);
    }

    public function test_a_deactivated_operator_is_refused(): void
    {
        $this->operator(['is_active' => false]);

        $this->attempt([])->assertStatus(422);
    }

    public function test_a_code_cannot_be_used_twice(): void
    {
        $this->operator();
        $code = $this->code();

        $this->postJson('/api/v1/admin/login', [
            'email' => 'ops@campus.uz', 'password' => 'password', 'code' => $code,
        ])->assertOk();

        // Same code, same window, seconds later. Valid by the clock and
        // refused anyway — this is the whole reason the window is stored.
        $this->postJson('/api/v1/admin/login', [
            'email' => 'ops@campus.uz', 'password' => 'password', 'code' => $code,
        ])->assertStatus(422);
    }

    public function test_signing_in_replaces_every_earlier_token(): void
    {
        $user = $this->operator();
        $user->createToken('an-old-laptop');

        $this->attempt([])->assertOk();

        // One live token. A platform session that can be held twice is a stolen
        // session its owner never notices.
        $this->assertSame(1, $user->fresh()->tokens()->count());
    }

    public function test_the_refusal_never_says_which_factor_failed(): void
    {
        $this->operator();

        $wrongPassword = $this->attempt(['password' => 'nope'])->json('message');
        $wrongCode = $this->attempt(['code' => '111111'])->json('message');
        $noSuchPerson = $this->postJson('/api/v1/admin/login', [
            'email' => 'nobody@campus.uz', 'password' => 'password', 'code' => $this->code(),
        ])->json('message');

        // Identical, on purpose: "wrong code" would confirm the password.
        $this->assertSame($wrongPassword, $wrongCode);
        $this->assertSame($wrongPassword, $noSuchPerson);
    }

    public function test_the_sign_in_is_written_to_the_audit_log(): void
    {
        // The design's promise on the form — "every sign-in is logged and
        // visible to the restaurant owner" — is only true if it is logged.
        $this->operator();
        $this->attempt([])->assertOk();

        $this->assertDatabaseHas('activity_log', [
            'log_name' => 'identity.user',
            'description' => 'platform.signed-in',
        ]);
    }

    public function test_the_seeded_operator_can_actually_sign_in(): void
    {
        // A demo account nobody can use is a demo account that does not exist.
        // TenantSeeder first: UserSeeder bails with a warning when the demo
        // restaurant is missing, and a silent bail here would make this test
        // pass by never creating the account it is about.
        $this->seed(TenantSeeder::class);
        $this->seed(UserSeeder::class);

        $this->assertDatabaseHas('users', ['email' => 'admin@campus.uz']);

        $this->postJson('/api/v1/admin/login', [
            'email' => 'admin@campus.uz',
            'password' => 'password',
            'code' => app(Google2FA::class)->getCurrentOtp(UserSeeder::DEMO_TOTP_SECRET),
        ])->assertOk();
    }

    public function test_the_password_check_runs_even_for_an_unknown_address(): void
    {
        // Not a behavioural assertion so much as a guard on the shape of the
        // handler: an early return for a missing user makes response time an
        // account-enumeration oracle.
        $source = file_get_contents(app_path('Http/Controllers/AdminAuthController.php'));

        $this->assertStringContainsString('Hash::check', $source);
        $this->assertSame(
            2,
            substr_count($source, 'Hash::check'),
            'The handler must hash-check even when no user was found',
        );
    }
}

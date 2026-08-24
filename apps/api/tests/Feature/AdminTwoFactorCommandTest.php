<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Support\Auth\TwoFactor;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class AdminTwoFactorCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_enrols_a_super_admin_and_the_printed_key_produces_codes_that_verify(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create(['email' => 'ops@example.test', 'tenant_id' => null]);
        $admin->assignRole('super-admin');

        $this->artisan('admin:two-factor', ['email' => 'ops@example.test'])
            ->expectsOutputToContain('Key:')
            ->assertSuccessful();

        $admin->refresh();
        $this->assertNotNull($admin->two_factor_secret);
        $this->assertNotNull($admin->two_factor_confirmed_at);

        // The key the operator was shown is the key the login checks.
        $code = app(Google2FA::class)->getCurrentOtp($admin->two_factor_secret);
        $this->assertTrue(app(TwoFactor::class)->verify($admin, $code));
    }

    public function test_running_it_again_replaces_the_secret(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create(['email' => 'ops@example.test', 'tenant_id' => null]);
        $admin->assignRole('super-admin');

        $this->artisan('admin:two-factor', ['email' => 'ops@example.test'])->assertSuccessful();
        $first = $admin->refresh()->two_factor_secret;

        $this->artisan('admin:two-factor', ['email' => 'ops@example.test'])->assertSuccessful();

        $this->assertNotSame($first, $admin->refresh()->two_factor_secret);
    }

    public function test_it_refuses_anyone_who_is_not_a_super_admin(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $owner = User::factory()->create(['email' => 'owner@example.test']);
        $owner->assignRole('owner');

        $this->artisan('admin:two-factor', ['email' => 'owner@example.test'])->assertFailed();
        $this->artisan('admin:two-factor', ['email' => 'nobody@example.test'])->assertFailed();

        $this->assertNull($owner->refresh()->two_factor_secret);
    }
}

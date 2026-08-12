<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

/**
 * Who may open Horizon and Telescope.
 *
 * Both providers shipped with the gate Laravel generates — an `in_array`
 * against an empty list of email addresses. That is false for every possible
 * value, so outside `local` neither dashboard could be opened by anyone. It
 * reads like a placeholder waiting to be filled and behaves like a lock with
 * no key, which is the worst of both: safe enough that nothing complains, and
 * broken the first morning a queue backs up in production.
 *
 * They now gate on `super-admin`. These two dashboards are the widest windows
 * in the platform — Telescope holds requests, queries and payloads across
 * every tenant; Horizon holds the job arguments, which is bills and phone
 * numbers — so the assertions that matter are the ones that keep a restaurant
 * *owner* out. An owner administers their own business. This is everyone's.
 */
final class OperatorDashboardGateTest extends TestCase
{
    use RefreshDatabase;

    private function person(string $role, ?Tenant $tenant = null): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant?->id,
            'email' => $role.'@gate-test.uz',
        ]);

        $user->syncRoles([$role]);

        return $user->fresh();
    }

    public function test_the_platform_operator_may_open_both_dashboards(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $operator = $this->person('super-admin');

        $this->assertTrue(Gate::forUser($operator)->allows('viewHorizon'));
        $this->assertTrue(Gate::forUser($operator)->allows('viewTelescope'));
    }

    public function test_no_restaurant_role_may_open_either_dashboard(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        // No factory on Tenant — a restaurant is created by a command, not
        // generated, so the columns are named here.
        $tenant = Tenant::query()->create([
            'name' => 'Gate Test Restoran',
            'slug' => 'gate-test',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        // The owner is first on purpose: they hold every permission inside
        // their restaurant, and none of that reaches across tenants.
        foreach (['owner', 'branch-manager', 'accountant', 'cashier', 'waiter', 'chef'] as $role) {
            $user = $this->person($role, $tenant);

            $this->assertFalse(
                Gate::forUser($user)->allows('viewHorizon'),
                "`{$role}` can open Horizon and read every tenant's job payloads",
            );
            $this->assertFalse(
                Gate::forUser($user)->allows('viewTelescope'),
                "`{$role}` can open Telescope and read every tenant's requests",
            );
        }
    }

    public function test_a_signed_out_visitor_may_not_open_horizon(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        // Horizon asks the gate about guests too, so the closure has to hold a
        // null without raising — an error here would be a 500 on a URL anyone
        // can reach, which is its own kind of disclosure.
        $this->assertFalse(Gate::forUser(null)->allows('viewHorizon'));
    }

    public function test_the_gate_is_not_an_email_allowlist(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        // The failure mode this test exists for: someone restores the
        // generated body, the operator's own address is not in it, and the
        // dashboards go dark in production while every test still passes.
        // Granting the role must be enough, and it must be all that is needed.
        $operator = User::factory()->create(['tenant_id' => null, 'email' => 'someone-nobody-listed@example.org']);
        $operator->syncRoles(['super-admin']);

        $this->assertTrue(Gate::forUser($operator->fresh())->allows('viewHorizon'));
        $this->assertTrue(Gate::forUser($operator->fresh())->allows('viewTelescope'));
    }
}

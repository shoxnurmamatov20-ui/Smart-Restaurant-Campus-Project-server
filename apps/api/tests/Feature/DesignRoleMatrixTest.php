<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The design's eight roles, checked against what the server actually grants.
 *
 * The console draws a sidebar per role — see apps/web/src/lib/roles.ts — and
 * that filter is presentation, nothing more. What a request may touch is
 * decided here, and the two have to agree or the product tells a waiter one
 * story and the API another.
 *
 * The platform runs fifteen roles because a restaurant has bartenders, hosts,
 * couriers and marketers that the design's eight do not name. Those are not in
 * scope for this test: it asserts that the eight the design *does* name are
 * present, hold what the design's §1.3 matrix says they hold, and — the half
 * that matters — hold nothing it says they do not.
 *
 * Negative assertions carry the weight. A role that is missing a permission
 * fails loudly the first time someone uses it; a role that has one it should
 * not is silent until it is used to do something nobody meant to allow.
 */
final class DesignRoleMatrixTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The design's role key against the platform's role name.
     *
     * Two vocabularies, one for each audience: the design names the job
     * (`kitchen`, `warehouse`), the platform names the post (`chef`,
     * `storekeeper`). Written down here so a rename on either side breaks a
     * test rather than a screen.
     *
     * @var array<string, string>
     */
    private const DESIGN_ROLES = [
        'super' => 'super-admin',
        'owner' => 'owner',
        'manager' => 'branch-manager',
        'accountant' => 'accountant',
        'waiter' => 'waiter',
        'cashier' => 'cashier',
        'kitchen' => 'chef',
        'warehouse' => 'storekeeper',
    ];

    public function test_every_role_the_design_names_exists_on_the_server(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        foreach (self::DESIGN_ROLES as $design => $platform) {
            $this->assertNotNull(
                Role::query()->where('name', $platform)->first(),
                "The design's `{$design}` maps to `{$platform}`, which is not seeded",
            );
        }
    }

    public function test_each_role_holds_what_the_design_grants_it(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $expected = [
            // The owner runs the business and every module in it.
            'owner' => ['menu.manage', 'orders.manage', 'finance.manage', 'staff.manage',
                'roles.manage', 'branches.manage', 'audit.view', 'pos.approve'],

            // One branch, every station on it. The floor's authority.
            'branch-manager' => ['orders.create', 'orders.update', 'tables.update', 'kitchen.view',
                'menu.update', 'inventory.view', 'staff.view', 'crm.view', 'pos.approve'],

            // Money and the paperwork behind it.
            'accountant' => ['finance.view', 'finance.manage', 'reports.export', 'audit.view',
                'suppliers.view', 'analytics.view'],

            // Open a table, add dishes, send. Nothing else.
            'waiter' => ['orders.create', 'orders.update', 'tables.update', 'menu.view',
                'kitchen.view', 'pos.sell'],

            // Take payment and move the cash.
            'cashier' => ['finance.view', 'finance.create', 'orders.update', 'pos.sell', 'pos.drawer'],

            // The board, and the stop list that lives in Menu.
            'chef' => ['kitchen.manage', 'menu.update', 'menu.manage', 'inventory.view', 'orders.view'],

            // Stock, and the suppliers who fill it.
            'storekeeper' => ['inventory.manage', 'inventory.create', 'suppliers.view',
                'suppliers.create', 'menu.view'],
        ];

        foreach ($expected as $role => $permissions) {
            $subject = Role::query()->where('name', $role)->firstOrFail();

            foreach ($permissions as $permission) {
                $this->assertTrue(
                    $subject->hasPermissionTo($permission),
                    "`{$role}` should hold `{$permission}` and does not",
                );
            }
        }
    }

    public function test_no_role_holds_what_the_design_withholds(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $forbidden = [
            // The owner runs a restaurant, not the platform. Creating tenants
            // and setting their plan is the operator's, and it is the one power
            // that must not follow from being an admin of your own business.
            'owner' => ['tenants.manage'],

            // A manager is not an owner. They cannot change who holds which
            // role, and they cannot open or close a branch.
            'branch-manager' => ['roles.manage', 'branches.manage', 'tenants.manage', 'audit.view'],

            // "Finance, reports, tax. Never touches orders" — the design says
            // it outright, and the accountant holds no order permission at all.
            'accountant' => ['orders.view', 'orders.create', 'orders.update', 'menu.update',
                'pos.sell', 'roles.manage'],

            // A waiter's ceiling is the whole point of the approval modal: they
            // ask for a void or a discount, a manager grants it. And the drawer
            // is the cashier's — a waiter never opens it.
            'waiter' => ['pos.void', 'pos.discount', 'pos.refund', 'pos.approve', 'pos.drawer',
                'menu.update', 'finance.view', 'staff.view'],

            // The cashier moves cash and asks for a void; only a manager grants
            // one. `pos.approve` in this list is what makes the approval modal
            // meaningful rather than decorative.
            'cashier' => ['pos.approve', 'pos.void', 'pos.discount', 'pos.refund',
                'menu.update', 'finance.manage', 'roles.manage'],

            // The chef owns the kitchen and the menu. Not the till, not the bill.
            'chef' => ['finance.view', 'orders.create', 'orders.update', 'pos.sell', 'pos.drawer'],

            // Stock in, stock out. Never a bill.
            'storekeeper' => ['orders.create', 'orders.update', 'finance.view', 'pos.sell',
                'staff.view'],
        ];

        foreach ($forbidden as $role => $permissions) {
            $subject = Role::query()->where('name', $role)->firstOrFail();

            foreach ($permissions as $permission) {
                $this->assertFalse(
                    $subject->hasPermissionTo($permission),
                    "`{$role}` holds `{$permission}` and the design withholds it",
                );
            }
        }
    }

    public function test_only_the_platform_operator_may_manage_tenants(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $holders = Role::query()
            ->whereHas('permissions', fn ($query) => $query->where('name', 'tenants.manage'))
            ->pluck('name')
            ->all();

        $this->assertSame(['super-admin'], $holders);
    }

    public function test_only_the_owner_and_the_operator_may_change_roles(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        // The permission that can grant every other one. If a third role holds
        // it, every assertion above it is advisory.
        $holders = Role::query()
            ->whereHas('permissions', fn ($query) => $query->where('name', 'roles.manage'))
            ->pluck('name')
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['owner', 'super-admin'], $holders);
    }

    public function test_approving_someone_elses_request_is_a_managers_power(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $holders = Role::query()
            ->whereHas('permissions', fn ($query) => $query->where('name', 'pos.approve'))
            ->pluck('name')
            ->sort()
            ->values()
            ->all();

        // Whoever else gains it later, the two roles that ask for approval must
        // never be able to grant it to themselves.
        $this->assertNotContains('waiter', $holders);
        $this->assertNotContains('cashier', $holders);
        $this->assertContains('branch-manager', $holders);
        $this->assertContains('owner', $holders);
    }

    public function test_every_design_role_has_someone_to_sign_in_as(): void
    {
        $this->seed(DatabaseSeeder::class);

        foreach (self::DESIGN_ROLES as $design => $platform) {
            $this->assertGreaterThan(
                0,
                Role::query()->where('name', $platform)->firstOrFail()->users()->count(),
                "The design's `{$design}` has no demo account to sign in as",
            );
        }
    }
}

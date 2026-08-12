<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * Who is allowed to do what at the till.
 *
 * The five CRUD verbs are not enough here. "Can this person open a bill" and
 * "can this person wipe a line off it" are the same `update` in a generic model,
 * and they are the two ends of the only fraud that matters in a restaurant: a
 * guest pays cash, the line is voided, the money walks. So voiding, discounting,
 * reopening, refunding and opening the drawer each get their own permission, and
 * the person who *asks* is never the person who *approves*.
 *
 * These assertions are the readable form of that policy. Change the seeder and
 * this test tells you exactly which role you just handed a new power to.
 */
final class PosPermissionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every permission the till defines.
     *
     * @var array<int, string>
     */
    private const ALL_POS_PERMISSIONS = [
        'pos.view', 'pos.create', 'pos.update', 'pos.delete', 'pos.manage',
        'pos.sell', 'pos.void', 'pos.discount', 'pos.reopen', 'pos.refund',
        'pos.drawer', 'pos.approve', 'pos.terminal',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function withRole(string $role): User
    {
        $user = User::factory()->create();
        $user->assignRole($role);

        return $user->fresh();
    }

    /**
     * @param array<int, string> $expected
     */
    private function assertPosPermissions(string $role, array $expected): void
    {
        $user = $this->withRole($role);

        foreach (self::ALL_POS_PERMISSIONS as $permission) {
            $shouldHave = in_array($permission, $expected, true);

            $this->assertSame(
                $shouldHave,
                $user->can($permission),
                $shouldHave
                    ? "Role [{$role}] should hold [{$permission}] and does not."
                    : "Role [{$role}] must NOT hold [{$permission}] and does.",
            );
        }
    }

    // ============ The permissions exist at all ============

    public function test_every_pos_permission_is_seeded(): void
    {
        foreach (self::ALL_POS_PERMISSIONS as $permission) {
            $this->assertTrue(
                Permission::query()->where('name', $permission)->where('guard_name', 'web')->exists(),
                "Permission [{$permission}] was never seeded.",
            );
        }
    }

    // ============ The eight till roles ============

    public function test_owner_holds_every_pos_permission(): void
    {
        $this->assertPosPermissions('owner', self::ALL_POS_PERMISSIONS);
    }

    public function test_branch_manager_can_approve_void_and_discount(): void
    {
        // A manager is the authority on the floor: they hold every till power
        // except deleting POS records outright, which is an owner's call.
        $this->assertPosPermissions('branch-manager', [
            'pos.view', 'pos.create', 'pos.update', 'pos.manage',
            'pos.sell', 'pos.void', 'pos.discount', 'pos.reopen', 'pos.refund',
            'pos.drawer', 'pos.approve', 'pos.terminal',
        ]);
    }

    public function test_cashier_may_sell_and_move_cash_but_never_approve(): void
    {
        // The cashier can ask for a void; they can never grant one. That single
        // line is the whole point of the approvals table.
        $this->assertPosPermissions('cashier', [
            'pos.view', 'pos.create', 'pos.update', 'pos.sell', 'pos.drawer',
        ]);
    }

    public function test_waiter_may_sell_but_not_open_the_drawer(): void
    {
        $this->assertPosPermissions('waiter', [
            'pos.view', 'pos.create', 'pos.update', 'pos.sell',
        ]);
    }

    public function test_chef_only_reads_the_till(): void
    {
        // The chef's till power is the stop-list, and that lives in Menu —
        // `menu.update`, which they already hold.
        $this->assertPosPermissions('chef', ['pos.view']);
    }

    public function test_storekeeper_only_reads_the_till(): void
    {
        $this->assertPosPermissions('storekeeper', ['pos.view']);
    }

    public function test_accountant_reads_and_manages_reports_but_cannot_sell(): void
    {
        $this->assertPosPermissions('accountant', ['pos.view', 'pos.manage']);
    }

    public function test_courier_only_reads_the_till(): void
    {
        $this->assertPosPermissions('courier', ['pos.view']);
    }

    // ============ Roles that also stand at a terminal ============

    public function test_bartender_and_host_can_work_a_terminal(): void
    {
        // Not in the eight, but physically at a till all evening: a bar tab and
        // a host seating a table are both till operations.
        $this->assertPosPermissions('bartender', [
            'pos.view', 'pos.create', 'pos.update', 'pos.sell',
        ]);

        $this->assertPosPermissions('host', ['pos.view']);
    }

    // ============ Nobody else ============

    public function test_a_guest_has_no_till_permission_at_all(): void
    {
        $this->assertPosPermissions('guest', []);
    }

    public function test_a_marketer_has_no_till_permission_at_all(): void
    {
        $this->assertPosPermissions('marketer', []);
    }

    public function test_super_admin_holds_every_pos_permission(): void
    {
        $this->assertPosPermissions('super-admin', self::ALL_POS_PERMISSIONS);
    }
}

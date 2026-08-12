<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Modules\ModuleRegistry;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * What a fresh install actually produces.
 *
 * `migrate --seed` used to leave a fully stocked restaurant that nobody could
 * sign into: 34 dishes, 25 bills, 24 tables, and zero users. These assertions
 * exist so the first five minutes of a new developer's day — or a new venue's
 * — keep working.
 */
final class InstallationTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeding_produces_an_account_that_can_actually_sign_in(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@demo.uz',
            'password' => 'password',
            'device_name' => 'test',
        ])
            ->assertOk()
            ->assertJsonPath('user.email', 'owner@demo.uz')
            ->assertJsonPath('user.roles.0', 'owner')
            ->assertJsonStructure(['token']);
    }

    public function test_every_seeded_row_belongs_to_the_demo_restaurant(): void
    {
        $this->seed(DatabaseSeeder::class);

        $tenant = Tenant::query()->firstOrFail();
        $orphans = [];

        // Seeding runs in a console command with no request behind it. If the
        // tenant context is not established first, BelongsToTenant stamps
        // nothing and the entire demo restaurant becomes invisible to every
        // account in it — the global scope filters all of it away.
        foreach ([
            'menu_categories', 'menu_items', 'orders', 'order_items', 'restaurant_tables',
            'halls', 'ingredients', 'suppliers', 'staff_members', 'customers', 'kitchen_stations',
        ] as $table) {
            $count = DB::table($table)->where(function ($query) use ($tenant): void {
                $query->whereNull('tenant_id')->orWhere('tenant_id', '!=', $tenant->id);
            })->count();

            if ($count > 0) {
                $orphans[] = "{$table}: {$count}";
            }
        }

        $this->assertSame([], $orphans, 'Seeded rows with no restaurant: '.implode(', ', $orphans));
    }

    public function test_seeding_does_not_fill_the_audit_trail_with_its_own_noise(): void
    {
        $this->seed(DatabaseSeeder::class);

        // An owner's first look at the audit log should not be 200 lines of
        // "the system created a dish".
        $this->assertSame(0, DB::table('activity_log')->count());
    }

    public function test_seeding_produces_one_account_per_role_so_rbac_is_visible(): void
    {
        $this->seed(DatabaseSeeder::class);

        foreach (['owner', 'branch-manager', 'chef', 'cook', 'waiter', 'cashier', 'host', 'storekeeper', 'accountant', 'marketer'] as $role) {
            $this->assertTrue(
                User::query()->whereNotNull('tenant_id')->get()->contains(
                    fn (User $user): bool => $user->hasRole($role),
                ),
                "No seeded account holds the {$role} role.",
            );
        }
    }

    public function test_the_platform_operator_belongs_to_no_restaurant(): void
    {
        $this->seed(DatabaseSeeder::class);

        $admin = User::query()->where('email', 'admin@campus.uz')->firstOrFail();

        // They support every tenant, so pinning them to one would lock them out
        // of the rest.
        $this->assertNull($admin->tenant_id);
        $this->assertTrue($admin->hasRole('super-admin'));
    }

    public function test_seeding_twice_does_not_duplicate_accounts(): void
    {
        $this->seed(DatabaseSeeder::class);
        $first = User::query()->count();

        $this->seed(DatabaseSeeder::class);

        $this->assertSame($first, User::query()->count(), 'Re-seeding must be idempotent.');
    }

    public function test_a_seeded_account_only_sees_its_own_restaurant(): void
    {
        $this->seed(DatabaseSeeder::class);
        $tenant = Tenant::query()->firstOrFail();

        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'waiter@demo.uz', 'password' => 'password', 'device_name' => 'pos',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/context')
            ->assertOk()
            ->assertJsonPath('tenant.slug', $tenant->slug);
    }

    public function test_a_seeded_waiter_cannot_reach_the_till(): void
    {
        $this->seed(DatabaseSeeder::class);

        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'waiter@demo.uz', 'password' => 'password', 'device_name' => 'pos',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/finance/payments')
            ->assertStatus(403);
    }

    public function test_the_demo_data_is_a_working_restaurant(): void
    {
        $this->seed(DatabaseSeeder::class);

        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@demo.uz', 'password' => 'password', 'device_name' => 'admin',
        ])->json('token');

        $modules = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/modules')
            ->assertOk();

        // Every module switched on, and the owner reaching all of them: this is
        // what a new developer sees on their first run. Counted from the
        // registry so a twelfth module does not break an unrelated assertion.
        $shipped = app(ModuleRegistry::class)->all()->count();

        $this->assertSame($shipped, $modules->json('meta.available'));
        $this->assertSame($shipped, $modules->json('meta.accessible'));

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(25, 'data');   // first page of the seeded assortment
    }

    public function test_the_guest_menu_works_straight_after_install(): void
    {
        $this->seed(DatabaseSeeder::class);
        $tenant = Tenant::query()->firstOrFail();

        // The QR code on the table, with no account involved at all.
        $this->withHeaders(['X-Tenant' => $tenant->slug])
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonPath('restaurant.slug', $tenant->slug)
            ->assertJsonStructure(['data' => [['title', 'items']]]);
    }

    public function test_an_operator_can_put_a_real_restaurant_on_the_platform(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $exit = Artisan::call('restaurant:create-owner', [
            '--restaurant' => 'Osh Markazi',
            '--name' => 'Rustam Egamberdiyev',
            '--email' => 'rustam@osh.uz',
            '--phone' => '+998901234567',
            '--password' => 'super-secret-123',
        ]);

        $this->assertSame(0, $exit);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'rustam@osh.uz', 'password' => 'super-secret-123', 'device_name' => 'admin',
        ])
            ->assertOk()
            ->assertJsonPath('user.tenant.slug', 'osh-markazi')
            ->assertJsonPath('user.roles.0', 'owner');
    }

    public function test_creating_a_restaurant_refuses_incomplete_input(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $exit = Artisan::call('restaurant:create-owner', ['--restaurant' => 'Osh Markazi']);

        $this->assertNotSame(0, $exit);
        $this->assertSame(0, User::query()->count(), 'A rejected command must create nothing.');
    }
}

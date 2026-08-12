<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Modules\ModuleRegistry;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The twelfth module announcing itself.
 *
 * Eight places have to agree on the key `pos` — the module folder, the statuses
 * file, the permission seeder, the TypeScript union, the commit scopes, the
 * admin console, the search path and the schema list. Guess a different one and
 * something 404s in a client nobody is looking at. This test pins the two that
 * the API owns, and the architecture suite pins the rest.
 */
final class PosModuleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => 'osh-markazi',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function signIn(string $role = 'cashier'): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        app(TenantContext::class)->set($this->tenant);

        return $user;
    }

    // ============ Discovery ============

    public function test_the_module_endpoint_is_not_public(): void
    {
        $this->getJson('/api/v1/pos')->assertStatus(401);
    }

    public function test_the_module_describes_itself_and_its_venue_modes(): void
    {
        $this->signIn();

        $this->getJson('/api/v1/pos')
            ->assertOk()
            ->assertJsonPath('module', 'Pos')
            ->assertJsonPath('alias', 'pos')
            ->assertJsonPath('labels.uz', 'Kassa (POS)')
            ->assertJsonPath('labels.ru', 'Касса (POS)')
            ->assertJsonPath('labels.en', 'POS')
            // Restoran, fast food, bar va kafe — bitta kod bazasi, to'rt oqim.
            ->assertJsonStructure([
                'modes' => ['table_service', 'quick_service', 'bar', 'counter'],
                'policy' => ['pin_length', 'pin_max_attempts', 'pin_lock_minutes'],
            ]);
    }

    // ============ Registry ============

    public function test_the_registry_lists_pos_with_labels_in_three_languages(): void
    {
        $module = collect(app(ModuleRegistry::class)->all())
            ->first(static fn (object $m): bool => $m->key === 'pos');

        $this->assertNotNull($module, 'Pos is missing from the module registry.');
        $this->assertSame('Kassa (POS)', $module->labels['uz']);
        $this->assertSame('Касса (POS)', $module->labels['ru']);
        $this->assertSame('POS', $module->labels['en']);
        $this->assertNotSame('square', $module->icon, 'Pos declares no icon.');
    }

    // ============ Schema ============

    public function test_the_pos_schema_exists_and_is_on_the_search_path(): void
    {
        $exists = DB::selectOne("select 1 as ok from pg_namespace where nspname = 'pos'");
        $this->assertNotNull($exists, "The 'pos' schema was not created.");

        /** @var string $searchPath */
        $searchPath = DB::connection()->getConfig('search_path');
        $this->assertStringContainsString('pos', $searchPath);
    }
}

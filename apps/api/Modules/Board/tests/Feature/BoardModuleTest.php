<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Board module.
 *
 * The platform's minimum for every module: it is reachable, it is behind
 * authentication, and it never leaks across restaurants. Add the module's
 * own domain invariants below as it grows — the arithmetic a restaurant
 * would actually notice being wrong.
 */
final class BoardModuleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_the_module_is_not_reachable_without_signing_in(): void
    {
        $this->getJson('/api/v1/board/')->assertStatus(401);
    }

    public function test_the_module_answers_for_a_signed_in_user(): void
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->getJson('/api/v1/board/')
            ->assertOk()
            ->assertJsonPath('module', 'Board')
            ->assertJsonPath('alias', 'board');
    }

    public function test_the_module_appears_in_the_capability_manifest(): void
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        /** @var array<int, array<string, mixed>> $manifest */
        $manifest = $this->getJson('/api/v1/modules')->assertOk()->json('data');

        $modules = collect($manifest)->keyBy('key');

        $this->assertTrue($modules->has('board'), 'The module is missing from GET /api/v1/modules.');
        $this->assertTrue($modules['board']['available']);
    }

    public function test_switching_the_module_off_closes_its_routes(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->patchJson('/api/v1/modules/board', ['enabled' => false])->assertOk();

        $this->getJson('/api/v1/board/')->assertApiError('module.disabled');
    }
}

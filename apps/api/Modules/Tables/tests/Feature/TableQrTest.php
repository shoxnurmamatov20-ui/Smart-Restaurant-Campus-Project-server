<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * The token on the sticker.
 *
 * It stops being decoration the moment something looks a table up *by* it — a
 * guest's camera, with no session and no way to be asked for one. So the
 * properties that matter are: every table has one, no two tables share one,
 * nothing re-issues one, and a token from one restaurant resolves to nothing
 * inside another.
 */
final class TableQrTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug),
            'slug' => $slug,
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function tableIn(Tenant $tenant, string $label = 'A-7'): RestaurantTable
    {
        app(TenantContext::class)->set($tenant);

        $hall = Hall::factory()->create(['tenant_id' => $tenant->id]);

        return RestaurantTable::factory()->create([
            'tenant_id' => $tenant->id,
            'hall_id' => $hall->id,
            'label' => $label,
        ]);
    }

    public function test_every_table_leaves_with_a_token_nobody_asked_for(): void
    {
        $table = $this->tableIn($this->restaurant('osh-markazi'));

        $this->assertNotNull($table->qr_token);
        $this->assertSame(22, strlen((string) $table->qr_token));
        // base62 and nothing else: the token is the tail of a URL printed on a
        // sticker, so a character needing escaping would be a character in a QR.
        $this->assertMatchesRegularExpression('/^[0-9A-Za-z]{22}$/', (string) $table->qr_token);
    }

    public function test_a_token_supplied_on_purpose_survives(): void
    {
        // Restoring a venue from a backup has to keep the codes already stuck to
        // its furniture — the `??=` in the model's creating hook.
        $tenant = $this->restaurant('osh-markazi');
        app(TenantContext::class)->set($tenant);
        $hall = Hall::factory()->create(['tenant_id' => $tenant->id]);

        $table = new RestaurantTable([
            'hall_id' => $hall->id,
            'label' => 'B-2',
            'seats' => 4,
        ]);
        $table->tenant_id = $tenant->id;
        $table->qr_token = 'aRestoredStickerToken1';
        $table->save();

        $this->assertSame('aRestoredStickerToken1', $table->refresh()->qr_token);
    }

    public function test_no_two_tables_share_a_token(): void
    {
        $tenant = $this->restaurant('osh-markazi');
        app(TenantContext::class)->set($tenant);
        $hall = Hall::factory()->create(['tenant_id' => $tenant->id]);

        $tokens = [];

        for ($i = 1; $i <= 24; $i++) {
            $tokens[] = RestaurantTable::factory()->create([
                'tenant_id' => $tenant->id,
                'hall_id' => $hall->id,
                'label' => 'T-'.$i,
            ])->qr_token;
        }

        $this->assertCount(24, array_unique($tokens));
    }

    public function test_a_token_never_finds_another_restaurants_table(): void
    {
        $mine = $this->restaurant('osh-markazi');
        $theirs = $this->restaurant('city-cafe');

        $ours = $this->tableIn($mine, 'A-7');
        $foreign = $this->tableIn($theirs, 'C-1');

        // Reading as the second restaurant: their own token resolves, ours does
        // not — even though the unique index that keeps tokens apart spans the
        // whole platform. The global scope is what refuses, not the index.
        app(TenantContext::class)->set($theirs);
        $this->assertNotNull(RestaurantTable::findByQrToken((string) $foreign->qr_token));
        $this->assertNull(RestaurantTable::findByQrToken((string) $ours->qr_token));

        app(TenantContext::class)->set($mine);
        $this->assertNotNull(RestaurantTable::findByQrToken((string) $ours->qr_token));
        $this->assertNull(RestaurantTable::findByQrToken((string) $foreign->qr_token));
    }

    public function test_a_peeling_sticker_is_no_such_table_rather_than_an_error(): void
    {
        $this->tableIn($this->restaurant('osh-markazi'));

        $this->assertNull(RestaurantTable::findByQrToken(''));
        $this->assertNull(RestaurantTable::findByQrToken('   '));
        $this->assertNull(RestaurantTable::findByQrToken('notAnyTablesToken12345'));
    }

    // ============ GET /v1/tables/tables/{table}/qr ============

    private function actingAsRole(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    public function test_a_host_can_print_the_square_for_a_table(): void
    {
        $tenant = $this->restaurant('osh-markazi');
        $table = $this->tableIn($tenant);
        $this->actingAsRole($tenant, 'host');

        $response = $this->getJson("/api/v1/tables/tables/{$table->id}/qr")->assertOk();

        $response->assertJsonPath('data.label', 'A-7');
        $response->assertJsonPath('data.qr_token', $table->qr_token);

        $url = (string) $response->json('data.qr_url');
        // The guest surface's own route, segment for segment: one sticker has to
        // land somewhere in the browser build and in the phone app both.
        $this->assertStringEndsWith("/qr/osh-markazi/{$table->qr_token}", $url);

        $svg = (string) $response->json('data.svg');
        $this->assertStringStartsWith('<?xml', $svg);
        $this->assertStringContainsString('<svg', $svg);
    }

    public function test_a_cook_has_no_business_with_the_floor_plan(): void
    {
        $tenant = $this->restaurant('osh-markazi');
        $table = $this->tableIn($tenant);
        $this->actingAsRole($tenant, 'cook');

        $this->getJson("/api/v1/tables/tables/{$table->id}/qr")->assertStatus(403);
    }

    public function test_signing_in_is_required(): void
    {
        $table = $this->tableIn($this->restaurant('osh-markazi'));

        $this->getJson("/api/v1/tables/tables/{$table->id}/qr")->assertStatus(401);
    }

    public function test_a_manager_cannot_print_another_restaurants_sticker(): void
    {
        $mine = $this->restaurant('osh-markazi');
        $theirs = $this->restaurant('city-cafe');
        $foreign = $this->tableIn($theirs, 'C-1');

        $this->actingAsRole($mine, 'owner');

        // 404 rather than 403: the table does not exist as far as this
        // restaurant is concerned, and a 403 would confirm that the id names
        // something.
        $this->getJson("/api/v1/tables/tables/{$foreign->id}/qr")->assertStatus(404);
    }
}

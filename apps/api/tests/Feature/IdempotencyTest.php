<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Middleware\EnsureIdempotency;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Idempotency\IdempotencyStore;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The rule this proves is the one a restaurant notices: a waiter on a slow
 * tablet taps Send twice and the kitchen gets one ticket.
 */
final class IdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($tenant);

        $this->user = User::factory()->create(['tenant_id' => $tenant->id]);
        $this->user->givePermissionTo('branches.manage');
    }

    #[Test]
    public function a_write_without_a_key_is_refused(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $this->branch(), [EnsureIdempotency::HEADER => ''])
            ->assertApiError('request.idempotency_key_missing');
    }

    #[Test]
    public function a_read_needs_no_key(): void
    {
        $this->actingAs($this->user)
            ->getJson('/api/v1/branches', [EnsureIdempotency::HEADER => ''])
            ->assertOk();
    }

    #[Test]
    public function the_same_key_twice_creates_one_record_and_replays_the_answer(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->branch();

        $first = $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $payload, [EnsureIdempotency::HEADER => $key])
            ->assertCreated();

        $second = $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $payload, [EnsureIdempotency::HEADER => $key])
            ->assertCreated();

        // Byte for byte, so the till reconciles to the same branch rather than
        // discovering a twin an hour later.
        $this->assertSame($first->json(), $second->json());
        $second->assertHeader('Idempotent-Replay', 'true');

        $this->assertSame(1, DB::table('branches')->where('slug', $payload['slug'])->count());
    }

    #[Test]
    public function the_same_key_with_a_different_body_is_a_conflict(): void
    {
        $key = (string) Str::uuid();

        $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $this->branch(), [EnsureIdempotency::HEADER => $key])
            ->assertCreated();

        // A client bug. Replaying the first response would hide it and answer
        // for something the caller did not ask for.
        $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $this->branch(), [EnsureIdempotency::HEADER => $key])
            ->assertApiError('request.idempotency_key_reused');
    }

    #[Test]
    public function another_restaurants_key_is_never_replayed_to_you(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->branch();

        // Osh Markazi claims the key and gets its branch created.
        $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $payload, [EnsureIdempotency::HEADER => $key])
            ->assertCreated();

        // A different restaurant presents the SAME key with the SAME body —
        // small fixed payloads make identical bodies likely, so the hash
        // alone cannot tell the tenants apart. Handing back the stored
        // response would hand them Osh Markazi's data.
        $rival = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $rivalUser = User::factory()->create(['tenant_id' => $rival->id]);
        $rivalUser->givePermissionTo('branches.manage');

        $this->actingAs($rivalUser)
            ->withHeaders(['X-Tenant' => $rival->slug])
            ->postJson('/api/v1/branches', $payload, [EnsureIdempotency::HEADER => $key])
            ->assertApiError('request.idempotency_key_reused');
    }

    #[Test]
    public function a_rejected_write_does_not_burn_its_key(): void
    {
        $key = (string) Str::uuid();

        $this->actingAs($this->user)
            ->postJson('/api/v1/branches', ['name' => ''], [EnsureIdempotency::HEADER => $key])
            ->assertApiError('request.validation_failed');

        // The same key must work once the payload is fixed — otherwise one
        // typo poisons that operation for forty-eight hours.
        $this->actingAs($this->user)
            ->postJson('/api/v1/branches', $this->branch(), [EnsureIdempotency::HEADER => $key])
            ->assertCreated();
    }

    #[Test]
    public function keys_past_the_replay_window_are_pruned(): void
    {
        DB::table(IdempotencyStore::TABLE)->insert([
            'key' => 'stale-key',
            'endpoint' => 'api/v1/branches',
            'method' => 'POST',
            'request_hash' => str_repeat('a', 64),
            'status_code' => 201,
            'response_body' => '{}',
            'created_at' => now()->subHours(IdempotencyStore::RETENTION_HOURS + 1),
        ]);

        $this->artisan('idempotency:prune')->assertSuccessful();

        $this->assertDatabaseMissing(IdempotencyStore::TABLE, ['key' => 'stale-key']);
    }

    /** @return array<string, string> */
    private function branch(): array
    {
        $suffix = Str::lower(Str::random(6));

        return [
            'name' => 'Chilonzor',
            'slug' => 'chilonzor-'.$suffix,
            'code' => 'CHI'.Str::upper(Str::random(3)),
            'city' => 'Toshkent',
        ];
    }
}

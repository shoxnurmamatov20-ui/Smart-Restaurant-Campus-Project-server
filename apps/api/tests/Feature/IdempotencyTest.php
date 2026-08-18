<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Middleware\EnsureIdempotency;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Idempotency\IdempotencyStore;
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

        $tenant = Tenant::factory()->create();
        $this->user = User::factory()->for($tenant)->create();
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

        $this->assertSame(1, DB::table('public.branches')->where('code', $payload['code'])->count());
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
        return [
            'name' => 'Chilonzor',
            'code' => 'CHI-'.Str::upper(Str::random(4)),
            'city' => 'Toshkent',
        ];
    }
}

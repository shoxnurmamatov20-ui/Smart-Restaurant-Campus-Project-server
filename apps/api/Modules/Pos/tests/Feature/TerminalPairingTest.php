<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\TerminalPairing;
use Tests\TestCase;

/**
 * The one door into the platform that opens without a token.
 *
 * A tablet on the counter has no credentials until somebody types a code into
 * it, so this is the single unauthenticated write in the module — and therefore
 * the one place worth being unpleasant about. The code has to die on first use,
 * die on time, refuse to say whether a wrong code belongs to somebody else, and
 * kill the previous device's token when a till is re-paired.
 */
final class TerminalPairingTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $mine;

    private Tenant $theirs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->mine = $this->makeTenant('Osh Markazi', 'osh-markazi');
        $this->theirs = $this->makeTenant('City Cafe', 'city-cafe');

        app(TenantContext::class)->set($this->mine);
    }

    private function makeTenant(string $name, string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => $name, 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function signIn(string $role = 'branch-manager', ?Tenant $tenant = null): User
    {
        $tenant ??= $this->mine;

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        app(TenantContext::class)->set($tenant);

        return $user;
    }

    /** Build a terminal that belongs to the other restaurant. */
    private function theirTerminal(): Terminal
    {
        $context = app(TenantContext::class);
        $previous = $context->tenant();

        $context->set($this->theirs);
        $terminal = Terminal::factory()->create(['code' => 'KASSA-THEIRS']);
        $context->set($previous);

        return $terminal;
    }

    // ============ Issuing ============

    public function test_creating_a_terminal_returns_a_pairing_code_exactly_once(): void
    {
        $this->signIn();

        $response = $this->postJson('/api/v1/pos/terminals', [
            'code' => 'KASSA-1',
            'name' => 'Asosiy kassa',
            'mode' => 'table_service',
        ])->assertCreated();

        $code = $response->json('pairing.code');
        $this->assertIsString($code);
        $this->assertSame(8, mb_strlen($code));

        // Fetching the terminal again must never surface the code or its hash.
        $terminal = Terminal::query()->where('code', 'KASSA-1')->firstOrFail();

        $this->getJson("/api/v1/pos/terminals/{$terminal->id}")
            ->assertOk()
            ->assertJsonMissingPath('pairing')
            ->assertJsonMissingPath('data.pairing_code_hash');
    }

    public function test_the_pairing_code_avoids_characters_that_are_read_wrong(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->create();

        // Ten draws is enough to catch an alphabet that still contains them.
        for ($i = 0; $i < 10; $i++) {
            $code = app(TerminalPairing::class)->issueCode($terminal);

            $this->assertDoesNotMatchRegularExpression('/[IO01]/', $code, "Code [{$code}] contains a lookalike character.");
        }
    }

    public function test_issuing_a_new_code_invalidates_the_previous_one(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->create();

        $first = app(TerminalPairing::class)->issueCode($terminal);
        app(TerminalPairing::class)->issueCode($terminal);

        $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => $first,
            'device_fingerprint' => str_repeat('a', 32),
        ])->assertStatus(422);
    }

    public function test_only_pos_terminal_may_issue_a_code(): void
    {
        $this->signIn('cashier');
        $terminal = Terminal::factory()->create();

        $this->postJson("/api/v1/pos/terminals/{$terminal->id}/pairing-code")->assertStatus(403);
    }

    // ============ Redeeming ============

    public function test_a_pairing_code_exchanges_for_a_device_token(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->create(['code' => 'KASSA-7']);
        $code = app(TerminalPairing::class)->issueCode($terminal);

        $response = $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => $code,
            'device_fingerprint' => str_repeat('f', 32),
            'app_version' => '1.2.3',
        ])->assertCreated();

        $this->assertIsString($response->json('token'));
        $this->assertSame('KASSA-7', $response->json('terminal.code'));
        // The till needs the slug: a device token is not a user, so the tenant
        // cannot be inferred from it on later requests.
        $this->assertSame('osh-markazi', $response->json('tenant.slug'));

        $terminal->refresh();
        $this->assertNotNull($terminal->paired_at);
        $this->assertSame('1.2.3', $terminal->app_version);
        $this->assertNull($terminal->pairing_code_hash);
        $this->assertSame(1, $terminal->tokens()->count());
    }

    public function test_a_pairing_code_works_only_once(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->create();
        $code = app(TerminalPairing::class)->issueCode($terminal);

        $payload = ['code' => $code, 'device_fingerprint' => str_repeat('b', 32)];

        $this->postJson('/api/v1/pos/terminals/pair', $payload)->assertCreated();
        $this->postJson('/api/v1/pos/terminals/pair', $payload)->assertStatus(422);
    }

    public function test_an_expired_pairing_code_is_refused(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->create();
        $code = app(TerminalPairing::class)->issueCode($terminal);

        $this->travel((int) config('pos.pairing.ttl_minutes') + 1)->minutes();

        $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => $code,
            'device_fingerprint' => str_repeat('c', 32),
        ])->assertStatus(422);
    }

    public function test_a_disabled_terminal_cannot_be_paired(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->disabled()->create();
        $code = app(TerminalPairing::class)->issueCode($terminal);

        $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => $code,
            'device_fingerprint' => str_repeat('d', 32),
        ])->assertStatus(422);
    }

    public function test_an_unknown_code_is_refused_with_the_same_message_as_a_used_one(): void
    {
        // Two different failures must not be distinguishable, or the endpoint
        // becomes a way to find out which codes exist.
        $unknown = $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => 'ZZZZZZZZ',
            'device_fingerprint' => str_repeat('e', 32),
        ])->assertStatus(422);

        $this->signIn();
        $terminal = Terminal::factory()->create();
        $code = app(TerminalPairing::class)->issueCode($terminal);
        $payload = ['code' => $code, 'device_fingerprint' => str_repeat('e', 32)];
        $this->postJson('/api/v1/pos/terminals/pair', $payload)->assertCreated();

        $used = $this->postJson('/api/v1/pos/terminals/pair', $payload)->assertStatus(422);

        $this->assertSame(
            $unknown->json('errors.code'),
            $used->json('errors.code'),
            'An unknown code and a spent code must be indistinguishable.',
        );
    }

    public function test_re_pairing_a_terminal_revokes_the_previous_device(): void
    {
        // Deliberately not signed in. `actingAs` installs a user on the default
        // guard, and Sanctum hands that user back before it ever looks at the
        // bearer token — which would make a terminal-token assertion pass for
        // the wrong reason.
        $terminal = Terminal::factory()->create();

        $first = $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => app(TerminalPairing::class)->issueCode($terminal),
            'device_fingerprint' => str_repeat('1', 32),
        ])->assertCreated()->json('token');

        $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => app(TerminalPairing::class)->issueCode($terminal),
            'device_fingerprint' => str_repeat('2', 32),
        ])->assertCreated();

        // A till being re-paired is usually a till that was lost or reimaged.
        $this->assertSame(1, $terminal->fresh()?->tokens()->count());

        $this->withHeaders(['Authorization' => "Bearer {$first}", 'X-Tenant' => 'osh-markazi'])
            ->postJson('/api/v1/pos/terminals/heartbeat')
            ->assertStatus(401);
    }

    public function test_pairing_requires_a_device_fingerprint(): void
    {
        $this->signIn();
        $terminal = Terminal::factory()->create();

        $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => app(TerminalPairing::class)->issueCode($terminal),
        ])->assertStatus(422)->assertJsonValidationErrors('device_fingerprint');
    }

    // ============ Heartbeat ============

    public function test_a_paired_terminal_can_report_that_it_is_alive(): void
    {
        // Not signed in — the device token is the whole point of this test.
        $terminal = Terminal::factory()->create();

        $token = $this->postJson('/api/v1/pos/terminals/pair', [
            'code' => app(TerminalPairing::class)->issueCode($terminal),
            'device_fingerprint' => str_repeat('9', 32),
        ])->json('token');

        $this->travel(5)->minutes();

        $this->withHeaders(['Authorization' => "Bearer {$token}", 'X-Tenant' => 'osh-markazi'])
            ->postJson('/api/v1/pos/terminals/heartbeat', ['app_version' => '1.3.0'])
            ->assertOk()
            ->assertJsonPath('terminal.app_version', '1.3.0')
            ->assertJsonPath('terminal.is_online', true);
    }

    public function test_a_user_token_cannot_pose_as_a_terminal_on_heartbeat(): void
    {
        $this->signIn();

        $this->postJson('/api/v1/pos/terminals/heartbeat')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TERMINAL_TOKEN_REQUIRED');
    }

    // ============ Tenancy ============

    public function test_a_terminal_from_another_restaurant_is_not_visible(): void
    {
        $this->signIn();
        $theirs = $this->theirTerminal();

        $this->getJson("/api/v1/pos/terminals/{$theirs->id}")->assertStatus(404);
        $this->getJson('/api/v1/pos/terminals')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_two_restaurants_may_both_have_a_terminal_called_kassa_1(): void
    {
        $this->signIn();
        $this->postJson('/api/v1/pos/terminals', [
            'code' => 'KASSA-1', 'name' => 'Asosiy', 'mode' => 'counter',
        ])->assertCreated();

        $this->signIn('branch-manager', $this->theirs);
        $this->postJson('/api/v1/pos/terminals', [
            'code' => 'KASSA-1', 'name' => 'Main', 'mode' => 'bar',
        ])->assertCreated();
    }

    public function test_the_same_restaurant_cannot_reuse_a_terminal_code(): void
    {
        $this->signIn();

        $this->postJson('/api/v1/pos/terminals', [
            'code' => 'KASSA-1', 'name' => 'Asosiy', 'mode' => 'counter',
        ])->assertCreated();

        $this->postJson('/api/v1/pos/terminals', [
            'code' => 'KASSA-1', 'name' => 'Ikkinchi', 'mode' => 'counter',
        ])->assertStatus(422)->assertJsonValidationErrors('code');
    }
}

<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Pos\Models\PosPin;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * Four digits, and everything that stops four digits being a joke.
 *
 * A PIN is a weak secret chosen deliberately: a waiter switches user twenty
 * times an hour and will not type a password. What makes it acceptable is that
 * guessing is bounded and the blast radius is small — five wrong tries locks the
 * account, the token it mints only works at the till, and it dies when the
 * session does.
 */
final class PinLoginTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $mine;

    private Tenant $theirs;

    private Terminal $terminal;

    private string $deviceToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->mine = $this->makeTenant('Osh Markazi', 'osh-markazi');
        $this->theirs = $this->makeTenant('City Cafe', 'city-cafe');

        app(TenantContext::class)->set($this->mine);

        $this->terminal = Terminal::factory()->create(['code' => 'KASSA-1']);
        $this->deviceToken = $this->terminal
            ->createToken('pos-terminal-test', ['pos:terminal'])
            ->plainTextToken;
    }

    private function makeTenant(string $name, string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => $name, 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function staffMember(string $role = 'cashier', string $pin = '4821', ?Tenant $tenant = null): User
    {
        $tenant ??= $this->mine;

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole($role);

        app(PinAuthenticator::class)->setPin($user, $pin);

        return $user;
    }

    /**
     * Swap the bearer token for the next request.
     *
     * The guard flush is not optional. Sanctum's RequestGuard caches the user it
     * resolved, and a feature test reuses one container across every call it
     * makes — so without this, request two is silently still authenticated as
     * whoever request one was. In production each request gets its own
     * container and the question never arises.
     */
    private function withBearer(string $token): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => $this->mine->slug,
        ]);
    }

    /** A request as the device — no user signed in. */
    private function asDevice(): self
    {
        return $this->withBearer($this->deviceToken);
    }

    /** A request as somebody signed in at the till. */
    private function asSession(string $token): self
    {
        return $this->withBearer($token);
    }

    /**
     * Sign in as a user for a back-office call, clearing any bearer token left
     * over from a till request in the same test.
     */
    private function forgetGuardsAndActAs(User $user): self
    {
        $this->app['auth']->forgetGuards();
        $this->defaultHeaders = array_diff_key($this->defaultHeaders, ['Authorization' => null]);

        return $this->actingAs($user);
    }

    private function signInAtTill(User $user, string $pin = '4821'): string
    {
        return $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $user->id,
            'pin' => $pin,
        ])->assertCreated()->json('token');
    }

    // ============ The staff grid ============

    public function test_the_till_lists_only_staff_who_have_a_pin(): void
    {
        $withPin = $this->staffMember();
        User::factory()->create(['tenant_id' => $this->mine->id])->assignRole('waiter');

        $this->asDevice()->getJson('/api/v1/pos/auth/staff')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $withPin->id);
    }

    public function test_the_staff_grid_never_leaks_another_restaurants_roster(): void
    {
        $this->staffMember();

        $context = app(TenantContext::class);
        $context->set($this->theirs);
        $this->staffMember(tenant: $this->theirs);
        $context->set($this->mine);

        $this->asDevice()->getJson('/api/v1/pos/auth/staff')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_the_staff_grid_needs_a_device_token(): void
    {
        $this->getJson('/api/v1/pos/auth/staff')->assertStatus(401);
    }

    // ============ Signing in ============

    public function test_a_correct_pin_opens_a_session(): void
    {
        $user = $this->staffMember();

        $response = $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $user->id,
            'pin' => '4821',
        ])->assertCreated();

        $this->assertIsString($response->json('token'));
        $this->assertSame($user->id, $response->json('session.user_id'));
        $this->assertSame($this->terminal->id, $response->json('session.terminal_id'));
        $this->assertTrue($response->json('session.is_open'));

        // The till builds its navigation from this: a cashier sees the drawer,
        // a waiter does not.
        $this->assertContains('pos.drawer', $response->json('session.user.permissions'));
    }

    public function test_a_wrong_pin_is_counted(): void
    {
        $user = $this->staffMember();

        $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $user->id, 'pin' => '0000',
        ])->assertStatus(422)->assertJsonValidationErrors('pin');

        $this->assertSame(1, PosPin::query()->where('user_id', $user->id)->value('failed_attempts'));
    }

    public function test_five_wrong_pins_lock_the_account(): void
    {
        $user = $this->staffMember();

        for ($i = 0; $i < 5; $i++) {
            $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
                'user_id' => $user->id, 'pin' => '0000',
            ])->assertStatus(422);
        }

        // Even the right PIN is refused now — that is the entire defence.
        $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $user->id, 'pin' => '4821',
        ])->assertStatus(422);

        $this->assertNotNull(PosPin::query()->where('user_id', $user->id)->value('locked_until'));
    }

    public function test_the_lock_lifts_when_it_expires(): void
    {
        $user = $this->staffMember();
        PosPin::query()->where('user_id', $user->id)->update([
            'failed_attempts' => 5,
            'locked_until' => now()->addMinutes(15),
        ]);

        $this->travel(16)->minutes();

        $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $user->id, 'pin' => '4821',
        ])->assertCreated();
    }

    public function test_a_successful_login_clears_earlier_failures(): void
    {
        $user = $this->staffMember();

        $this->asDevice()->postJson('/api/v1/pos/auth/pin', ['user_id' => $user->id, 'pin' => '0000'])
            ->assertStatus(422);
        $this->signInAtTill($user);

        $this->assertSame(0, PosPin::query()->where('user_id', $user->id)->value('failed_attempts'));
    }

    public function test_the_pin_is_never_returned_anywhere(): void
    {
        $user = $this->staffMember();

        $body = $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $user->id, 'pin' => '4821',
        ])->assertCreated()->getContent();

        $this->assertStringNotContainsString('4821', (string) $body);
        $this->assertStringNotContainsString('pin_hash', (string) $body);

        $this->asDevice()->getJson('/api/v1/pos/auth/staff')
            ->assertOk()
            ->assertJsonMissing(['pin_hash' => true]);
    }

    public function test_somebody_elses_staff_member_cannot_sign_in_here(): void
    {
        $context = app(TenantContext::class);
        $context->set($this->theirs);
        $stranger = $this->staffMember(tenant: $this->theirs);
        $context->set($this->mine);

        $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $stranger->id, 'pin' => '4821',
        ])->assertStatus(422);
    }

    public function test_someone_without_till_rights_is_refused_even_with_the_right_pin(): void
    {
        // A marketer holds no pos.* permission at all.
        $marketer = $this->staffMember('marketer');

        $this->asDevice()->postJson('/api/v1/pos/auth/pin', [
            'user_id' => $marketer->id, 'pin' => '4821',
        ])->assertStatus(422)->assertJsonValidationErrors('pin');
    }

    public function test_signing_in_requires_a_device_token(): void
    {
        $user = $this->staffMember();

        $this->postJson('/api/v1/pos/auth/pin', ['user_id' => $user->id, 'pin' => '4821'])
            ->assertStatus(401);
    }

    // ============ Sessions ============

    public function test_a_second_login_takes_over_the_till(): void
    {
        $first = $this->staffMember();
        $second = $this->staffMember('waiter', '7777');

        $firstToken = $this->signInAtTill($first);
        $this->signInAtTill($second, '7777');

        // One person per till, so "who did this" always has one answer.
        $this->assertSame('takeover', TerminalSession::query()
            ->where('user_id', $first->id)->value('closed_reason'));

        $this->assertSame(1, TerminalSession::query()->open()->count());

        // And the taken-over token stops working immediately.
        $this->asSession($firstToken)->getJson('/api/v1/pos/auth/session')->assertStatus(401);
    }

    public function test_logging_out_kills_the_token_not_just_the_row(): void
    {
        $user = $this->staffMember();
        $token = $this->signInAtTill($user);

        $this->asSession($token)->deleteJson('/api/v1/pos/auth/session')->assertOk();

        $this->assertSame('logout', TerminalSession::query()->where('user_id', $user->id)->value('closed_reason'));
        $this->asSession($token)->getJson('/api/v1/pos/auth/session')->assertStatus(401);
    }

    public function test_an_idle_session_expires_and_asks_for_the_pin_again(): void
    {
        $user = $this->staffMember();
        $token = $this->signInAtTill($user);

        $this->travel((int) config('pos.pin.session_idle_minutes') + 1)->minutes();

        $this->asSession($token)->getJson('/api/v1/pos/auth/session')
            ->assertStatus(403)
            ->assertJsonPath('code', 'POS_SESSION_TIMEOUT');

        $this->assertSame('timeout', TerminalSession::query()->where('user_id', $user->id)->value('closed_reason'));
    }

    public function test_activity_keeps_a_session_alive(): void
    {
        $user = $this->staffMember();
        $token = $this->signInAtTill($user);

        $idle = (int) config('pos.pin.session_idle_minutes');

        $this->travel($idle - 1)->minutes();
        $this->asSession($token)->getJson('/api/v1/pos/auth/session')->assertOk();

        $this->travel($idle - 1)->minutes();
        $this->asSession($token)->getJson('/api/v1/pos/auth/session')->assertOk();
    }

    public function test_a_disabled_terminal_locks_out_an_open_session(): void
    {
        $user = $this->staffMember();
        $token = $this->signInAtTill($user);

        $this->terminal->update(['status' => 'disabled']);

        $this->asSession($token)->getJson('/api/v1/pos/auth/session')
            ->assertStatus(403)
            ->assertJsonPath('code', 'POS_TERMINAL_INACTIVE');
    }

    // ============ Changing a PIN ============

    public function test_a_manager_can_reset_somebody_elses_pin(): void
    {
        $manager = $this->staffMember('branch-manager', '9999');
        $cashier = $this->staffMember();

        $this->forgetGuardsAndActAs($manager)->withHeader('X-Tenant', $this->mine->slug)
            ->postJson('/api/v1/pos/auth/pin/rotate', ['user_id' => $cashier->id, 'pin' => '5150'])
            ->assertOk();

        $this->signInAtTill($cashier, '5150');
    }

    public function test_a_cashier_cannot_reset_somebody_elses_pin(): void
    {
        $cashier = $this->staffMember();
        $other = $this->staffMember('waiter', '7777');

        $this->forgetGuardsAndActAs($cashier)->withHeader('X-Tenant', $this->mine->slug)
            ->postJson('/api/v1/pos/auth/pin/rotate', ['user_id' => $other->id, 'pin' => '5150'])
            ->assertStatus(403)
            ->assertJsonPath('code', 'POS_PIN_FORBIDDEN');
    }

    public function test_changing_your_own_pin_needs_the_current_one(): void
    {
        $cashier = $this->staffMember();

        $this->forgetGuardsAndActAs($cashier)->withHeader('X-Tenant', $this->mine->slug)
            ->postJson('/api/v1/pos/auth/pin/rotate', ['pin' => '5150'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'POS_PIN_MISMATCH');

        $this->forgetGuardsAndActAs($cashier)->withHeader('X-Tenant', $this->mine->slug)
            ->postJson('/api/v1/pos/auth/pin/rotate', ['pin' => '5150', 'current_pin' => '4821'])
            ->assertOk();
    }

    public function test_an_obvious_pin_is_refused(): void
    {
        $cashier = $this->staffMember();

        $this->forgetGuardsAndActAs($cashier)->withHeader('X-Tenant', $this->mine->slug)
            ->postJson('/api/v1/pos/auth/pin/rotate', ['pin' => '1234', 'current_pin' => '4821'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('pin');
    }
}

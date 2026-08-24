<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\PushToken;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Push\ExpoPush;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Where a phone can be reached, and what happens when it no longer can.
 */
final class PushTokenTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

    #[Test]
    public function a_signed_in_person_registers_their_phone(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create();

        $this->actingAs($user)
            ->withHeader('X-Tenant', $tenant->slug)
            ->withHeader('Idempotency-Key', 'reg-1')
            ->postJson('/api/v1/push/tokens', [
                'token' => self::TOKEN, 'platform' => 'android', 'surface' => 'crew', 'device_name' => 'Pixel 7',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('public.push_tokens', ['user_id' => $user->id, 'token' => self::TOKEN, 'surface' => 'crew']);
    }

    #[Test]
    public function a_shared_phone_moves_to_whoever_signs_in_on_it(): void
    {
        $tenant = Tenant::factory()->create();
        [$first, $second] = User::factory()->for($tenant)->count(2)->create();

        foreach ([[$first, 'a'], [$second, 'b']] as [$user, $key]) {
            $this->actingAs($user)
                ->withHeader('X-Tenant', $tenant->slug)
                ->withHeader('Idempotency-Key', "reg-{$key}")
                ->postJson('/api/v1/push/tokens', ['token' => self::TOKEN, 'platform' => 'ios', 'surface' => 'crew'])
                ->assertCreated();
        }

        // One token, one row, and it belongs to the second person now: the
        // first would otherwise keep receiving the pages of a phone they no
        // longer hold.
        $this->assertSame(1, PushToken::query()->withoutGlobalScopes()->where('token', self::TOKEN)->count());
        $this->assertDatabaseHas('public.push_tokens', ['token' => self::TOKEN, 'user_id' => $second->id]);
    }

    #[Test]
    public function something_that_is_not_an_expo_token_is_refused(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create();

        $this->actingAs($user)
            ->withHeader('X-Tenant', $tenant->slug)
            ->withHeader('Idempotency-Key', 'reg-bad')
            ->postJson('/api/v1/push/tokens', ['token' => 'fcm:raw-device-token', 'platform' => 'android', 'surface' => 'crew'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'push.token_invalid');
    }

    #[Test]
    public function an_uninstalled_app_is_marked_and_skipped_next_time(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create();
        $token = PushToken::query()->create([
            'tenant_id' => $tenant->id, 'user_id' => $user->id, 'token' => self::TOKEN,
            'platform' => 'android', 'surface' => 'crew',
        ]);

        Http::fake([
            'exp.host/*' => Http::response(['data' => [
                ['status' => 'error', 'message' => 'gone', 'details' => ['error' => 'DeviceNotRegistered']],
            ]]),
        ]);

        $sent = app(ExpoPush::class)->send(PushToken::query()->get(), 'Stol 12', 'Taom tayyor');

        $this->assertSame(0, $sent);
        $this->assertNotNull($token->fresh()->invalidated_at);

        // The second send never reaches Expo: there is nothing live to send to.
        Http::fake();
        app(ExpoPush::class)->send(PushToken::query()->get(), 'x', 'y');
        Http::assertNothingSent();
    }
}

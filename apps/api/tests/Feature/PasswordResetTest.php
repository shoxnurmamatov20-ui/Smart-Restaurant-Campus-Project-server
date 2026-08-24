<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Forgot and reset — the two doors with no session behind them.
 */
final class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_mails_an_existing_account_and_says_nothing_either_way(): void
    {
        Notification::fake();
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['email' => 'owner@osh.uz']);

        $this->withHeader('X-Tenant', $tenant->slug)
            ->postJson('/api/v1/auth/forgot-password', ['email' => 'owner@osh.uz'])
            ->assertNoContent();

        Notification::assertSentTo($user, ResetPassword::class);

        // An unknown address gets the same answer: the form is not an oracle.
        $this->withHeader('X-Tenant', $tenant->slug)
            ->postJson('/api/v1/auth/forgot-password', ['email' => 'nobody@osh.uz'])
            ->assertNoContent();

        Notification::assertCount(1);
    }

    #[Test]
    public function a_valid_token_sets_the_password_and_ends_every_old_session(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['email' => 'owner@osh.uz', 'password' => 'old-password-1']);
        $user->createToken('console');
        $token = Password::broker()->createToken($user);

        $this->withHeader('X-Tenant', $tenant->slug)
            ->postJson('/api/v1/auth/reset-password', [
                'email' => 'owner@osh.uz', 'token' => $token,
                'password' => 'new-password-22', 'password_confirmation' => 'new-password-22',
            ])
            ->assertNoContent();

        $this->assertTrue(Hash::check('new-password-22', $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count(), 'the old session survived the reset');

        // The token is one-use.
        $this->withHeader('X-Tenant', $tenant->slug)
            ->postJson('/api/v1/auth/reset-password', [
                'email' => 'owner@osh.uz', 'token' => $token,
                'password' => 'another-pass-33', 'password_confirmation' => 'another-pass-33',
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'auth.reset_token_invalid');
    }
}

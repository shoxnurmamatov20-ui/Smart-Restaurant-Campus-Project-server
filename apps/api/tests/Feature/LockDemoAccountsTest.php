<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * `demo:lock` — the seeded demo passwords stop being `password`.
 *
 * The failure this guards is the one that happened: a seed whose docblock says
 * it never runs in production ran in production, and the owner account
 * answered to a password printed in the repository. The command has to rotate
 * every matching account, revoke their sessions, and leave everyone else alone.
 */
final class LockDemoAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_rotates_every_demo_password_and_revokes_sessions(): void
    {
        $tenant = Tenant::factory()->create();

        $demo = User::factory()->for($tenant)->create(['email' => 'owner@demo.uz', 'password' => 'password']);
        $real = User::factory()->for($tenant)->create(['email' => 'real@osh.uz', 'password' => 'keep-me']);

        $demo->createToken('till');
        $this->assertSame(1, $demo->tokens()->count());

        $this->artisan('demo:lock')
            ->expectsOutputToContain('1 account(s) rotated')
            ->assertSuccessful();

        $this->assertFalse(Hash::check('password', $demo->fresh()->password), 'the demo password still works');
        $this->assertSame(0, $demo->tokens()->count(), 'the old session survived');
        $this->assertTrue(Hash::check('keep-me', $real->fresh()->password), 'a non-demo account was touched');
    }

    public function test_it_says_so_when_there_is_nothing_to_lock(): void
    {
        $this->artisan('demo:lock', ['--domain' => 'nobody.example'])
            ->expectsOutputToContain('nothing to lock')
            ->assertSuccessful();
    }
}

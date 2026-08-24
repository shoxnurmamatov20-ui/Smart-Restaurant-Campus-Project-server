<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Modules\Pos\Events\IdlePreviewRequested;
use Modules\Pos\Models\Terminal;
use Tests\TestCase;

/**
 * Show me what that looks like — on the till, not in the browser.
 *
 * The settings screen draws its own preview of the idle screen, and that
 * preview cannot answer the only question worth asking: whether the message is
 * readable on a 15-inch screen bolted to a counter in a room with a window.
 */
final class TerminalIdlePreviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create();
        $user->assignRole($role);
        $this->actingAs($user);

        return $user->fresh();
    }

    public function test_a_manager_pushes_a_draft_at_one_terminal(): void
    {
        Event::fake([IdlePreviewRequested::class]);

        $this->signIn('branch-manager');
        $terminal = Terminal::factory()->create();

        $this->postJson("/api/v1/pos/terminals/{$terminal->id}/preview", [
            'mode' => 'brand',
            'headline' => 'Xush kelibsiz',
            'seconds' => 30,
        ])
            ->assertOk()
            // Per TERMINAL, not per branch: the point is *that* screen, and a
            // branch channel would flash every till in the building while
            // somebody is serving on one of them.
            ->assertJsonPath('preview.channel', 'terminal.'.$terminal->id);

        Event::assertDispatched(
            IdlePreviewRequested::class,
            static fn (IdlePreviewRequested $event): bool => $event->terminal->is($terminal)
                && $event->idle['headline'] === 'Xush kelibsiz'
                && $event->seconds === 30,
        );
    }

    public function test_the_preview_writes_nothing(): void
    {
        Event::fake([IdlePreviewRequested::class]);

        $this->signIn('owner');
        $terminal = Terminal::factory()->create(['settings' => ['idle' => ['mode' => 'status']]]);

        $this->postJson("/api/v1/pos/terminals/{$terminal->id}/preview", ['mode' => 'minimal'])
            ->assertOk();

        // A preview that saved would mean every experiment ships to the counter
        // permanently, and the manager finds out from a guest.
        $this->assertSame('status', $terminal->fresh()?->settings['idle']['mode']);
    }

    public function test_a_waiter_cannot_put_a_message_on_a_screen_a_room_can_read(): void
    {
        $this->signIn('waiter');
        $terminal = Terminal::factory()->create();

        $this->postJson("/api/v1/pos/terminals/{$terminal->id}/preview", ['mode' => 'brand'])
            ->assertStatus(403);
    }

    public function test_an_unbounded_message_is_refused(): void
    {
        $this->signIn('owner');
        $terminal = Terminal::factory()->create();

        // Free text that lands on a screen in a public room. Unbounded, it is a
        // message that covers the whole counter.
        $this->postJson("/api/v1/pos/terminals/{$terminal->id}/preview", [
            'headline' => str_repeat('a', 200),
        ])->assertStatus(422);
    }

    public function test_saving_the_idle_screen_leaves_the_discount_ceilings_alone(): void
    {
        $this->signIn('owner');
        $terminal = Terminal::factory()->create([
            'settings' => ['discount_limits' => ['cashier' => 5]],
        ]);

        $this->patchJson("/api/v1/pos/terminals/{$terminal->id}", [
            'settings' => ['idle' => ['background' => 'warm']],
        ])->assertOk();

        // `update()` writes the whole jsonb column. Without the merge, saving a
        // background would blank every ceiling on the till — and the first
        // anybody would hear of it is a cashier refused a discount they have
        // always been able to give.
        $settings = $terminal->fresh()->settings ?? [];
        $this->assertSame(5, $settings['discount_limits']['cashier']);
        $this->assertSame('warm', $settings['idle']['background']);
    }
}

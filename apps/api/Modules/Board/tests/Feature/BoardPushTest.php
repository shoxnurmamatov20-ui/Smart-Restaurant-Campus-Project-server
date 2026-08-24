<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use App\Models\StoredDomainEvent;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Event;
use Modules\Board\Events\BoardPushed;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * Hand the board over — `POST board/push`.
 *
 * A write plus a broadcast, and the test has to hold both halves down because
 * each one fails silently on its own.
 *
 * Without the WRITE, the console cannot tell a manager whether the wall has
 * seen their edit — so a reorder half done at 11:50 looks identical to one
 * finished and published, and the way that shows up is a heading nobody
 * intended being read by the lunch queue.
 *
 * Without the BROADCAST, nothing happens at all until the television reloads.
 * Nobody stands at a menu board; there is no F5. A push that only wrote a
 * timestamp would pass every assertion about the database and change nothing in
 * the room.
 *
 * And a push that changed nothing must do neither. A manager pressing the
 * button to check would otherwise redraw every screen in the building —
 * `DishStopped` refuses a double tap on the same grounds, and the symptom is
 * the same: a wall that appears to flicker during service.
 */
final class BoardPushTest extends BoardScenario
{
    // ============ The write ============

    public function test_pushing_stamps_everything_that_was_behind(): void
    {
        $column = $this->column($this->national->id);
        $screen = $this->screen('main', 20);
        $banner = $this->banner('lavash');

        $response = $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        $this->assertSame(3, $response->json('data.pushed'));
        $this->assertSame(1, $response->json('data.columns'));
        $this->assertSame(1, $response->json('data.screens'));
        $this->assertSame(1, $response->json('data.banners'));
        $this->assertNotNull($response->json('data.pushed_at'));

        $this->assertNotNull($column->refresh()->published_at);
        $this->assertNotNull($screen->refresh()->published_at);
        $this->assertNotNull($banner->refresh()->published_at);

        $this->assertFalse($column->isBehindTheScreens());
    }

    public function test_the_console_stops_saying_the_wall_is_behind(): void
    {
        $this->column($this->national->id);

        $before = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');
        $this->assertTrue($before['behind_the_screens']);
        $this->assertNull($before['pushed_at']);

        $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        $after = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');
        $this->assertFalse($after['behind_the_screens']);
        $this->assertNotNull($after['pushed_at']);
    }

    public function test_editing_after_a_push_puts_the_wall_behind_again(): void
    {
        $column = $this->column($this->national->id);
        $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        /*
         * The clock is moved on purpose rather than left to the machine.
         *
         * `published_at` and `updated_at` are both `timestamp(0)`, like every
         * other timestamp on this platform, so "behind" is answered to the
         * second — and a test that pushed and edited inside one second would be
         * asserting how fast the runner is rather than what the rule says. A
         * person cannot press push and then edit within the same second either,
         * which is why second granularity is enough here.
         */
        $this->travel(1)->seconds();

        $this->atChilonzor()->patchJson("/api/v1/board/columns/{$column->id}", ['accent' => '#FFC46B'])
            ->assertOk()
            ->assertJsonPath('data.behind_the_screens', true);

        $this->travelBack();
    }

    public function test_a_push_that_changed_nothing_writes_nothing_and_says_nothing(): void
    {
        $this->column($this->national->id);
        $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        Event::fake([BoardPushed::class]);

        $response = $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        $this->assertSame(0, $response->json('data.pushed'));
        // Null rather than a fresh stamp, so a client can tell "already up to
        // date" from "just published" without comparing timestamps.
        $this->assertNull($response->json('data.pushed_at'));

        Event::assertNotDispatched(BoardPushed::class);
    }

    // ============ The broadcast ============

    public function test_the_push_is_announced_to_this_counter_and_no_further(): void
    {
        Event::fake([BoardPushed::class]);

        $this->column($this->national->id);
        $this->screen('main', 20);

        $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        Event::assertDispatched(BoardPushed::class, function (BoardPushed $event): bool {
            $channels = array_map(static fn ($channel): string => $channel->name, $event->broadcastOn());

            return $channels === ['private-branch.'.$this->chilonzor->id.'.board']
                && $event->broadcastAs() === 'board.pushed'
                && $event->broadcastWith()['columns'] === 1
                && $event->broadcastWith()['screens'] === 1;
        });
    }

    public function test_the_channel_exists_and_only_this_restaurant_may_listen(): void
    {
        $callback = Broadcast::getChannels()->get('branch.{branchId}.board');

        $this->assertNotNull(
            $callback,
            'routes/channels.php no longer registers branch.{branchId}.board — an '
                .'unregistered private channel authorises nobody, so the wall goes '
                .'quiet without a single test failing.',
        );

        // The counter, and the people who write for it. A cook is not here: the
        // one thing the board tells a kitchen is the stop list, and that arrives
        // on `.stoplist`, in the other direction.
        foreach (['cashier', 'branch-manager', 'owner'] as $role) {
            $this->assertTrue(
                $this->mayListen($this->userWithRole($role), $this->chilonzor->id, $callback),
                "A {$role} of this restaurant must hear its own counter",
            );
        }

        $this->assertFalse(
            $this->mayListen($this->userWithRole('courier'), $this->chilonzor->id, $callback),
            'A courier has no board to redraw.',
        );
    }

    public function test_another_restaurants_counter_cannot_be_listened_to(): void
    {
        /*
         * The role is not the permission — the restaurant is. A manager is a
         * manager everywhere, and if the role alone opened the channel then any
         * signed-in manager on the platform could watch a competitor's board:
         * their menu, their prices and every promotion the moment it goes up.
         */
        $callback = Broadcast::getChannels()->get('branch.{branchId}.board');
        [, $rivalBranch] = $this->rival();

        $this->assertFalse(
            $this->mayListen($this->userWithRole('owner'), $rivalBranch->id, $callback),
        );
    }

    // ============ The outbox ============

    public function test_the_push_is_recorded_on_the_bus_for_whatever_wants_it_later(): void
    {
        /*
         * The durable half. The broadcast reaches two televisions and is
         * worthless a second later — a screen that was off has missed it. This
         * is what a signage agent, a Telegram message or an audit answering
         * "when did that price reach the wall" subscribes to.
         */
        $this->column($this->national->id);

        $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        $event = StoredDomainEvent::query()->where('name', 'board.published')->first();

        $this->assertNotNull($event, 'A push is a business fact and belongs on the outbox.');
        $this->assertSame($this->chilonzor->id, $event->payload['branch_id']);
        $this->assertSame(1, $event->payload['columns']);
        $this->assertSame($this->tenant->id, $event->tenant_id);
    }

    // ============ Where, and who ============

    public function test_a_push_with_no_venue_is_refused(): void
    {
        // "Publish to which wall" has no honest answer for a request that named
        // no venue, and guessing means one head-office tap redrawing five rooms.
        $this->column($this->national->id);

        $this->postJson('/api/v1/board/push')->assertApiError('request.branch_required', 'X-Branch');
    }

    public function test_a_waiter_cannot_push_the_board(): void
    {
        $this->actingAs($this->userWithRole('waiter'));

        $this->atChilonzor()->postJson('/api/v1/board/push')->assertForbidden();
    }

    public function test_a_push_never_reaches_another_restaurants_rows(): void
    {
        [$rival, $rivalBranch] = $this->rival();

        $theirs = $this->asRestaurant($rival, $rivalBranch, fn (): BoardColumn => BoardColumn::create([
            'tenant_id' => $rival->id,
            'branch_id' => $rivalBranch->id,
            'menu_category_id' => 4242,
            'position' => 0,
        ]));

        $this->column($this->national->id);

        $response = $this->atChilonzor()->postJson('/api/v1/board/push')->assertOk();

        $this->assertSame(1, $response->json('data.columns'));
        $this->assertNull(
            $theirs->refresh()->published_at,
            "Osh Markazi's push must not stamp Registon's board.",
        );
    }

    // ============ Helpers ============

    /**
     * Ask the channel callback the question Reverb asks it.
     *
     * The branch id arrives as a STRING, because that is what a channel name is
     * — `private-branch.7.board` is text on a socket, and a callback that only
     * worked for integers would authorise nobody in production while every test
     * passed.
     */
    private function mayListen(User $user, int $branchId, callable $callback): bool
    {
        return (bool) $callback($user, (string) $branchId);
    }

    private function screen(string $slug, int $seconds): BoardScreen
    {
        return BoardScreen::create([
            'slug' => $slug,
            'name' => ['uz' => $slug, 'ru' => $slug, 'en' => $slug],
            'seconds' => $seconds,
        ]);
    }

    private function banner(string $slug): BoardBanner
    {
        return BoardBanner::create([
            'slug' => $slug,
            'text' => ['uz' => $slug, 'ru' => $slug, 'en' => $slug],
            'kind' => 'offer',
            'is_live' => true,
        ]);
    }
}

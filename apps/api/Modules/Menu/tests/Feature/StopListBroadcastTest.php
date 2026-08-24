<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Contracts\Menu\StopList;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Event;
use Modules\Menu\Events\DishResumed;
use Modules\Menu\Events\DishStopped;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The 86 sheet on the wire.
 *
 * The whole feature is the second between a chef tapping a wall screen and a
 * waiter's tile going dashed. Everything else about the stop-list — the reason,
 * the expiry, the audit row — is bookkeeping around that second, so what these
 * tests protect is the wire itself: who hears it, what they hear, and when
 * nothing is said at all.
 *
 * Three properties, and a restaurant notices each one differently.
 *
 * The GRAIN. A stop is one kitchen's news. Broadcast a branch at tenant level
 * and a fifty-venue chain greys out manti in Termiz because Chilonzor ran out
 * of dough — a waiter then sells nothing they cannot see, and the loss is
 * silent revenue rather than a visible fault.
 *
 * The PAYLOAD. The title travels with the id so a tablet can say "Manti off" in
 * a toast without a round trip. The tile it dims is already on screen, but the
 * dish may be in a section nobody is looking at, and a waiter who was told
 * nothing takes the order anyway.
 *
 * The SILENCE. `stop()` returns whether it changed anything, and a no-op must
 * stay off the wire. Two cooks tapping the same dish on two screens within a
 * second is the normal case, not an error, and redrawing every tablet in the
 * building because somebody double-tapped is how a wall screen earns a reputation
 * for flickering during service.
 */
final class StopListBroadcastTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        /*
         * A stop-list without a branch is not a wider stop-list, it is no
         * stop-list: EloquentStopList refuses to write when the context is
         * empty, because "off everywhere" is a different act with a different
         * audit trail and a chef tapping a wall screen never means it.
         */
        app(BranchContext::class)->set($this->chilonzor);

        $chef = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $chef->assignRole('chef');
        $this->actingAs($chef);
    }

    private function stopList(): StopList
    {
        return app(StopList::class);
    }

    /** Manti, hot station. The sku is unique per call — sku is indexed. */
    private function manti(): MenuItem
    {
        static $n = 0;

        return MenuItem::factory()
            ->dish('SL-MNT-'.(++$n), 'Manti', 'Манты', 'Manti', 4_000_000)
            ->create();
    }

    /**
     * @return array<int, string>
     */
    private function channelsOf(DishStopped|DishResumed $event): array
    {
        return array_map(static fn ($channel): string => $channel->name, $event->broadcastOn());
    }

    /**
     * Ask the channel callback the question Reverb asks it.
     *
     * The branch id arrives as a STRING here because that is what a channel name
     * is — `private-branch.7.stoplist` is text on a socket, and a callback that
     * only worked for integers would authorise nobody in production while every
     * test passed.
     *
     * The tenant context is emptied for the call, and that is the point rather
     * than tidiness: `/broadcasting/auth` is a web route with no `X-Tenant`
     * header and no tenant middleware, so BelongsToTenant's global scope adds
     * nothing there. With the context set, a passing test would be proving the
     * Eloquent scope works — the callback's own `where('tenant_id', …)` is the
     * only thing standing between two restaurants on this route, so it is the
     * only thing under test.
     */
    private function mayListen(User $user, Branch $branch): bool
    {
        $callback = Broadcast::getChannels()->get('branch.{branchId}.stoplist');

        $this->assertNotNull(
            $callback,
            'routes/channels.php no longer registers branch.{branchId}.stoplist — '
                .'an unregistered private channel authorises nobody, so the stop-list '
                .'goes quiet without a single test failing.',
        );

        $tenant = app(TenantContext::class)->tenant();
        app(TenantContext::class)->clear();

        try {
            return (bool) $callback($user, (string) $branch->id);
        } finally {
            app(TenantContext::class)->set($tenant);
        }
    }

    private function userOf(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole($role);

        return $user;
    }

    public function test_stopping_a_dish_is_announced_to_its_own_kitchen_and_no_further(): void
    {
        Event::fake([DishStopped::class]);

        $this->assertTrue($this->stopList()->stop($this->manti()->id));

        Event::assertDispatched(DishStopped::class, function (DishStopped $event): bool {
            return $this->channelsOf($event) === [
                'private-branch.'.$this->chilonzor->id.'.stoplist',
            ];
        });
    }

    public function test_the_announcement_names_the_dish_the_reason_and_the_deadline(): void
    {
        Event::fake([DishStopped::class]);

        $dish = $this->manti();

        // Whole seconds: `stopped_until` round-trips through PostgreSQL and the
        // ISO string on the wire is what a tablet parses, so a stray microsecond
        // here would be a difference the test invented, not one the feature has.
        $until = Carbon::now()->addHours(4)->startOfSecond();

        $this->stopList()->stop($dish->id, 'Xamir tugadi', $until);

        Event::assertDispatched(DishStopped::class, function (DishStopped $event) use ($dish, $until): bool {
            $payload = $event->broadcastWith();

            return $payload['dish_id'] === $dish->id
                // The name, not just the id. A toast that says "Manti off" needs
                // no lookup; one that says "dish 412 off" needs a round trip at
                // the moment the kitchen is busiest, and it can fail after a
                // notification that cannot.
                && $payload['title'] === 'Manti'
                // Why, so the floor can answer the guest instead of guessing,
                // and until when, so nobody re-asks the kitchen at half past.
                && $payload['reason'] === 'Xamir tugadi'
                && $payload['until'] === $until->toIso8601String();
        });
    }

    public function test_putting_a_dish_back_is_its_own_event(): void
    {
        /*
         * Two events, not one with a boolean. A client that had to read a flag
         * to tell "off" from "on" shows the wrong one the day the field is
         * renamed, and the wrong one here means either selling what the kitchen
         * cannot cook or refusing what it can.
         */
        $dish = $this->manti();
        $this->stopList()->stop($dish->id, 'Xamir tugadi');

        Event::fake([DishStopped::class, DishResumed::class]);

        $this->assertTrue($this->stopList()->clear($dish->id));

        Event::assertDispatched(DishResumed::class, function (DishResumed $event) use ($dish): bool {
            $payload = $event->broadcastWith();

            return $this->channelsOf($event) === ['private-branch.'.$this->chilonzor->id.'.stoplist']
                && $payload['dish_id'] === $dish->id
                && $payload['title'] === 'Manti';
        });

        Event::assertNotDispatched(DishStopped::class);
    }

    public function test_a_double_tap_on_an_already_stopped_dish_says_nothing(): void
    {
        // Two cooks, two screens, the same dish. The partial unique index would
        // refuse the second write anyway; what must not happen is the second tap
        // reaching the wire, because every tablet in the building would redraw
        // for news it already has.
        $dish = $this->manti();
        $this->assertTrue($this->stopList()->stop($dish->id, 'Xamir tugadi'));

        Event::fake([DishStopped::class, DishResumed::class]);

        $this->assertFalse(
            $this->stopList()->stop($dish->id, 'Xamir tugadi'),
            'Stopping an already-stopped dish on identical terms changed nothing',
        );

        Event::assertNotDispatched(DishStopped::class);
        Event::assertNotDispatched(DishResumed::class);
    }

    public function test_clearing_a_dish_that_was_never_off_says_nothing(): void
    {
        // The mirror of the double-tap, and the one a fat finger produces: a
        // "resume" for a dish that was already on tells every screen to redraw a
        // tile that never changed.
        Event::fake([DishResumed::class]);

        $this->assertFalse($this->stopList()->clear($this->manti()->id));

        Event::assertNotDispatched(DishResumed::class);
    }

    public function test_everyone_who_sells_or_cooks_the_food_may_listen(): void
    {
        /*
         * The widest audience of the three branch channels, deliberately: a stop
         * changes what every screen in the building may sell. Leave the cashier
         * off and a till happily rings up manti that the pass will refuse, with
         * the guest already at the counter.
         */
        foreach (['cook', 'chef', 'waiter', 'cashier', 'branch-manager', 'owner'] as $role) {
            $this->assertTrue(
                $this->mayListen($this->userOf($this->tenant, $role), $this->chilonzor),
                "A {$role} of this restaurant must hear its own kitchen's stop-list",
            );
        }
    }

    public function test_a_kitchen_role_at_another_restaurant_hears_nothing(): void
    {
        /*
         * The role is not the permission — the restaurant is. A cook is a cook
         * everywhere, and if the role alone opened the channel then any signed-in
         * cook on the platform could subscribe to a competitor's branch and watch
         * what they run out of, which is a menu, a supplier problem and a volume
         * estimate leaking down one socket.
         */
        $rival = Tenant::query()->create([
            'name' => 'Registon', 'slug' => 'registon', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $rivalBranch = Branch::query()->create([
            'tenant_id' => $rival->id, 'name' => 'Registon markaz', 'slug' => 'registon-markaz',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $outsider = $this->userOf($rival, 'cook');

        $this->assertFalse(
            $this->mayListen($outsider, $this->chilonzor),
            "Another restaurant's cook must not hear this kitchen, role or no role",
        );

        // The positive control, so the refusal above is provably about tenancy
        // and not about this user being broken in some other way.
        $this->assertTrue(
            $this->mayListen($outsider, $rivalBranch),
            'The same cook must still hear the kitchen they actually work in',
        );
    }

    public function test_a_role_with_no_business_on_the_pass_hears_nothing(): void
    {
        // A courier's app has no menu to grey out and no order to refuse, so the
        // stop-list tells them nothing they can act on — and a private channel
        // that admits everyone with an account is not a private channel.
        $this->assertFalse(
            $this->mayListen($this->userOf($this->tenant, 'courier'), $this->chilonzor),
        );
    }
}

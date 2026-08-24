<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Feature;

use App\Contracts\Orders\BillRegistry;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Modules\Kitchen\Events\TicketFired;
use Modules\Kitchen\Events\TicketMoved;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The first broadcasts in this repository, and the two things they must get
 * right: the right room hears them, and nobody else does.
 *
 * The channel grain is the point. The channels that existed before P5 were
 * `tenant.{id}.kitchen` — one channel for a whole chain — so a fifty-venue
 * restaurant would have pushed every docket to every pass. A kitchen screen is
 * a physical object standing in one room, and it should hear that room.
 */
final class KitchenBroadcastTest extends TestCase
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
        app(BranchContext::class)->set($this->chilonzor);

        $chef = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $chef->assignRole('chef');
        $this->actingAs($chef);
    }

    private function bills(): BillRegistry
    {
        return app(BillRegistry::class);
    }

    /** A dish off one station. The sku is unique per call — sku is indexed. */
    private function dish(string $station = 'grill'): MenuItem
    {
        static $n = 0;

        return MenuItem::factory()->create([
            'sku' => 'BC-'.$station.'-'.(++$n), 'station' => $station, 'price' => 4_500_000,
        ]);
    }

    public function test_firing_a_bill_announces_the_docket(): void
    {
        Event::fake([TicketFired::class]);

        $bill = $this->bills()->open('dine_in', tableLabel: 'A-7');
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);

        Event::assertDispatched(TicketFired::class, function (TicketFired $event): bool {
            $payload = $event->broadcastWith();

            // The docket itself, not an id. A screen that received "ticket 412
            // changed" would have to fetch it — a round trip per ticket during
            // the minute the kitchen is busiest, and one that can fail after a
            // notification that cannot.
            return $payload['table_label'] === 'A-7'
                && $payload['station'] === 'grill'
                && $payload['status'] === 'new'
                && $payload['lines'] !== [];
        });
    }

    public function test_the_docket_goes_to_its_own_branch_and_no_further(): void
    {
        Event::fake([TicketFired::class]);

        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);

        Event::assertDispatched(TicketFired::class, function (TicketFired $event): bool {
            $channels = array_map(
                static fn ($channel): string => $channel->name,
                $event->broadcastOn(),
            );

            return $channels === ['private-branch.'.$this->chilonzor->id.'.kitchen'];
        });
    }

    public function test_a_cook_moving_a_ticket_tells_the_floor_as_well(): void
    {
        /*
         * The second channel is the whole reason this event exists. Without it
         * the kitchen knows everything and the room knows nothing, which is how
         * food sits under a lamp going cold while the waiter is at the other end
         * of the restaurant.
         */
        Event::fake([TicketMoved::class]);

        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);

        KitchenTicket::query()->where('order_id', $bill->id)->firstOrFail()->start();

        Event::assertDispatched(TicketMoved::class, function (TicketMoved $event): bool {
            $channels = array_map(
                static fn ($channel): string => $channel->name,
                $event->broadcastOn(),
            );
            $payload = $event->broadcastWith();

            return $channels === [
                'private-branch.'.$this->chilonzor->id.'.kitchen',
                'private-branch.'.$this->chilonzor->id.'.orders',
            ]
                // Both ends, so a screen that missed a message can tell whether
                // it is behind rather than assuming it is current.
                && $payload['from'] === 'new'
                && $payload['status'] === 'cooking';
        });
    }

    public function test_a_move_that_changes_nothing_says_nothing(): void
    {
        // `markServed` on a ticket that is not ready returns false and writes
        // nothing. A screen that redrew on every no-op would flicker through a
        // service for no reason.
        Event::fake([TicketMoved::class]);

        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);

        $ticket = KitchenTicket::query()->where('order_id', $bill->id)->firstOrFail();

        $this->assertFalse($ticket->markServed(), 'A new ticket cannot be served');
        Event::assertNotDispatched(TicketMoved::class);
    }

    public function test_editing_a_docket_without_moving_it_does_not_announce_a_move(): void
    {
        // Re-firing an edited bill rewrites the lines. That is a TicketFired,
        // not a TicketMoved: nothing about the cook's progress changed, and a
        // pass that saw "moved" would think somebody had claimed it.
        $bill = $this->bills()->open('dine_in');
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);

        Event::fake([TicketMoved::class]);

        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);

        Event::assertNotDispatched(TicketMoved::class);
    }
}

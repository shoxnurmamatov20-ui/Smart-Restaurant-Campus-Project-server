<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\MenuStopEntry;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * The 86 sheet as the wall screen actually reaches it: /api/v1/kitchen/stop-list.
 *
 * `Modules\Menu\Tests\Feature\StopListTest` proves the sheet itself — one row per
 * kitchen, a double tap is silent, expiry on the clock. This proves the door the
 * kitchen knocks on, and five properties a service loses the moment they break:
 *
 * **The sheet is the whole menu, not the stopped part of it.** A chef opens it to
 * take something off, so the dish they are looking for is by definition still on.
 * An endpoint answering with only what is already stopped would force the screen
 * to ask Menu for the rest — `menu.view`, which the kitchen does not hold — and
 * the tile the cook walked over to tap would not be drawn at all.
 *
 * **A second tap is not a failure.** Two cooks reach the same tile within a second
 * of each other every busy service. The second gets 200 and `changed: false`,
 * because a red banner on a wall screen for a colleague's tap is how a brigade
 * learns to stop reading the screen.
 *
 * **The gate is the kitchen's, both ways.** Taking a dish off tonight is a cook's
 * decision; repricing it is not. So the route asks for `kitchen.update` and never
 * for `menu.update`, and a waiter — who can read the sheet, because they need to
 * know what is off — cannot write to it.
 *
 * **No branch, no stop.** "Off everywhere" is a different act with a different
 * audit trail (`menu_items.is_available`, an owner's call). A request that named
 * no venue is refused rather than guessed at, or one head-office tap empties five
 * kitchens' menus.
 *
 * **A docket names its own room.** The KDS subscribes to a branch channel, and a
 * screen listening to the wrong room looks exactly like a screen with nothing
 * happening in it — nobody reports it, the food just stops going out.
 */
final class StopListEndpointTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private MenuItem $manti;

    private MenuItem $lamb;

    private User $chef;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::factory()->named('Chilonzor', 'CHZ')
            ->create(['tenant_id' => $this->tenant->id]);
        app(BranchContext::class)->set($this->chilonzor);

        /*
         * Two sections, two stations, one dish each.
         *
         * The sheet is read across the pass rather than top to bottom: a grill
         * cook takes grill dishes off and needs to see which heading a dish sits
         * under to find it. A single-section fixture would pass every assertion
         * below while the `section` and `station` columns were both blank.
         */
        $national = MenuCategory::factory()
            ->named('milliy-taomlar', 'Milliy taomlar', 'Национальные блюда', 'National dishes')
            ->create(['tenant_id' => $this->tenant->id, 'sort_order' => 1]);

        $grill = MenuCategory::factory()
            ->named('shashliklar', 'Shashliklar', 'Шашлыки', 'Grill')
            ->create(['tenant_id' => $this->tenant->id, 'sort_order' => 2]);

        $this->manti = MenuItem::factory()
            ->dish('MNT', 'Manti', 'Манты', 'Manti', 4_000_000, 'hot')
            ->create(['menu_category_id' => $national->id, 'sort_order' => 1]);

        $this->lamb = MenuItem::factory()
            ->dish('SHK', "Qo'y shashlik", 'Шашлык из баранины', 'Lamb kebab', 3_500_000, 'grill')
            ->create(['menu_category_id' => $grill->id, 'sort_order' => 1]);

        /*
         * A name, not a faker one. The sheet's job in service is to answer "who
         * took this off, so who do I ask about it", and that name is fetched
         * through a join to `public.users` rather than a relation — when the join
         * breaks the failure should read like the wall screen.
         */
        $this->chef = User::factory()->create(['name' => 'Oshpaz Aziz']);
        $this->chef->assignRole('chef');
        $this->actingAs($this->chef);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    /**
     * Every request from a wall screen says which kitchen it is bolted to.
     *
     * A cook pinned to one venue never types this — `ResolveBranch` fills it in
     * from their own branch. These users are not pinned, which is the harder case
     * and the one the refusal below exists for.
     */
    private function fromTheChilonzorPass(): static
    {
        return $this->withHeader('X-Branch', $this->chilonzor->slug);
    }

    /**
     * One line of the sheet, found by dish rather than by position.
     *
     * Asserting on `data.0` would tie the test to the order two sections happen
     * to sort in, and a reordered menu is not a bug.
     *
     * @return array<string, mixed>
     */
    private function lineFor(TestResponse $response, MenuItem $dish): array
    {
        /** @var array<int, array<string, mixed>> $sheet */
        $sheet = $response->json('data');

        foreach ($sheet as $line) {
            if ($line['dish_id'] === $dish->id) {
                return $line;
            }
        }

        $this->fail("Dish {$dish->id} is not on the 86 sheet at all — the screen cannot draw a tile it was never sent.");
    }

    // ============ The sheet ============

    public function test_the_sheet_lists_every_dish_the_kitchen_could_stop_with_its_station_and_section(): void
    {
        $response = $this->fromTheChilonzorPass()->getJson('/api/v1/kitchen/stop-list');

        $response->assertOk()->assertJsonCount(2, 'data');

        $manti = $this->lineFor($response, $this->manti);
        $this->assertSame('Manti', $manti['title']);
        $this->assertFalse($manti['is_stopped']);
        // Which cook is responsible for taking it off, and which heading they
        // will find it under. A line missing either is a line nobody can act on.
        $this->assertSame('hot', $manti['station']);
        $this->assertSame('Milliy taomlar', $manti['section']);
        $this->assertNull($manti['reason']);

        $lamb = $this->lineFor($response, $this->lamb);
        $this->assertSame('grill', $lamb['station']);
        $this->assertSame('Shashliklar', $lamb['section']);
    }

    /*
     * The property the whole endpoint exists for.
     *
     * A stopped dish stays on the sheet, flagged — it does not drop off it. A cook
     * has to be able to see that Manti is already off (and why, and until when)
     * without that answer arriving as an absence, because an absent tile is
     * indistinguishable from a dish that was never on the menu.
     */
    public function test_a_stopped_dish_stays_on_the_sheet_flagged_rather_than_dropping_off_it(): void
    {
        $this->fromTheChilonzorPass()->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "go'sht tugadi",
        ])->assertOk();

        $response = $this->getJson('/api/v1/kitchen/stop-list')->assertOk();

        // Still two dishes. The sheet is the menu, marked up — not a list of
        // problems.
        $response->assertJsonCount(2, 'data');

        $manti = $this->lineFor($response, $this->manti);
        $this->assertTrue($manti['is_stopped']);
        $this->assertSame("go'sht tugadi", $manti['reason']);
        $this->assertSame('Oshpaz Aziz', $manti['stopped_by']);

        // And the dish nobody touched is still selling, on the same sheet.
        $this->assertFalse($this->lineFor($response, $this->lamb)['is_stopped']);
    }

    // ============ Taking a dish off, and putting it back ============

    public function test_a_chef_takes_a_dish_off_and_the_answer_carries_the_refreshed_sheet(): void
    {
        $response = $this->fromTheChilonzorPass()->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "qo'y go'shti tugadi",
        ]);

        $response->assertOk()->assertJsonPath('changed', true);

        /*
         * The write answers with the sheet, so the screen redraws from the tap it
         * just made instead of asking again for the state it already caused. With a
         * second request in between, a tablet that loses signal at the wrong moment
         * keeps drawing Manti as selling while the kitchen has it off — and the
         * waiter holding that tablet is the one who promises it to a guest.
         */
        $this->assertTrue($this->lineFor($response, $this->manti)['is_stopped']);
    }

    public function test_a_timed_stop_comes_back_on_the_clock_and_the_sheet_says_when(): void
    {
        // "No more lamb until the evening delivery" is what a kitchen actually
        // means, and a tile that says nothing about when it returns has waiters
        // guessing — the guess they make is always the earlier one.
        $until = now()->addHours(2)->startOfSecond();

        $response = $this->fromTheChilonzorPass()->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->lamb->id,
            'reason' => 'kechqurun yetkazib berishda',
            'until' => $until->toIso8601String(),
        ]);

        $response->assertOk()->assertJsonPath('changed', true);
        $this->assertSame($until->toIso8601String(), $this->lineFor($response, $this->lamb)['until']);
    }

    public function test_a_second_cook_tapping_the_same_tile_is_answered_with_ok_and_changed_false(): void
    {
        $this->fromTheChilonzorPass()->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "go'sht tugadi",
        ])->assertOk()->assertJsonPath('changed', true);

        $second = $this->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "go'sht tugadi",
        ]);

        /*
         * 200, not 409 and not 422.
         *
         * The dish is off, which is what the second cook wanted; nothing failed.
         * `changed: false` is how the client knows to skip the toast, and the
         * sheet comes back regardless so the screen is correct even though the tap
         * did nothing.
         */
        $second->assertOk()->assertJsonPath('changed', false);
        $this->assertTrue($this->lineFor($second, $this->manti)['is_stopped']);

        // One open row. A stray second one survives the first `clear` and leaves a
        // dish off the menu after somebody has already put it back.
        $this->assertSame(1, MenuStopEntry::query()->open()->count());
    }

    public function test_putting_a_dish_back_returns_it_to_the_sheet_as_selling(): void
    {
        $this->fromTheChilonzorPass()->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "go'sht tugadi",
        ])->assertOk();

        $back = $this->deleteJson("/api/v1/kitchen/stop-list/{$this->manti->id}");

        $back->assertOk()->assertJsonPath('changed', true);

        $line = $this->lineFor($back, $this->manti);
        $this->assertFalse($line['is_stopped']);
        // The reason goes with it. A dish back on the menu still carrying
        // "go'sht tugadi" is a waiter refusing to sell what the kitchen is cooking.
        $this->assertNull($line['reason']);
    }

    public function test_putting_back_a_dish_that_was_never_off_is_not_an_error(): void
    {
        // The delivery arrived while a second cook was already reaching for the
        // tile. Same rule as the double tap, and the same reason: nothing failed.
        $this->fromTheChilonzorPass()
            ->deleteJson("/api/v1/kitchen/stop-list/{$this->lamb->id}")
            ->assertOk()
            ->assertJsonPath('changed', false);

        $this->assertSame(0, MenuStopEntry::query()->count());
    }

    // ============ Who may, and who may not ============

    public function test_the_sheet_is_closed_to_anyone_not_signed_in(): void
    {
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/v1/kitchen/stop-list')->assertStatus(401);
    }

    public function test_a_waiter_reads_the_sheet_and_cannot_write_to_it(): void
    {
        $waiter = User::factory()->create();
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        /*
         * Reading is the waiter's whole job here: "do you have Manti" is answered
         * at the table, not by walking to the pass. Writing is not — a floor that
         * can 86 a dish can 86 the expensive ones on a slow night, and the kitchen
         * finds out from the guest.
         */
        $this->fromTheChilonzorPass()->getJson('/api/v1/kitchen/stop-list')->assertOk();

        $this->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => 'menga yoqmadi',
        ])->assertStatus(403);

        $this->deleteJson("/api/v1/kitchen/stop-list/{$this->manti->id}")->assertStatus(403);

        $this->assertSame(0, MenuStopEntry::query()->count());
    }

    /*
     * The reason this endpoint lives in Kitchen and writes through a Menu
     * contract: `kitchen.update` is enough, and no menu permission is required at
     * all.
     *
     * Proven with a kitchen-only identity rather than with the seeded `chef`,
     * deliberately. The chef holds `menu.*` too — they own the menu screens, and
     * `DesignRoleMatrixTest` pins that down — so a chef succeeding here says
     * nothing about which of their two permissions the route asked for. A role
     * carrying exactly `kitchen.view` and `kitchen.update` can only succeed if the
     * gate is the kitchen's, which is what makes the write safe to give a cook:
     * they can say "we're out of Manti" tonight and can never change what Manti
     * costs.
     */
    public function test_stopping_a_dish_needs_kitchen_rights_and_no_menu_rights_at_all(): void
    {
        $screen = Role::findOrCreate('kds-wall-screen', 'web');
        $screen->syncPermissions(
            Permission::query()->whereIn('name', ['kitchen.view', 'kitchen.update'])->get()
        );
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        // Named guard, because Sanctum's API tokens and the console session share
        // the `web` guard here and a permission checked against the wrong one is a
        // permission that silently answers no.
        $this->assertFalse($screen->hasPermissionTo('menu.update', 'web'), 'The proof is void if this role can reprice a dish');
        $this->assertFalse($screen->hasPermissionTo('menu.view', 'web'), 'The sheet must not need the menu module either');

        $cook = User::factory()->create(['name' => 'Oshpaz Sardor']);
        $cook->assignRole($screen);
        $this->actingAs($cook);

        $stopped = $this->fromTheChilonzorPass()->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "go'sht tugadi",
        ]);

        $stopped->assertOk()->assertJsonPath('changed', true);
        $this->assertTrue($this->lineFor($stopped, $this->manti)['is_stopped']);
        $this->assertSame('Oshpaz Sardor', $this->lineFor($stopped, $this->manti)['stopped_by']);

        $this->deleteJson("/api/v1/kitchen/stop-list/{$this->manti->id}")
            ->assertOk()
            ->assertJsonPath('changed', true);
    }

    // ============ Which kitchen ============

    /*
     * A write with no `X-Branch` is refused, not applied everywhere.
     *
     * This chef is pinned to no venue — head office, or an owner's account — so
     * `ResolveBranch` has nothing to fill in and the branch genuinely is unknown.
     * Guessing "all of them" here means one tap emptying five kitchens' menus,
     * and "off everywhere" is a different act with a different audit trail:
     * `menu_items.is_available`, and an owner's decision.
     */
    public function test_a_write_that_names_no_kitchen_is_refused_with_branch_required(): void
    {
        $this->assertNull($this->chef->branch_id, 'This case only exists for somebody not pinned to a venue');

        $this->postJson('/api/v1/kitchen/stop-list', [
            'menu_item_id' => $this->manti->id,
            'reason' => "go'sht tugadi",
        ])->assertApiError('request.branch_required', 'X-Branch');

        $this->deleteJson("/api/v1/kitchen/stop-list/{$this->manti->id}")
            ->assertApiError('request.branch_required', 'X-Branch');

        // Refused means nothing was written — not written and then hidden.
        $this->assertSame(0, MenuStopEntry::query()->count());
    }

    // ============ What the KDS listens to ============

    public function test_a_kitchen_docket_names_the_branch_whose_channel_its_screen_listens_on(): void
    {
        /*
         * The KDS subscribes to `branch.{id}.stoplist` and to its own ticket
         * channel, and it can only learn that id from the payload. Taking it from
         * whoever is signed in is right only for a cook pinned to one venue and
         * silently wrong for anyone reading across several — and the symptom is a
         * screen that looks idle rather than one that looks broken, so nobody
         * reports it. The food simply stops going out.
         */
        $ticket = KitchenTicket::factory()->create();

        $this->assertSame($this->chilonzor->id, $ticket->branch_id, 'A docket is made where it is cooked');

        $this->fromTheChilonzorPass()
            ->getJson("/api/v1/kitchen/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.branch_id', $this->chilonzor->id);

        $this->getJson('/api/v1/kitchen/tickets')
            ->assertOk()
            ->assertJsonPath('data.0.branch_id', $this->chilonzor->id);
    }
}

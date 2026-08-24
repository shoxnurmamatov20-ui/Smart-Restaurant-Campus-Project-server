<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Contracts\Menu\StopList;
use App\Contracts\Menu\StoppedDish;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Modules\Menu\Events\DishResumed;
use Modules\Menu\Events\DishStopped;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\MenuStopEntry;
use Tests\TestCase;

/**
 * 86 — the sheet that says what this kitchen has run out of tonight.
 *
 * Five properties, and a restaurant feels every one of them the day it breaks:
 *
 * **Per kitchen.** Manti runs out in Chilonzor; Termiz still has it and is still
 * selling it. One shared flag would take a dish off five menus because one
 * kitchen ran out of one ingredient, and the chef in Termiz would have no way to
 * put it back without putting it back everywhere.
 *
 * **A double tap is silent.** Two cooks tapping the same tile within a second of
 * each other is the normal case at the pass. The second tap must not open a
 * second row and must not redraw every tablet in the building.
 *
 * **Restating the reason is not a double tap.** Extending "back at six" to "back
 * at eight" is news every screen needs, and a write that answered "nothing
 * changed" to it would leave waiters promising the earlier time.
 *
 * **Rows close, they never disappear.** "What was off last Friday and who put it
 * back" is a food-cost question a manager asks on Monday, and a table that
 * deletes its history cannot answer it.
 *
 * **Expiry runs on the clock.** "No more lamb until the evening delivery" has to
 * come back by itself, because at midnight there is nobody left to remember it.
 *
 * Driven through `App\Contracts\Menu\StopList` out of the container rather than
 * through the service class, because the contract is what the kitchen's wall
 * screen, the POS and Orders actually hold. Behaviour that only the concrete
 * class offers is behaviour nothing outside this module can reach.
 */
final class StopListTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $termiz;

    private MenuCategory $section;

    private User $chef;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        /*
         * Two venues of one restaurant, which is the shape the whole feature
         * exists for. A single-branch fixture would pass every assertion here
         * and still hide the bug that matters — one kitchen's shortage taking a
         * dish off the other kitchen's menu.
         */
        $this->chilonzor = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $this->termiz = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Termiz', 'slug' => 'termiz',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(BranchContext::class)->set($this->chilonzor);

        $this->section = MenuCategory::factory()->create(['tenant_id' => $this->tenant->id]);

        /*
         * A name rather than a faker one: the sheet's whole job in service is to
         * answer "who took this off, so who do I ask about it", and the name is
         * fetched through a join to `public.users` rather than a relation. When
         * that join breaks the assertion should read like the wall screen, not
         * like a random person.
         */
        $this->chef = User::factory()->create(['name' => 'Oshpaz Aziz']);
        $this->actingAs($this->chef);
    }

    private function stops(): StopList
    {
        return app(StopList::class);
    }

    /** One dish on the menu of the restaurant this test is standing in. */
    private function dish(string $sku = 'MNT', string $uz = 'Manti', string $station = 'hot'): MenuItem
    {
        return MenuItem::factory()
            ->dish($sku, $uz, $uz, $uz, 4_000_000, $station)
            ->create(['menu_category_id' => $this->section->id]);
    }

    public function test_a_stopped_dish_appears_on_the_sheet_with_who_stopped_it_and_why(): void
    {
        $manti = $this->dish();

        $this->assertTrue($this->stops()->stop($manti->id, "qo'y go'shti tugadi"));

        // The ids are what a POS greys tiles out with; the sheet is what a chef
        // reads. Both come from the same rows, and a feature that got one right
        // and the other wrong shows a waiter a dish the kitchen cannot cook.
        $this->assertSame([$manti->id], $this->stops()->stoppedItemIds());

        $sheet = $this->stops()->current();
        $this->assertCount(1, $sheet);

        $line = $sheet[0];
        $this->assertInstanceOf(StoppedDish::class, $line);
        $this->assertSame($manti->id, $line->dishId);
        $this->assertSame('Manti', $line->title);
        // The sheet is read station by station — a grill cook takes grill dishes
        // off — so a line with no station is a line nobody is responsible for.
        $this->assertSame('hot', $line->station);
        $this->assertSame('Oshpaz Aziz', $line->stoppedBy);
        $this->assertSame("qo'y go'shti tugadi", $line->reason);
        $this->assertNull($line->until);
    }

    public function test_a_dish_off_in_one_kitchen_is_still_selling_in_the_other(): void
    {
        $manti = $this->dish();

        $this->assertTrue($this->stops()->stop($manti->id, "go'sht tugadi"));

        app(BranchContext::class)->set($this->termiz);

        $this->assertSame([], $this->stops()->stoppedItemIds(), 'Termiz has Manti and is selling it');
        $this->assertSame([], $this->stops()->current());

        /*
         * And when Termiz runs out too, that is its own row.
         *
         * The partial unique index is on (tenant, branch, dish), so a second
         * venue stopping the same dish must not collide with the first. If it
         * did, the second kitchen's tap would fail with a constraint violation
         * on a wall screen mid-service.
         */
        $this->assertTrue($this->stops()->stop($manti->id, 'bizda ham tugadi'));
        $this->assertSame([$manti->id], $this->stops()->stoppedItemIds());

        app(BranchContext::class)->set($this->chilonzor);
        $this->assertSame([$manti->id], $this->stops()->stoppedItemIds());

        $this->assertSame(
            2,
            MenuStopEntry::query()->withoutGlobalScope('branch')->count(),
            'One row per kitchen, not one row shared between them',
        );
    }

    public function test_a_second_cook_tapping_the_same_tile_changes_nothing(): void
    {
        Event::fake([DishStopped::class]);

        $manti = $this->dish();

        $this->assertTrue($this->stops()->stop($manti->id, "go'sht tugadi"));
        $this->assertFalse(
            $this->stops()->stop($manti->id, "go'sht tugadi"),
            'Already off on the same terms — nothing to announce',
        );

        // One row, because the second tap has to become an update and not an
        // insert: a stray second open row survives the first `clear` and leaves
        // a dish off the menu after somebody has already put it back.
        $this->assertSame(1, MenuStopEntry::query()->count());

        // And one broadcast. A redraw of every tablet in the building because a
        // colleague double-tapped is how a busy pass starts flickering.
        Event::assertDispatchedTimes(DishStopped::class, 1);
    }

    public function test_restating_the_reason_or_extending_the_expiry_is_a_change_worth_announcing(): void
    {
        Event::fake([DishStopped::class]);

        $lamb = $this->dish('SHK', "Qo'y shashlik", 'grill');

        $this->assertTrue($this->stops()->stop($lamb->id, "go'sht tugadi"));

        // Same dish, better reason. A waiter reading "out of stock" tells a guest
        // something different from a waiter reading "kechqurun yetkazib berishda".
        $this->assertTrue($this->stops()->stop($lamb->id, 'kechqurun yetkazib berishda'));

        // And now a time on it. This is the one every screen must hear: a tile
        // that says nothing about when it comes back has waiters guessing, and
        // the guess they make is the earlier one.
        $until = now()->addHours(2)->startOfSecond();
        $this->assertTrue($this->stops()->stop($lamb->id, 'kechqurun yetkazib berishda', $until));

        $this->assertSame(1, MenuStopEntry::query()->count(), 'Still one open stop, updated in place');

        $row = MenuStopEntry::query()->sole();
        $this->assertSame('kechqurun yetkazib berishda', $row->reason);
        $this->assertSame($until->toIso8601String(), $row->stopped_until?->toIso8601String());

        Event::assertDispatchedTimes(DishStopped::class, 3);
    }

    public function test_a_timed_stop_comes_back_on_the_clock_with_nobody_writing_anything(): void
    {
        $lamb = $this->dish('SHK', "Qo'y shashlik", 'grill');

        $this->assertTrue($this->stops()->stop($lamb->id, 'yetkazib berishgacha', now()->addMinutes(30)));
        $this->assertSame([$lamb->id], $this->stops()->stoppedItemIds());

        $this->travel(31)->minutes();

        /*
         * Half past the hour it was promised back, and it is back.
         *
         * Nothing ran in between — no job, no chef, no request. Without the
         * clock being part of the read, "no lamb until six" would still be
         * keeping lamb off the menu at midnight, and the only way back would be
         * somebody noticing the next morning.
         */
        $this->assertSame([], $this->stops()->stoppedItemIds());
        $this->assertSame([], $this->stops()->current());

        // The row is untouched — expiry is a fact about the clock, not a write.
        $this->assertNull(MenuStopEntry::query()->sole()->cleared_at);
    }

    public function test_putting_a_dish_back_closes_its_row_and_names_who_did_it(): void
    {
        $manti = $this->dish();
        $this->assertTrue($this->stops()->stop($manti->id, "go'sht tugadi"));

        // The manager puts it back after the delivery arrives, not the cook who
        // took it off. Those are two different people in the story a food-cost
        // review reconstructs, so they are two different columns.
        $manager = User::factory()->create(['name' => 'Menejer Dilnoza']);
        $this->actingAs($manager);

        $this->assertTrue($this->stops()->clear($manti->id));
        $this->assertSame([], $this->stops()->stoppedItemIds());

        $row = MenuStopEntry::query()->sole();
        $this->assertNotNull($row->cleared_at, 'Closed, not deleted — the sheet is the history');
        $this->assertSame($manager->id, $row->cleared_by);
        $this->assertSame($this->chef->id, $row->stopped_by);
    }

    public function test_putting_back_a_dish_that_was_never_off_announces_nothing(): void
    {
        Event::fake([DishResumed::class]);

        $manti = $this->dish();

        $this->assertFalse($this->stops()->clear($manti->id));

        // A tile that flashes "Manti is back" at a floor that never lost it
        // teaches waiters to ignore the notifications that do matter.
        Event::assertNotDispatched(DishResumed::class);
        $this->assertSame(0, MenuStopEntry::query()->count());
    }

    public function test_nothing_can_be_stopped_from_outside_a_kitchen(): void
    {
        $manti = $this->dish();

        app(BranchContext::class)->clear();

        /*
         * "Off everywhere" is a different act with a different audit trail —
         * `menu_items.is_available`, an owner's decision — and a request with no
         * branch is refused rather than guessed at. Guessing here means one
         * head-office click emptying every kitchen's menu.
         */
        $this->assertFalse($this->stops()->stop($manti->id, "go'sht tugadi"));
        $this->assertSame(0, MenuStopEntry::query()->count());
    }

    public function test_a_read_across_the_whole_business_carries_no_stop_list(): void
    {
        $manti = $this->dish();
        $this->assertTrue($this->stops()->stop($manti->id, "go'sht tugadi"));

        app(BranchContext::class)->clear();

        // An owner comparing venues is not standing at a pass, and no single 86
        // sheet is true for them. Answering with Chilonzor's would be worse than
        // answering with nothing: it would read as the group being out of Manti.
        $this->assertSame([], $this->stops()->stoppedItemIds());
        $this->assertSame([], $this->stops()->current());

        // Nothing was hidden or cleared — the branch simply was not asked.
        $this->assertSame(1, MenuStopEntry::query()->count());
    }

    public function test_another_restaurants_stop_list_is_invisible_and_untouchable(): void
    {
        // The same dish on both menus, which is the case that hurts: two
        // restaurants selling Manti, and only one of them out of it.
        $ourManti = $this->dish();

        $cityCafe = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($cityCafe);
        $theirBranch = Branch::query()->create([
            'tenant_id' => $cityCafe->id, 'name' => 'Yunusobod', 'slug' => 'yunusobod',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(BranchContext::class)->set($theirBranch);

        $theirSection = MenuCategory::factory()->create(['tenant_id' => $cityCafe->id]);
        $theirManti = MenuItem::factory()
            ->dish('MNT', 'Manti', 'Manti', 'Manti', 4_000_000)
            ->create(['tenant_id' => $cityCafe->id, 'menu_category_id' => $theirSection->id]);

        $this->assertTrue($this->stops()->stop($theirManti->id, 'ularda tugadi'));

        app(TenantContext::class)->set($this->tenant);
        app(BranchContext::class)->set($this->chilonzor);

        $this->assertNotContains($ourManti->id, $this->stops()->stoppedItemIds());
        $this->assertSame([], $this->stops()->stoppedItemIds());
        $this->assertSame([], $this->stops()->current());

        // Nor is their dish ours to touch: the write checks the dish is on THIS
        // restaurant's menu first, so a guessed id cannot reach across.
        $this->assertFalse($this->stops()->stop($theirManti->id, "go'sht tugadi"));
    }
}

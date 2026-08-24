<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Contracts\Menu\StopList;
use App\Contracts\Orders\BillRegistry;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use RuntimeException;
use Tests\TestCase;

/**
 * 86: what each audience is shown, and the one place it is enforced.
 *
 * A chef pulls Manti at seven in the evening and three different screens have to
 * answer differently about the same dish. `sellable()` REMOVES it, because a
 * guest offered something the kitchen cannot cook is a guest who orders it and
 * then waits for it. `board()` FLAGS it, because a waiter shown the dish crossed
 * out knows the answer to "do you have Manti" without walking to the pass — and
 * a tile that silently vanishes makes them think they misremembered the menu.
 * And `BillRegistry::addLine()` refuses it outright, which is the only one of the
 * three that is a rule rather than a drawing.
 *
 * That last one is what these tests exist for. Greying out a tile protects
 * exactly the people looking at the tile: it does nothing for a tablet that was
 * asleep when the chef tapped, for an offline queue draining a shift rung up
 * before the stop, or for an aggregator posting straight to the API with no tile
 * to grey. Every one of those ends the same way — a docket on the pass for a dish
 * that cannot be made, discovered by a guest.
 *
 * A stop-list is a fact about ONE kitchen, so every fixture here lives in a
 * branch and every request names one. Chilonzor running out of lamb must not
 * take lamb off the menu in Termiz.
 */
final class StopListEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    private MenuItem $osh;

    private MenuItem $manti;

    private MenuItem $tea;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);

        app(BranchContext::class)->set($this->branch);

        // Two headings, three dishes, and one heading with a single dish under
        // it — the drinks section is what disappears when its only dish is off.
        $national = $this->section('milliy-taomlar', 'Milliy taomlar', sortOrder: 10);
        $this->osh = $this->dish($national, 'OSH-001', 'Osh', 4_500_000, sortOrder: 10);
        $this->manti = $this->dish($national, 'MNT-001', 'Manti', 4_000_000, sortOrder: 20);

        $drinks = $this->section('ichimliklar', 'Ichimliklar', sortOrder: 20);
        $this->tea = $this->dish($drinks, 'CHY-001', "Ko'k choy", 800_000, sortOrder: 10, station: 'bar');
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    // ============ Fixtures ============

    private function section(string $slug, string $uz, int $sortOrder, ?MenuCategory $parent = null): MenuCategory
    {
        return MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id,
            'parent_id' => $parent?->id,
            'slug' => $slug,
            'name' => ['uz' => $uz, 'ru' => $uz, 'en' => $uz],
            'sort_order' => $sortOrder,
            'is_active' => true,
        ]);
    }

    /**
     * A sellable dish. Price in tiyin — 4_500_000 is 45 000 so'm.
     *
     * `sort_order` is always given rather than left to the factory's random
     * value, because these tests read dishes by position (`sections.0.items.1`)
     * and a random order turns a real regression into a coin toss.
     */
    private function dish(
        MenuCategory $section,
        string $sku,
        string $uz,
        int $priceTiyin,
        int $sortOrder,
        string $station = 'hot',
    ): MenuItem {
        return MenuItem::factory()
            ->dish($sku, $uz, $uz, $uz, $priceTiyin, $station)
            ->create([
                'tenant_id' => $this->tenant->id,
                'menu_category_id' => $section->id,
                'sort_order' => $sortOrder,
                'is_available' => true,
                'status' => 'active',
                'stopped_until' => null,
            ]);
    }

    /**
     * Put the restaurant AND the venue back after an HTTP call.
     *
     * `ResolveBranch` clears the branch context in a `finally` — right under
     * php-fpm, where a worker holding the last request's venue would serve it to
     * the next — and the test harness only puts the restaurant back. Without
     * this, a stop written after a request lands with `branch_id` null: a row
     * that stops nothing in any kitchen, which reads as the whole feature being
     * broken rather than as a test that forgot where it was standing.
     */
    private function inBranch(): void
    {
        app(TenantContext::class)->set($this->tenant);
        app(BranchContext::class)->set($this->branch);
    }

    private function stop(MenuItem $dish, string $reason = "Go'sht tugadi"): void
    {
        // Asserted rather than called and forgotten: `stop()` answers false when
        // the request has no branch, and a silent false would leave every
        // assertion below passing against a menu nobody had 86'd anything on.
        $this->assertTrue(
            app(StopList::class)->stop($dish->id, $reason),
            "The 86 sheet refused to take {$dish->sku}, so nothing below is being tested.",
        );
    }

    // ============ Reading the menu ============

    /** @return array<int, string> */
    private function sellableSkus(): array
    {
        $skus = [];

        foreach (app(MenuCatalog::class)->sellable() as $section) {
            foreach ($section->dishes as $dish) {
                $skus[] = $dish->sku;
            }
        }

        return $skus;
    }

    /**
     * Every dish the till would draw, and whether it is crossed out.
     *
     * @return array<string, bool>
     */
    private function boardFlags(): array
    {
        $flags = [];

        foreach (app(MenuCatalog::class)->board() as $section) {
            foreach ($section->dishes as $dish) {
                $flags[$dish->sku] = $dish->isStopped;
            }
        }

        return $flags;
    }

    /**
     * @param array<int, Section> $sections
     *
     * @return array<int, string>
     */
    private function slugsOf(array $sections): array
    {
        return array_map(static fn (Section $section): string => $section->slug, $sections);
    }

    private function guestMenu(): TestResponse
    {
        $response = $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'X-Branch' => $this->branch->slug,
            // The QR menu is cached per locale; an empty Accept-Language keeps
            // the payload on the restaurant's own language whatever the client
            // asked for.
            'Accept-Language' => '',
        ])->getJson('/api/v1/public/menu');

        $this->inBranch();

        return $response;
    }

    /** A till, paired and with a cashier signed in on it. */
    private function signInAtTill(): string
    {
        $this->inBranch();

        $terminal = Terminal::factory()->create(['code' => 'KASSA-1']);
        $deviceToken = $terminal->createToken('pos-terminal-test', ['pos:terminal'])->plainTextToken;

        $cashier = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
        ]);
        $cashier->assignRole('cashier');
        app(PinAuthenticator::class)->setPin($cashier, '4821');

        $token = $this->bearer($deviceToken)
            ->postJson('/api/v1/pos/auth/pin', ['user_id' => $cashier->id, 'pin' => '4821'])
            ->assertCreated()
            ->json('token');

        $this->inBranch();

        return (string) $token;
    }

    /**
     * Swap the bearer token for the next request.
     *
     * The guard flush is not optional: Sanctum's RequestGuard caches the user it
     * resolved and a feature test reuses one container, so without it the board
     * request is still authenticated as the device rather than the cashier.
     */
    private function bearer(string $token): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => $this->tenant->slug,
            'X-Branch' => $this->branch->slug,
        ]);
    }

    private function tillBoard(string $token): TestResponse
    {
        $response = $this->bearer($token)->getJson('/api/v1/pos/menu');

        $this->inBranch();

        return $response;
    }

    // ============ Removed for a guest, crossed out for a waiter ============

    public function test_a_stopped_dish_leaves_the_sellable_menu_and_is_flagged_on_the_board(): void
    {
        $this->stop($this->manti);

        $sellable = $this->sellableSkus();

        $this->assertContains('OSH-001', $sellable);
        $this->assertNotContains('MNT-001', $sellable, 'A guest was still being offered a dish the kitchen pulled.');

        $flags = $this->boardFlags();

        // Three tiles on the till, not two. A waiter whose Manti button simply
        // vanished assumes they are on the wrong category and goes looking.
        $this->assertCount(3, $flags, 'The board must draw every dish, stopped or not.');
        $this->assertTrue($flags['MNT-001']);

        // And only the one that is actually off. A flag that leaks onto its
        // neighbours crosses out a menu the kitchen can cook perfectly well.
        $this->assertFalse($flags['OSH-001']);
        $this->assertFalse($flags['CHY-001']);
    }

    public function test_a_section_whose_every_dish_is_off_disappears_for_a_guest_but_not_for_a_till(): void
    {
        // Drinks has exactly one dish, so stopping the tea empties the heading.
        $this->stop($this->tea, 'Choy tugadi');

        $catalogue = app(MenuCatalog::class);

        // A heading with nothing under it is noise on a phone — the guest
        // scrolls past "Ichimliklar" and finds an empty gap.
        $this->assertSame(['milliy-taomlar'], $this->slugsOf($catalogue->sellable()));

        // The till keeps the heading, because that is where the cashier goes to
        // find out whether the tea is back yet.
        $this->assertSame(['milliy-taomlar', 'ichimliklar'], $this->slugsOf($catalogue->board()));
        $this->assertTrue($this->boardFlags()['CHY-001']);
    }

    // ============ Enforcement, not decoration ============

    /**
     * The tile is a drawing; this is the rule.
     *
     * Nothing on the client side is between a stopped dish and the pass. The
     * tablet that was asleep when the chef tapped, the offline queue draining a
     * shift rung up an hour ago, the aggregator posting straight to the API —
     * none of them ever saw a greyed-out tile, and all three reach this method.
     */
    public function test_a_stopped_dish_is_refused_on_a_bill_and_the_refusal_names_the_dish(): void
    {
        $registry = app(BillRegistry::class);
        $bill = $registry->open('dine_in', tableLabel: 'A-4', guests: 2);

        $this->stop($this->manti);

        try {
            $registry->addLine($bill->id, $this->manti->id, 2);

            $this->fail('A dish on the stop-list was added to a bill and will reach the kitchen.');
        } catch (RuntimeException $refusal) {
            /*
             * By name, because a waiter is reading this out loud to a guest.
             * "Manti hozir stop-listda" is a sentence; "menu_item 41
             * unavailable" is something they have to translate at the table.
             */
            $this->assertStringContainsString('Manti', $refusal->getMessage());
        }

        $refreshed = $registry->find($bill->id);

        $this->assertNotNull($refreshed);
        $this->assertSame([], $refreshed->lines, 'The refused line was written anyway.');
        $this->assertSame(0, $refreshed->total);

        // The rest of the menu is untouched: one dish being off must not stop
        // the table ordering everything else on it.
        $withOsh = $registry->addLine($bill->id, $this->osh->id, 2);

        $this->assertSame(9_000_000, $withOsh->total);
    }

    // ============ The guest-facing menu ============

    public function test_the_guest_menu_marks_a_stopped_dish_at_every_level_of_the_tree(): void
    {
        /*
         * This test used to assert the opposite, and the opposite was the bug.
         *
         * A dish the kitchen 86'd was *dropped* from the guest payload, so on a
         * phone it did not go grey — it vanished. A guest who came for the somsa
         * read a menu that had never had one, and the only way to find out was to
         * ask a waiter. Every guest screen was already built to draw a dimmed row
         * with "Bugun tugadi" on it (`GuestDish.soldOut`); the endpoint was the
         * half that never sent the flag.
         *
         * The sub-heading is still here because a second bug lived one level
         * down: `children.items` was not eager-loaded, so reading it to decide
         * whether a heading was empty lazy-loaded it UNFILTERED, and every draft
         * and archived dish was serialised under every sub-heading.
         */
        $grill = $this->section('shashliklar', 'Shashliklar', sortOrder: 30);
        $lamb = $this->section('qoy-goshti', "Qo'y go'shti", sortOrder: 10, parent: $grill);
        $skewer = $this->dish($lamb, 'SHK-001', "Qo'y shashlik", 3_500_000, sortOrder: 10, station: 'grill');
        $this->dish($lamb, 'TVK-001', 'Tovuq shashlik', 2_800_000, sortOrder: 20, station: 'grill');

        $this->stop($this->manti);
        $this->stop($skewer, 'Qo\'y tugadi');

        $response = $this->guestMenu()->assertOk();

        // Top level: both dishes come down, in menu order, and Manti says why.
        $response->assertJsonCount(2, 'data.0.items');
        $response->assertJsonPath('data.0.items.0.sku', 'OSH-001');
        $response->assertJsonPath('data.0.items.0.is_available', true);
        $response->assertJsonPath('data.0.items.0.is_stopped', false);

        $response->assertJsonPath('data.0.items.1.sku', 'MNT-001');
        $response->assertJsonPath('data.0.items.1.is_stopped', true);
        // The two keys a guest screen actually reads. Both, because a screen
        // that trusted one while the other still said yes would draw an add
        // button on a dish the kitchen cannot cook.
        $response->assertJsonPath('data.0.items.1.is_available', false);
        $response->assertJsonPath('data.0.items.1.is_orderable', false);

        // One level down, marked by the same rule.
        $response->assertJsonCount(0, 'data.2.items');
        $response->assertJsonCount(2, 'data.2.children.0.items');
        $response->assertJsonPath('data.2.children.0.items.0.sku', 'SHK-001');
        $response->assertJsonPath('data.2.children.0.items.0.is_available', false);
        $response->assertJsonPath('data.2.children.0.items.1.sku', 'TVK-001');
        $response->assertJsonPath('data.2.children.0.items.1.is_available', true);
    }

    public function test_a_dish_the_business_withdrew_is_still_absent_from_the_guest_menu(): void
    {
        /*
         * The other half of the sentence above, and the reason the two flags are
         * not one flag.
         *
         * `menu_items.is_available = false` means the business does not sell this
         * — a seasonal dish, one the owner pulled from the card. There is nothing
         * to tell a guest about a dish the restaurant no longer has, so it stays
         * out of the payload entirely. "We are out of it tonight" is the case
         * that gets a dimmed row.
         */
        $this->osh->update(['is_available' => false, 'stopped_until' => null]);

        $response = $this->guestMenu()->assertOk();

        $response->assertJsonMissing(['sku' => 'OSH-001']);
        $response->assertJsonPath('data.0.items.0.sku', 'MNT-001');
    }

    // ============ The till ============

    public function test_the_till_board_answers_is_stopped_rather_than_omitting_the_dish(): void
    {
        $token = $this->signInAtTill();

        $this->stop($this->manti);

        $response = $this->tillBoard($token)->assertOk();

        // Both headings and all three dishes still come down the wire — the
        // count the till would otherwise get wrong the first time a section
        // emptied out.
        $response->assertJsonPath('meta.sections', 2);
        $response->assertJsonPath('meta.dishes', 3);

        $response->assertJsonPath('sections.0.items.1.sku', 'MNT-001');
        $response->assertJsonPath('sections.0.items.1.is_stopped', true);
        $response->assertJsonPath('sections.0.items.0.is_stopped', false);
        $response->assertJsonPath('sections.1.items.0.is_stopped', false);
    }

    // ============ Back on ============

    public function test_clearing_the_stop_puts_the_dish_back_for_everyone(): void
    {
        $this->stop($this->manti);

        $this->assertNotContains('MNT-001', $this->sellableSkus());

        $this->assertTrue(app(StopList::class)->clear($this->manti->id), 'The 86 sheet would not release Manti.');

        $this->assertContains('MNT-001', $this->sellableSkus());
        $this->assertFalse($this->boardFlags()['MNT-001']);

        // The guest menu is cached and the QR code in the room is the slowest
        // screen to hear about anything, so this is the assertion that says the
        // stop being lifted actually reached the table.
        $guest = $this->guestMenu()->assertOk();
        $guest->assertJsonCount(2, 'data.0.items');
        $guest->assertJsonPath('data.0.items.1.sku', 'MNT-001');

        $token = $this->signInAtTill();
        $this->tillBoard($token)->assertOk()->assertJsonPath('sections.0.items.1.is_stopped', false);

        // And the line the registry refused half a minute ago now goes on.
        $registry = app(BillRegistry::class);
        $bill = $registry->open('dine_in', tableLabel: 'A-4');

        $this->assertSame(4_000_000, $registry->addLine($bill->id, $this->manti->id, 1)->total);
    }
}

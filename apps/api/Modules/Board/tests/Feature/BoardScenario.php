<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Board\Models\BoardColumn;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * One restaurant, two counters, a menu with three sections.
 *
 * The fixture every Board test starts from, and the second branch is the point
 * of it rather than decoration: a board is a wall in one room, so almost every
 * property worth proving here is about the row landing at the right address.
 *
 * The Menu import is deliberate and allowed. `ModuleBoundaryTest` skips
 * `/tests/` explicitly — "tests may reach for another module's factory to build
 * a fixture; that is arranging a scenario, not a runtime dependency" — and this
 * module's whole reason to exist is what it does with somebody else's
 * catalogue. Nothing under `app/` imports Menu; `BoardComposer` goes through
 * `App\Contracts\Menu\MenuCatalog`.
 *
 * Not named `*Test`, so PHPUnit does not try to run it.
 */
abstract class BoardScenario extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected Branch $chilonzor;

    protected Branch $termiz;

    protected MenuCategory $national;

    protected MenuCategory $grill;

    protected MenuCategory $drinks;

    protected MenuItem $plov;

    protected MenuItem $lamb;

    protected MenuItem $tea;

    protected User $manager;

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
        $this->termiz = Branch::factory()->named('Termiz', 'TRM')
            ->create(['tenant_id' => $this->tenant->id]);

        app(BranchContext::class)->set($this->chilonzor);

        /*
         * Three sections with a dish each.
         *
         * A dish each and not none: `MenuCatalog::board()` drops a section with
         * nothing under it, so a fixture of empty categories would make every
         * column in these tests point at a section the catalogue does not offer
         * — and the store endpoint would refuse rows the tests need.
         */
        $this->national = $this->section('milliy-taomlar', 'Milliy taomlar', 'Национальная кухня', 'Uzbek kitchen', 1);
        $this->grill = $this->section('shashliklar', 'Shashliklar', 'Шашлыки', 'Grill', 2);
        $this->drinks = $this->section('ichimliklar', 'Ichimliklar', 'Напитки', 'Drinks', 3);

        $this->plov = $this->dish('OSH', 'Osh', 'Плов', 'Plov', 48_000_00, $this->national);
        $this->lamb = $this->dish('SHK', "Qo'y shashlik", 'Шашлык', 'Lamb kebab', 46_000_00, $this->grill);
        $this->tea = $this->dish('CHOY', "Ko'k choy", 'Зелёный чай', 'Green tea', 8_000_00, $this->drinks);

        $this->manager = $this->userWithRole('branch-manager');
        $this->actingAs($this->manager);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    // ============ Fixture builders ============

    protected function section(string $slug, string $uz, string $ru, string $en, int $order): MenuCategory
    {
        return MenuCategory::factory()
            ->named($slug, $uz, $ru, $en)
            ->create(['tenant_id' => $this->tenant->id, 'sort_order' => $order]);
    }

    protected function dish(string $sku, string $uz, string $ru, string $en, int $tiyin, MenuCategory $section): MenuItem
    {
        return MenuItem::factory()
            ->dish($sku, $uz, $ru, $en, $tiyin)
            ->create(['menu_category_id' => $section->id, 'sort_order' => 1]);
    }

    /** A configured column at this counter, pointing at a section by id. */
    protected function column(int $menuCategoryId, int $position = 0, string $accent = '#7FB0FF'): BoardColumn
    {
        return BoardColumn::create([
            'menu_category_id' => $menuCategoryId,
            'position' => $position,
            'accent' => $accent,
        ]);
    }

    protected function userWithRole(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);

        return $user;
    }

    /**
     * Every request says which counter it is about.
     *
     * A manager pinned to one venue never types this — `ResolveBranch` fills it
     * in from their own branch — but these users are not pinned, which is the
     * harder case and the one the writes refuse without.
     */
    protected function atChilonzor(): static
    {
        return $this->withHeader('X-Branch', $this->chilonzor->slug);
    }

    protected function atTermiz(): static
    {
        return $this->withHeader('X-Branch', $this->termiz->slug);
    }

    /**
     * Another restaurant entirely, with its own venue.
     *
     * @return array{0: Tenant, 1: Branch}
     */
    protected function rival(): array
    {
        $previous = app(TenantContext::class)->tenant();
        $previousBranch = app(BranchContext::class)->branch();

        $rival = Tenant::query()->create([
            'name' => 'Registon', 'slug' => 'registon', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($rival);

        $branch = Branch::factory()->named('Registon markaz', 'RGM')
            ->create(['tenant_id' => $rival->id]);

        app(BranchContext::class)->set($branch);

        // Restore before returning: a test that builds a rival is still a test
        // about this restaurant, and leaving the context pointed elsewhere makes
        // every fixture afterwards land in the wrong business.
        app(TenantContext::class)->set($previous);
        app(BranchContext::class)->set($previousBranch);

        return [$rival, $branch];
    }

    /**
     * Run something as if the request belonged to another restaurant.
     *
     * @template T
     *
     * @param callable(): T $work
     *
     * @return T
     */
    protected function asRestaurant(Tenant $tenant, ?Branch $branch, callable $work): mixed
    {
        $previousTenant = app(TenantContext::class)->tenant();
        $previousBranch = app(BranchContext::class)->branch();

        app(TenantContext::class)->set($tenant);
        app(BranchContext::class)->set($branch);

        try {
            return $work();
        } finally {
            app(TenantContext::class)->set($previousTenant);
            app(BranchContext::class)->set($previousBranch);
        }
    }
}

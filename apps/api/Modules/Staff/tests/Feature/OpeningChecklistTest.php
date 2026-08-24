<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Staff\Models\OpeningChecklistTick;
use Tests\TestCase;

/**
 * The venue's opening checklist, recorded.
 *
 * The console drew seven working tick boxes whose state lived in a browser tab:
 * refresh the page and the morning never happened. That is worse than no
 * checklist, because a list that looks recorded is one people believe there is
 * a trail of — and the whole reason a restaurant keeps one is the day somebody
 * asks to see it.
 */
final class OpeningChecklistTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private const DAY = '2026-08-22';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi-checklist', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->set(null);
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsManager(string $name = 'Dilshod'): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => $name]);
        $user->assignRole('branch-manager');
        $this->actingAs($user);

        return $user;
    }

    public function test_today_resolves_through_the_business_day(): void
    {
        // The router allows the word and every screen sends it; the controller
        // used to refuse it with a 422, so the panel was empty on a live till.
        $this->actingAsManager();

        $this->getJson('/api/v1/staff/opening-checklist/today', ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('meta.day', app(BusinessDay::class)->dateFor());
    }

    public function test_a_stranger_cannot_read_the_list(): void
    {
        $this->getJson('/api/v1/staff/opening-checklist/'.self::DAY)->assertStatus(401);
    }

    public function test_an_untouched_day_answers_seven_items_none_of_them_done(): void
    {
        $this->actingAsManager();

        // The SERVER owns which items exist. A checklist whose items are
        // defined in a browser is one that silently orphans every tick recorded
        // against the old wording.
        $this->getJson('/api/v1/staff/opening-checklist/'.self::DAY)
            ->assertOk()
            ->assertJsonCount(count(OpeningChecklistTick::ITEMS), 'data')
            ->assertJsonPath('data.0.done', false)
            ->assertJsonPath('data.0.by', null)
            ->assertJsonPath('meta.done', 0)
            ->assertJsonPath('meta.total', count(OpeningChecklistTick::ITEMS));
    }

    public function test_a_tick_is_recorded_with_who_and_when(): void
    {
        $this->actingAsManager('Sardor');

        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, [
            'item' => 'fridge_temps',
            'done' => true,
        ])
            ->assertOk()
            ->assertJsonPath('meta.done', 1);

        $row = OpeningChecklistTick::query()->firstOrFail();

        $this->assertSame('fridge_temps', $row->item);
        // The name as it read that morning: a person who leaves in April did
        // still log the fridges in March.
        $this->assertSame('Sardor', $row->by_name);
        $this->assertSame(self::DAY, $row->business_day->toDateString());
    }

    public function test_pressing_the_same_box_twice_is_one_tick(): void
    {
        $this->actingAsManager();
        $body = ['item' => 'float_counted', 'done' => true];

        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, $body)->assertOk();
        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, $body)
            ->assertOk()
            // Two managers a second apart on a busy opening is the ordinary
            // case; without the unique index the list would read "9 / 7 done".
            ->assertJsonPath('meta.done', 1);

        $this->assertSame(1, OpeningChecklistTick::query()->count());
    }

    public function test_unticking_deletes_the_row_rather_than_storing_a_false(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, ['item' => 'dining_room', 'done' => true])
            ->assertOk();
        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, ['item' => 'dining_room', 'done' => false])
            ->assertOk()
            ->assertJsonPath('meta.done', 0);

        // An item nobody reached and an item somebody undid are the same state.
        $this->assertSame(0, OpeningChecklistTick::query()->count());
    }

    public function test_a_day_is_its_own_list(): void
    {
        $this->actingAsManager();
        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, ['item' => 'uniform_checked', 'done' => true])
            ->assertOk();

        $this->getJson('/api/v1/staff/opening-checklist/2026-08-23')
            ->assertOk()
            ->assertJsonPath('meta.done', 0);
    }

    public function test_an_item_the_server_does_not_declare_is_refused(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, ['item' => 'polish_the_cat', 'done' => true])
            ->assertStatus(422)
            ->assertApiValidationErrors('item');
    }

    public function test_a_malformed_day_comes_back_in_the_error_envelope(): void
    {
        $this->actingAsManager();

        $this->getJson('/api/v1/staff/opening-checklist/yesterday')
            ->assertStatus(422)
            ->assertJsonPath('error.field', 'day');
    }

    public function test_a_waiter_may_read_nothing_and_tick_nothing(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/staff/opening-checklist/'.self::DAY)->assertStatus(403);
        $this->postJson('/api/v1/staff/opening-checklist/'.self::DAY, ['item' => 'dining_room', 'done' => true])
            ->assertStatus(403);
    }

    public function test_another_restaurants_morning_is_invisible(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-checklist', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        OpeningChecklistTick::query()->create([
            'tenant_id' => $other->id, 'business_day' => self::DAY,
            'item' => 'dining_room', 'by_name' => 'Begona',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->actingAsManager();

        $this->getJson('/api/v1/staff/opening-checklist/'.self::DAY)
            ->assertOk()
            ->assertJsonPath('meta.done', 0);
    }

    public function test_two_venues_open_separately(): void
    {
        $chilonzor = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);
        $yunusobod = Branch::factory()->named('Yunusobod', 'YUN')->create(['tenant_id' => $this->tenant->id]);

        $this->actingAsManager();

        // Opening happens at an address: five venues open five times, and one
        // shared list would have the first manager to arrive tick the box for
        // everybody.
        $this->postJson(
            '/api/v1/staff/opening-checklist/'.self::DAY,
            ['item' => 'terminals_tested', 'done' => true],
            // `X-Branch` carries the venue's SLUG, not its id — see ResolveBranch.
            ['X-Branch' => $chilonzor->slug],
        )->assertOk()->assertJsonPath('meta.done', 1);

        $this->getJson(
            '/api/v1/staff/opening-checklist/'.self::DAY,
            ['X-Branch' => $yunusobod->slug],
        )->assertOk()->assertJsonPath('meta.done', 0);
    }
}

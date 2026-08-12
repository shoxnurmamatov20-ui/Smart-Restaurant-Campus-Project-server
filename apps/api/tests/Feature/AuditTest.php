<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The audit trail.
 *
 * Twenty models across eleven modules were already recording every change and
 * nothing could read a line of it. What is asserted here is what an owner
 * actually asks after an incident: who reduced that bill, who took the dish off
 * the menu, and — the one that decides whether any of it is admissible — that
 * the trail cannot be edited or read across restaurants.
 */
final class AuditTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => 'osh-markazi',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        // Fixtures built in PHP rather than over HTTP never pass through
        // ResolveTenant, so they would land with no restaurant at all. Setting
        // the context here is what production does on every request.
        app(TenantContext::class)->set($this->tenant);

        return $user;
    }

    /**
     * Forget everything recorded while setting the test up.
     *
     * Arranging a fixture is itself auditable — creating the signed-in user
     * writes a line, and a MenuItem factory drags a MenuCategory in with it.
     * Clearing here means a later count measures what the test *did*, not what
     * it needed in order to do it.
     */
    private function fromNowOn(): void
    {
        Activity::withoutGlobalScope('tenant')->delete();
    }

    /**
     * Write an audit line directly.
     *
     * Filtering tests care about the query, not about which models happen to
     * log what, so they state their fixtures outright.
     *
     * @param array<string, mixed> $attributes
     */
    private function entry(array $attributes = []): Activity
    {
        return Activity::query()->create($attributes + [
            'tenant_id' => $this->tenant->id,
            'log_name' => 'menu.item',
            'description' => 'Test yozuvi',
        ]);
    }

    // ============ Access ============

    public function test_the_trail_is_not_public(): void
    {
        $this->getJson('/api/v1/audit')->assertStatus(401);
    }

    public function test_a_waiter_cannot_read_the_trail(): void
    {
        $this->signIn('waiter');

        $this->getJson('/api/v1/audit')->assertStatus(403);
    }

    public function test_an_owner_can_read_the_trail(): void
    {
        $this->signIn('owner');

        $this->getJson('/api/v1/audit')->assertOk();
    }

    public function test_an_accountant_can_read_the_trail(): void
    {
        // Reconciling the till is exactly the job that needs the history.
        $this->signIn('accountant');

        $this->getJson('/api/v1/audit')->assertOk();
    }

    // ============ What gets recorded ============

    public function test_changing_a_price_leaves_a_line_naming_who_did_it(): void
    {
        $user = $this->signIn('owner');
        $item = MenuItem::factory()->create(['price' => 4500000]);

        $this->patchJson("/api/v1/menu/items/{$item->id}", ['price' => 5000000])->assertOk();

        $entry = collect($this->getJson('/api/v1/audit')->assertOk()->json('data'))
            ->firstWhere('event', 'updated');

        $this->assertNotNull($entry, 'A repricing must be recorded.');
        $this->assertSame('menu.item', $entry['log_name']);
        $this->assertSame('MenuItem', $entry['subject']['label']);
        $this->assertSame($item->id, $entry['subject']['id']);
        $this->assertSame($user->id, $entry['causer']['id']);

        // The before and after are the whole point of an audit line.
        $this->assertSame(4500000, $entry['changes']['old']['price']);
        $this->assertSame(5000000, $entry['changes']['new']['price']);
    }

    public function test_a_deletion_survives_the_thing_it_deleted(): void
    {
        $this->signIn('owner');
        $item = MenuItem::factory()->create();

        $this->deleteJson("/api/v1/menu/items/{$item->id}")->assertNoContent();

        $entry = collect($this->getJson('/api/v1/audit')->json('data'))
            ->firstWhere('event', 'deleted');

        $this->assertNotNull($entry, 'A deletion is the change most worth recording.');
        $this->assertSame($item->id, $entry['subject']['id']);
    }

    public function test_an_entry_with_no_person_behind_it_says_so(): void
    {
        // A Telegram webhook or a queued job has no signed-in user. Reporting
        // null is honest; inventing one would not be.
        Payment::factory()->create(['tenant_id' => $this->tenant->id]);

        $this->signIn('owner');

        $entry = collect($this->getJson('/api/v1/audit')->json('data'))
            ->firstWhere('log_name', 'finance.payment');

        $this->assertNotNull($entry);
        $this->assertNull($entry['causer']);
    }

    // ============ Filtering ============

    public function test_the_trail_can_be_narrowed_to_one_module(): void
    {
        $this->signIn('owner');
        $this->fromNowOn();

        $this->entry(['log_name' => 'menu.item']);
        $this->entry(['log_name' => 'finance.payment']);
        $this->entry(['log_name' => 'finance.payment']);

        $this->getJson('/api/v1/audit?filter[log_name]=finance.payment')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.log_name', 'finance.payment');
    }

    public function test_the_trail_can_be_narrowed_to_one_kind_of_change(): void
    {
        $this->signIn('owner');
        $item = MenuItem::factory()->create();
        $this->fromNowOn();

        $this->patchJson("/api/v1/menu/items/{$item->id}", ['price' => $item->price + 100000])->assertOk();

        $this->getJson('/api/v1/audit?filter[event]=updated')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.subject.id', $item->id);
    }

    public function test_the_trail_can_be_narrowed_to_one_record(): void
    {
        $this->signIn('owner');
        $watched = MenuItem::factory()->create();
        $this->fromNowOn();

        $this->patchJson("/api/v1/menu/items/{$watched->id}", ['price' => $watched->price + 100000])->assertOk();
        MenuItem::factory()->count(3)->create();

        $this->getJson("/api/v1/audit?filter[subject]=MenuItem&filter[subject_id]={$watched->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.subject.id', $watched->id);
    }

    public function test_the_trail_can_be_narrowed_to_one_person(): void
    {
        $owner = $this->signIn('owner');
        $colleague = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->fromNowOn();

        $this->entry(['causer_type' => User::class, 'causer_id' => $owner->id]);
        $this->entry(['causer_type' => User::class, 'causer_id' => $colleague->id]);
        $this->entry();

        $this->getJson("/api/v1/audit?filter[causer]={$owner->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.causer.id', $owner->id);
    }

    public function test_the_trail_separates_what_people_did_from_what_the_system_did(): void
    {
        $owner = $this->signIn('owner');
        $this->fromNowOn();

        $this->entry(['causer_type' => User::class, 'causer_id' => $owner->id]);
        $this->entry(['log_name' => 'system.backup', 'description' => 'Kechalik zaxira']);

        $this->getJson('/api/v1/audit?filter[by_people]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.causer.id', $owner->id);

        $this->getJson('/api/v1/audit?filter[by_people]=0')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.log_name', 'system.backup');
    }

    public function test_the_trail_can_be_narrowed_to_a_date_range(): void
    {
        $this->signIn('owner');
        $this->fromNowOn();

        $this->entry(['description' => 'Bugungi']);
        $this->entry(['description' => 'Eski yozuv', 'created_at' => now()->subMonths(3)]);

        $this->getJson('/api/v1/audit?filter[from]='.now()->subDay()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.description', 'Bugungi');

        $this->getJson('/api/v1/audit?filter[to]='.now()->subMonth()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.description', 'Eski yozuv');
    }

    public function test_the_newest_change_is_listed_first(): void
    {
        $this->signIn('owner');
        $this->fromNowOn();

        $this->entry(['log_name' => 'a.old', 'created_at' => now()->subDays(2)]);
        $this->entry(['log_name' => 'b.new', 'created_at' => now()]);

        $this->getJson('/api/v1/audit')
            ->assertOk()
            ->assertJsonPath('data.0.log_name', 'b.new');
    }

    public function test_the_page_size_is_capped(): void
    {
        $this->signIn('owner');
        MenuItem::factory()->count(3)->create();

        $this->getJson('/api/v1/audit?per_page=5000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    // ============ Facets ============

    public function test_the_ui_can_discover_what_is_filterable(): void
    {
        $this->signIn('owner');
        $item = MenuItem::factory()->create();
        $this->fromNowOn();

        Payment::factory()->create();
        // Derived from the current price: the factory picks a random dish, and a
        // hard-coded value that happens to match leaves nothing dirty to log.
        $this->patchJson("/api/v1/menu/items/{$item->id}", ['price' => $item->price + 100000])->assertOk();

        $response = $this->getJson('/api/v1/audit/facets')->assertOk();

        $this->assertContains('menu.item', $response->json('log_names'));
        $this->assertContains('finance.payment', $response->json('log_names'));
        $this->assertContains('created', $response->json('events'));
        $this->assertContains('updated', $response->json('events'));
        $this->assertContains('MenuItem', $response->json('subjects'));
        $this->assertContains('Payment', $response->json('subjects'));
        $this->assertSame(
            Activity::query()->count(),
            $response->json('total'),
            'The facet total must match what the trail actually holds.',
        );
    }

    public function test_facets_is_not_read_as_an_entry_id(): void
    {
        $this->signIn('owner');

        // Route order matters: /audit/facets must not resolve as /audit/{id}.
        $this->getJson('/api/v1/audit/facets')->assertOk()->assertJsonStructure(['log_names']);
    }

    // ============ One entry ============

    public function test_a_single_entry_can_be_opened(): void
    {
        $this->signIn('owner');
        $this->fromNowOn();
        $item = MenuItem::factory()->create();

        $id = Activity::query()->where('subject_id', $item->id)
            ->where('log_name', 'menu.item')->firstOrFail()->id;

        $this->getJson("/api/v1/audit/{$id}")
            ->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.log_name', 'menu.item')
            ->assertJsonPath('data.subject.id', $item->id);
    }

    public function test_an_entry_belonging_to_another_restaurant_is_a_404_not_a_read(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Activity::query()->create([
            'tenant_id' => $other->id,
            'log_name' => 'finance.payment',
            'description' => "Qo'shni restoranning yozuvi",
        ]);

        $this->signIn('owner');

        $this->getJson("/api/v1/audit/{$theirs->id}")->assertStatus(404);
    }

    // ============ Immutability ============

    public function test_the_trail_offers_no_way_to_change_or_erase_itself(): void
    {
        $this->signIn('owner');
        MenuItem::factory()->create();
        $before = Activity::query()->count();
        $id = Activity::query()->firstOrFail()->id;

        // Evidence that can be edited is not evidence.
        $this->patchJson("/api/v1/audit/{$id}", ['description' => 'hech narsa'])->assertStatus(405);
        $this->deleteJson("/api/v1/audit/{$id}")->assertStatus(405);
        $this->postJson('/api/v1/audit', ['description' => 'soxta'])->assertStatus(405);

        $this->assertSame($before, Activity::query()->count());
        $this->assertNotSame('hech narsa', Activity::query()->findOrFail($id)->description);
    }

    // ============ Isolation ============

    public function test_one_restaurant_never_reads_another_restaurants_history(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->signIn('owner');
        $this->fromNowOn();

        Activity::query()->create([
            'tenant_id' => $other->id, 'log_name' => 'finance.payment',
            'description' => "Qo'shni restoran chekini bekor qildi",
        ]);
        Activity::query()->create([
            'tenant_id' => $this->tenant->id, 'log_name' => 'menu.item',
            'description' => 'Narx yangilandi',
        ]);

        $this->getJson('/api/v1/audit')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.log_name', 'menu.item');

        $this->getJson('/api/v1/audit/facets')
            ->assertOk()
            ->assertSimilarJson([
                'log_names' => ['menu.item'],
                'events' => [],
                'subjects' => [],
                'total' => 1,
            ]);
    }

    public function test_entries_are_stamped_with_the_restaurant_that_caused_them(): void
    {
        $this->signIn('owner');
        MenuItem::factory()->create();

        $this->assertSame(
            $this->tenant->id,
            Activity::withoutGlobalScope('tenant')->firstOrFail()->tenant_id,
        );
    }

    public function test_an_entry_written_outside_a_request_still_finds_its_restaurant(): void
    {
        // A queued job has no tenant context, so the subject has to answer for
        // it — otherwise the line would be invisible to everyone.
        $item = MenuItem::factory()->create(['tenant_id' => $this->tenant->id]);

        app(TenantContext::class)->clear();
        activity()->performedOn($item)->log('Kechiktirilgan ish');

        $entry = Activity::withoutGlobalScope('tenant')
            ->where('description', 'Kechiktirilgan ish')
            ->firstOrFail();

        $this->assertSame($this->tenant->id, $entry->tenant_id);
    }
}

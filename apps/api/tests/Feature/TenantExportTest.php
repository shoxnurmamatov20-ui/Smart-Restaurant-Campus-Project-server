<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Jobs\ExportTenantData;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\TenantExport;
use App\Models\User;
use App\Support\Tenancy\DatabaseTenancy;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;
use ZipArchive;

/**
 * "Give this restaurant everything we hold about them."
 *
 * The console asked for a pipeline and named every way it could go wrong: a
 * synchronous endpoint times out on a customer with a year of orders, and a
 * link that does not expire is that customer's entire history left on a URL.
 * Both of those are asserted here, and so is the one the console could not
 * have known about.
 *
 * That one is `test_the_archive_holds_no_other_restaurants_rows`, and it is
 * the reason this file exists rather than a smoke test. Three tables on this
 * platform are EXEMPT from row-level security by name — `public.users`,
 * `pos.terminals` and `staff.devices` — because authentication has to read
 * them before any tenant is known. A walk that trusted the policy to scope it
 * would write every user account on the platform into one restaurant's zip,
 * and the archive would look perfect: right filename, right size, ready state,
 * a working link. Nothing but a test that plants another restaurant's row and
 * goes looking for it can see that.
 */
final class TenantExportTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $osh;

    private Tenant $lagmon;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->osh = $this->restaurant('Osh Xona', 'osh-xona-export');
        $this->lagmon = $this->restaurant('Lagmon Uyi', 'lagmon-uyi-export');
    }

    protected function tearDown(): void
    {
        // Archives are files, and files outlive a rolled-back transaction. A
        // suite that left them behind would grow a directory of one
        // restaurant's history per run.
        File::deleteDirectory(storage_path('app/exports'));

        parent::tearDown();
    }

    // ============ Fixtures ============

    private function restaurant(string $name, string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => $name,
            'slug' => $slug,
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function member(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole($role);

        return $user->fresh();
    }

    /** tenant_id null AND super-admin — both halves, or ResolveTenant scopes them. */
    private function operator(): User
    {
        $user = User::factory()->create(['tenant_id' => null, 'email' => 'ops@smartrest.uz']);
        $user->assignRole('super-admin');

        return $user->fresh();
    }

    private function branch(Tenant $tenant, string $name, string $slug): Branch
    {
        return Branch::query()->create([
            'tenant_id' => $tenant->id,
            'name' => $name,
            'slug' => $slug,
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    /** Read a row back with every restaurant visible — the assertions' own view. */
    private function exportRow(int $id): TenantExport
    {
        return app(DatabaseTenancy::class)->withoutTenancy(
            fn (): TenantExport => TenantExport::query()->withoutGlobalScopes()->findOrFail($id),
        );
    }

    /**
     * Open a finished archive and hand back its members, decoded.
     *
     * @return array<string, mixed>
     */
    private function readArchive(TenantExport $export): array
    {
        $path = $export->absolutePath();

        $this->assertNotNull($path);
        $this->assertFileExists($path, 'The row says ready and there is no file behind it.');

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true, 'The archive is not a readable zip.');

        $members = [];

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            $body = (string) $zip->getFromIndex($i);

            $decoded = json_decode($body, true);

            $this->assertSame(
                JSON_ERROR_NONE,
                json_last_error(),
                "Member {$name} is not JSON: ".substr($body, 0, 120),
            );

            $members[$name] = $decoded;
        }

        $zip->close();

        return $members;
    }

    // ============ The platform operator's door ============

    public function test_the_operator_queues_an_export_and_gets_a_row_to_poll(): void
    {
        $this->branch($this->osh, 'Chilonzor', 'chilonzor-export');
        $this->actingAs($this->operator());

        $response = $this->postJson("/api/v1/platform/tenants/{$this->osh->id}/export")
            ->assertStatus(202)
            ->assertJsonStructure(['data' => ['id', 'state', 'requested_at']]);

        $row = $this->exportRow((int) $response->json('data.id'));

        $this->assertSame($this->osh->id, $row->tenant_id);

        /*
         * The suite runs QUEUE_CONNECTION=sync, so the walk has already
         * happened by the time dispatch() returns — which is exactly what makes
         * the rest of this file able to assert on the archive rather than on the
         * intention to build one. On a real queue this would still read
         * `queued`, and the console polls until it does not.
         */
        $this->assertSame(TenantExport::READY, $row->state, (string) $row->error);
        $this->assertGreaterThan(0, $row->tables);
        $this->assertGreaterThan(0, $row->size_bytes);
    }

    public function test_the_list_carries_a_signed_link_and_a_deadline(): void
    {
        $this->actingAs($this->operator());
        $this->postJson("/api/v1/platform/tenants/{$this->osh->id}/export")->assertStatus(202);

        $response = $this->getJson("/api/v1/platform/tenants/{$this->osh->id}/exports")->assertOk();

        $this->assertSame(TenantExport::READY, $response->json('data.0.state'));
        $this->assertNotNull($response->json('data.0.expires_at'));

        $url = $response->json('data.0.url');
        $this->assertIsString($url);
        $this->assertStringContainsString('signature=', $url);
    }

    public function test_a_second_export_is_refused_while_one_is_still_walking(): void
    {
        // A double-click on the console button is two full table scans and two
        // copies of the same archive; the second also wins the "latest" slot
        // with data read a minute later.
        TenantExport::query()->forceCreate([
            'tenant_id' => $this->osh->id,
            'state' => TenantExport::RUNNING,
            'requested_at' => CarbonImmutable::now(),
        ]);

        $this->actingAs($this->operator());

        $this->postJson("/api/v1/platform/tenants/{$this->osh->id}/export")
            ->assertApiError('export.already_running');
    }

    // ============ Who may ask ============

    public function test_a_restaurant_owner_is_refused_the_platform_route(): void
    {
        // An owner is an admin of their business, never of the product. The
        // platform route exports somebody else's restaurant by id.
        $this->actingAs($this->member($this->osh, 'owner'));

        $this->postJson("/api/v1/platform/tenants/{$this->osh->id}/export")->assertStatus(403);
        $this->getJson("/api/v1/platform/tenants/{$this->osh->id}/exports")->assertStatus(403);
    }

    public function test_only_system_settings_opens_the_restaurants_own_copy(): void
    {
        // A branch manager may READ the settings document — they have to
        // explain the VAT rate to a guest — and may not mint a file holding
        // every guest, every bill and every wage in the business.
        $this->actingAs($this->member($this->osh, 'branch-manager'));

        $this->postJson('/api/v1/settings/export')->assertStatus(403);
        $this->getJson('/api/v1/settings/exports')->assertStatus(403);

        $this->actingAs($this->member($this->osh, 'waiter'));
        $this->postJson('/api/v1/settings/export')->assertStatus(403);
    }

    public function test_the_owner_asks_for_their_own_archive(): void
    {
        $this->actingAs($this->member($this->osh, 'owner'));

        $id = (int) $this->postJson('/api/v1/settings/export')
            ->assertStatus(202)
            ->json('data.id');

        $this->assertSame($this->osh->id, $this->exportRow($id)->tenant_id);

        $this->getJson('/api/v1/settings/exports')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_anothers_export_in_the_list(): void
    {
        $this->actingAs($this->member($this->osh, 'owner'));
        $mine = (int) $this->postJson('/api/v1/settings/export')->json('data.id');

        $this->actingAs($this->member($this->lagmon, 'owner'));
        $theirs = (int) $this->postJson('/api/v1/settings/export')->json('data.id');

        $ids = array_column($this->getJson('/api/v1/settings/exports')->assertOk()->json('data'), 'id');

        $this->assertSame([$theirs], $ids, 'A restaurant read another restaurant\'s export history.');
        $this->assertNotContains($mine, $ids);
    }

    public function test_another_restaurants_archive_cannot_be_fetched_without_the_signature(): void
    {
        $this->actingAs($this->member($this->osh, 'owner'));
        $mine = (int) $this->postJson('/api/v1/settings/export')->json('data.id');

        // The neighbour knows the id — they are small integers — and has no way
        // to produce a signature for it without APP_KEY.
        $this->getJson("/api/v1/exports/{$mine}/download")
            ->assertApiError('export.link_invalid');
    }

    public function test_the_archive_holds_no_other_restaurants_rows(): void
    {
        $this->branch($this->osh, 'Chilonzor', 'chilonzor-export');
        $this->branch($this->lagmon, 'Yunusobod', 'yunusobod-export');

        $neighbour = $this->member($this->lagmon, 'owner');
        $mine = $this->member($this->osh, 'owner');

        $this->actingAs($mine);
        $id = (int) $this->postJson('/api/v1/settings/export')->json('data.id');

        $members = $this->readArchive($this->exportRow($id));

        $branches = $members['public.branches.json'];
        $this->assertIsArray($branches);
        $this->assertSame(['chilonzor-export'], array_column($branches, 'slug'));

        /*
         * The one that matters. `public.users` is exempt from the tenancy
         * policy so that sign-in can work at all, which means the walk's own
         * `where tenant_id = ?` is the ONLY thing standing between this archive
         * and every account on the platform.
         */
        $users = $members['public.users.json'];
        $this->assertIsArray($users);

        $ids = array_column($users, 'id');
        $this->assertContains($mine->id, $ids);
        $this->assertNotContains($neighbour->id, $ids, 'Another restaurant\'s user landed in this archive.');
    }

    // ============ The archive itself ============

    public function test_the_archive_is_a_readable_zip_that_describes_itself(): void
    {
        $this->branch($this->osh, 'Chilonzor', 'chilonzor-export');
        $this->actingAs($this->member($this->osh, 'owner'));

        $id = (int) $this->postJson('/api/v1/settings/export')->json('data.id');
        $row = $this->exportRow($id);
        $members = $this->readArchive($row);

        // Every table carrying tenant_id, discovered rather than listed — so
        // the eleventh module's tables appear without anybody editing the job.
        $this->assertArrayHasKey('manifest.json', $members);
        $this->assertArrayHasKey('public.branches.json', $members);
        $this->assertArrayHasKey('menu.menu_items.json', $members);
        $this->assertArrayHasKey('orders.orders.json', $members);

        $manifest = $members['manifest.json'];
        $this->assertIsArray($manifest);
        $this->assertSame($this->osh->slug, $manifest['tenant']['slug']);
        $this->assertSame($row->tables, $manifest['totals']['tables']);

        // The count on the row is checkable against the archive, which is the
        // only thing that makes "ready" mean anything.
        $this->assertSame(count($members) - 1, $row->tables);
    }

    public function test_credentials_are_redacted_rather_than_shipped(): void
    {
        $owner = $this->member($this->osh, 'owner');
        $this->actingAs($owner);

        $id = (int) $this->postJson('/api/v1/settings/export')->json('data.id');
        $members = $this->readArchive($this->exportRow($id));

        /** @var array<int, array<string, mixed>> $users */
        $users = $members['public.users.json'];
        $row = collect($users)->firstWhere('id', $owner->id);

        $this->assertIsArray($row);
        $this->assertSame($owner->email, $row['email'], 'The archive must still be the person\'s own data.');

        // An archive is a file that gets mailed, copied to a laptop and
        // forwarded. A bcrypt hash in one is an offline cracking target.
        $this->assertSame('[redacted]', $row['password']);
        $this->assertArrayHasKey('remember_token', $row);
        $this->assertNotSame($owner->remember_token, $row['remember_token']);
    }

    // ============ The link ============

    public function test_a_signed_link_hands_over_the_zip(): void
    {
        $this->actingAs($this->member($this->osh, 'owner'));

        $url = $this->postJson('/api/v1/settings/export')->json('data.url');
        $this->assertIsString($url);

        $response = $this->get($url)->assertOk();

        $this->assertSame('application/zip', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('.zip', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_a_tampered_signature_is_refused(): void
    {
        $this->actingAs($this->member($this->osh, 'owner'));

        $url = (string) $this->postJson('/api/v1/settings/export')->json('data.url');

        // One character. The signature covers the id and the deadline, so any
        // edit to either — or to the signature itself — invalidates the lot.
        $this->get(substr($url, 0, -1).($url[strlen($url) - 1] === 'a' ? 'b' : 'a'))
            ->assertApiError('export.link_invalid');
    }

    public function test_an_edited_export_id_is_refused(): void
    {
        $this->actingAs($this->member($this->lagmon, 'owner'));
        $theirs = (int) $this->postJson('/api/v1/settings/export')->json('data.id');

        $this->actingAs($this->member($this->osh, 'owner'));
        $mine = (string) $this->postJson('/api/v1/settings/export')->json('data.url');

        // Walking the URL from your own archive to the neighbour's. The id is
        // inside what was signed, so the edit invalidates the credential.
        $walked = (string) preg_replace('#/exports/\d+/#', "/exports/{$theirs}/", $mine);

        $this->assertNotSame($mine, $walked);
        $this->get($walked)->assertApiError('export.link_invalid');
    }

    public function test_an_expired_link_is_a_dead_end(): void
    {
        $this->actingAs($this->member($this->osh, 'owner'));
        $url = (string) $this->postJson('/api/v1/settings/export')->json('data.url');

        // The signature and the file share one deadline on purpose — see
        // TenantArchive::link(). Past it, both are gone.
        $this->travelTo(CarbonImmutable::now()->addHours(TenantExport::LIFETIME_HOURS + 1));

        $this->get($url)->assertApiError('export.expired');

        $this->travelBack();
    }

    public function test_a_link_to_an_archive_that_is_not_ready_says_so(): void
    {
        $export = TenantExport::query()->forceCreate([
            'tenant_id' => $this->osh->id,
            'state' => TenantExport::QUEUED,
            'requested_at' => CarbonImmutable::now(),
        ]);

        // Signed by hand: the list would not have offered a link for a queued
        // row, and the point is that the controller refuses it even so.
        $url = URL::temporarySignedRoute(
            'api.v1.exports.download',
            CarbonImmutable::now()->addHour(),
            ['export' => $export->id],
        );

        $this->get($url)->assertApiError('export.not_ready');
    }

    public function test_a_failed_walk_is_recorded_on_the_row_and_not_thrown(): void
    {
        $export = TenantExport::query()->forceCreate([
            'tenant_id' => $this->osh->id,
            'state' => TenantExport::QUEUED,
            'requested_at' => CarbonImmutable::now(),
        ]);

        // A restaurant whose data cannot be walked must leave a row saying so,
        // not a 500 on the request that queued it.
        File::put(storage_path('app/exports'), 'not a directory');

        (new ExportTenantData((int) $export->id))->handle(app(DatabaseTenancy::class));

        $row = $this->exportRow((int) $export->id);

        $this->assertSame(TenantExport::FAILED, $row->state);
        $this->assertNotNull($row->error);

        File::delete(storage_path('app/exports'));
    }

    public function test_a_job_for_a_deleted_restaurant_does_nothing(): void
    {
        // The row cascades with the tenant, so the worker may find nothing at
        // all — and must not die trying to record that.
        (new ExportTenantData(999_999))->handle(app(DatabaseTenancy::class));

        $this->assertSame(0, TenantExport::query()->withoutGlobalScopes()->count());
    }
}

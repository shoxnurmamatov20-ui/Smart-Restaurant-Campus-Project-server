<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Auth\TenantRoleOverlay;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A restaurant's own settings, and who may change them.
 *
 * The half worth reading twice is `test_a_key_the_schema_never_declared_is_refused`.
 * `tenants.settings` is jsonb: before config/settings.php existed, a console
 * that sent `vat_precent` got a 200, stored the typo forever, and every reader
 * downstream went on using the default — a wrong number on every receipt with a
 * green save button. Nothing else in this file can catch that, because rules
 * describe the keys you named and say nothing about the ones you did not.
 */
final class RestaurantSettingsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona',
            'slug' => 'osh-xona-settings',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
    }

    private function actingAs_(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user->fresh();
    }

    // ============ Reading ============

    public function test_the_owner_reads_the_settings_document_and_its_schema(): void
    {
        $this->actingAs_('owner');

        $this->getJson('/api/v1/settings')
            ->assertOk()
            ->assertJsonPath('data.slug', 'osh-xona-settings')
            // The rules ride along so the console can refuse an eight-digit
            // STIR before the round trip, rather than re-declaring them in
            // TypeScript where the two would drift.
            ->assertJsonStructure(['meta' => ['schema']]);
    }

    public function test_a_manager_reads_the_settings_but_cannot_change_them(): void
    {
        $this->actingAs_('branch-manager');

        // Reads: a manager has to answer a guest asking about the service
        // charge on their receipt.
        $this->getJson('/api/v1/settings')->assertOk();

        // Writes: changing the VAT rate reprices every bill in the building.
        $this->patchJson('/api/v1/settings', ['vat_percent' => 0])->assertStatus(403);
    }

    public function test_a_waiter_cannot_even_read_them(): void
    {
        $this->actingAs_('waiter');

        $this->getJson('/api/v1/settings')->assertStatus(403);
    }

    // ============ The schema ============

    public function test_the_owner_saves_the_legal_requisites(): void
    {
        $this->actingAs_('owner');

        $this->patchJson('/api/v1/settings', [
            'legal' => [
                'name' => 'MChJ «Smart Restaurant Group»',
                'tax_id' => '302458719',
                'mfo' => '00491',
                'account' => '20208000447190123456',
                'director' => 'Rustam Karimov',
            ],
        ])->assertOk()->assertJsonPath('data.settings.legal.tax_id', '302458719');
    }

    public function test_a_stir_that_is_not_nine_digits_is_refused(): void
    {
        $this->actingAs_('owner');

        // Eight digits. A receipt carrying this is not a receipt, and the
        // person typing it at midnight will not notice.
        $this->patchJson('/api/v1/settings', ['legal' => ['tax_id' => '30245871']])
            ->assertStatus(422);

        $this->patchJson('/api/v1/settings', ['legal' => ['mfo' => '4915']])
            ->assertStatus(422);
    }

    public function test_a_key_the_schema_never_declared_is_refused(): void
    {
        $this->actingAs_('owner');

        // The typo that used to be accepted, stored forever, and read back as
        // the default by everything downstream.
        $this->patchJson('/api/v1/settings', ['vat_precent' => 15])
            ->assertStatus(422)
            ->assertJsonPath('error.field', 'vat_precent');

        $this->assertNull($this->tenant->fresh()?->setting('vat_precent'));
    }

    public function test_saving_one_panel_leaves_the_others_alone(): void
    {
        $this->actingAs_('owner');

        $this->patchJson('/api/v1/settings', ['legal' => ['tax_id' => '302458719']])->assertOk();
        $this->patchJson('/api/v1/settings', ['brand' => ['color' => '#2E74EA']])->assertOk();

        // A PATCH, not a PUT. The console saves eight panels separately, and a
        // brand colour must not blank the bank details saved a minute earlier.
        $settings = $this->tenant->fresh()?->settings ?? [];
        $this->assertSame('302458719', data_get($settings, 'legal.tax_id'));
        $this->assertSame('#2E74EA', data_get($settings, 'brand.color'));
    }

    // ============ The website ============

    public function test_the_site_settings_are_their_own_group(): void
    {
        $this->actingAs_('owner');

        $this->putJson('/api/v1/settings/site', [
            'subdomain' => 'osh-xona',
            'accent' => 'a1',
            'sections' => ['gallery' => true],
        ])->assertOk()->assertJsonPath('data.accent', 'a1');

        // The restaurant group must not carry it back, or a console doing
        // GET-then-PATCH would be refused its own payload.
        $this->getJson('/api/v1/settings')->assertOk()->assertJsonMissingPath('data.settings.site');
    }

    public function test_the_two_permanent_sections_cannot_be_switched_off(): void
    {
        $this->actingAs_('owner');

        // A restaurant's website without its menu is not a smaller website.
        $this->putJson('/api/v1/settings/site', ['sections' => ['menu' => false]])
            ->assertStatus(422);
    }

    public function test_a_subdomain_another_restaurant_holds_is_refused(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-rest', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
            'settings' => ['site' => ['subdomain' => 'choyxona']],
        ]);

        $this->actingAs_('owner');

        // Two restaurants on one host is one of them serving the other's menu.
        $this->putJson('/api/v1/settings/site', ['subdomain' => 'choyxona'])
            ->assertStatus(422);

        $this->assertSame('choyxona', $other->setting('site.subdomain'));
    }

    public function test_the_shop_window_needs_no_session(): void
    {
        // The PUBLISHED snapshot, not the draft — see SettingsController::publish.
        // A stranger sees what somebody pressed the button on.
        $this->tenant->forceFill(['settings' => [
            'site' => [
                'headline' => 'Qazili Toshkent oshi',
                'published' => ['headline' => 'Qazili Toshkent oshi'],
                'published_at' => now()->toIso8601String(),
                'version' => 1,
            ],
            'legal' => ['tax_id' => '302458719', 'account' => '20208000447190123456'],
        ]])->save();

        Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'city' => 'Toshkent', 'address' => 'Bunyodkor 12', 'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $response = $this->getJson('/api/v1/public/site', ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('data.site.headline', 'Qazili Toshkent oshi')
            ->assertJsonPath('data.branches.0.name', 'Chilonzor');

        // The bank details and the STIR are on the same document and belong on
        // a receipt, not on a page written for strangers and indexed by Google.
        $this->assertStringNotContainsString('20208000447190123456', $response->getContent() ?: '');
        $this->assertStringNotContainsString('302458719', $response->getContent() ?: '');
    }

    public function test_an_unpublished_draft_is_not_on_the_internet(): void
    {
        $this->actingAs_('owner');

        $this->putJson('/api/v1/settings/site', ['headline' => 'Hali tayyor emas'])
            ->assertOk()
            ->assertJsonPath('meta.published.live', false)
            ->assertJsonPath('meta.published.version', 0);

        // Half-written copy, a section switched off to see what it looks like,
        // a subdomain somebody is still deciding on — none of it is a website
        // until a person says it is.
        $this->getJson('/api/v1/public/site', ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('data.site', [])
            ->assertJsonPath('data.published_at', null);
    }

    public function test_publishing_freezes_the_draft_and_later_edits_do_not_leak(): void
    {
        $this->actingAs_('owner');

        $this->putJson('/api/v1/settings/site', ['headline' => 'Birinchi'])->assertOk();
        $this->postJson('/api/v1/settings/site/publish')
            ->assertOk()
            ->assertJsonPath('meta.published.live', true)
            ->assertJsonPath('meta.published.version', 1);

        // Editing after publishing changes the draft and nothing a stranger sees.
        $this->putJson('/api/v1/settings/site', ['headline' => 'Ikkinchi'])
            ->assertOk()
            ->assertJsonPath('data.headline', 'Ikkinchi');

        $this->getJson('/api/v1/public/site', ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('data.site.headline', 'Birinchi');

        // Pressing the button again moves it on, and counts.
        $this->postJson('/api/v1/settings/site/publish')
            ->assertOk()
            ->assertJsonPath('meta.published.version', 2);

        $this->getJson('/api/v1/public/site', ['X-Tenant' => $this->tenant->slug])
            ->assertJsonPath('data.site.headline', 'Ikkinchi');
    }

    public function test_the_snapshot_never_comes_back_on_the_editing_endpoint(): void
    {
        $this->actingAs_('owner');
        $this->putJson('/api/v1/settings/site', ['headline' => 'Birinchi'])->assertOk();
        $this->postJson('/api/v1/settings/site/publish')->assertOk();

        // A console doing GET-then-PUT with what it was handed must not be
        // refused for sending back a key the schema never declared.
        $draft = $this->getJson('/api/v1/settings/site')->assertOk()->json('data');

        $this->assertArrayNotHasKey('published', $draft);
        $this->putJson('/api/v1/settings/site', $draft)->assertOk();
    }

    public function test_a_manager_may_not_publish_the_website(): void
    {
        $this->actingAs_('branch-manager');

        $this->postJson('/api/v1/settings/site/publish')->assertForbidden();
    }

    public function test_the_site_declares_its_own_channels_and_preorder_window(): void
    {
        $this->actingAs_('owner');

        $this->putJson('/api/v1/settings/site', [
            'channels' => ['delivery', 'pickup'],
            'preorder' => ['enabled' => true, 'lead_minutes' => 45, 'horizon_days' => 3, 'slot_minutes' => 15],
        ])
            ->assertOk()
            ->assertJsonPath('data.channels', ['delivery', 'pickup'])
            ->assertJsonPath('data.preorder.lead_minutes', 45);

        // `aggregator` is a FULFILMENT channel on the restaurant document, not
        // something a website offers a stranger — see config/settings.php.
        $this->putJson('/api/v1/settings/site', ['channels' => ['aggregator']])
            ->assertStatus(422);
    }

    // ============ Branch settings ============

    public function test_a_branch_target_is_stored_in_tiyin_and_merged(): void
    {
        $this->actingAs_('owner');

        $branch = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Yunusobod', 'slug' => 'yunusobod',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
            'settings' => ['bookable' => false],
        ]);

        $this->patchJson("/api/v1/branches/{$branch->id}", [
            'settings' => ['target_monthly_tiyin' => 14_000_000_000],
        ])->assertOk()->assertJsonPath('data.settings.target_monthly_tiyin', 14_000_000_000);

        // Merged, not replaced: saving a target must not blank the hours the
        // venue was opened with.
        $this->assertFalse($branch->fresh()?->settings['bookable']);
    }

    public function test_a_branch_setting_the_schema_never_declared_is_refused(): void
    {
        $this->actingAs_('owner');

        $branch = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Sergeli', 'slug' => 'sergeli',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->patchJson("/api/v1/branches/{$branch->id}", [
            'settings' => ['target_monthly' => 140_000_000],
        ])->assertStatus(422);
    }

    // ============ Roles ============

    public function test_the_owner_reads_the_role_matrix(): void
    {
        $this->actingAs_('owner');

        $this->getJson('/api/v1/roles')
            ->assertOk()
            ->assertJsonStructure(['data' => [['name', 'permissions', 'baseline', 'withheld']]]);
    }

    public function test_a_manager_may_not_read_the_role_matrix(): void
    {
        // The matrix names every power on the platform and who holds it, which
        // is a map of the building for whoever is planning to walk through it.
        $this->actingAs_('branch-manager');

        $this->getJson('/api/v1/roles')->assertStatus(403);
    }

    public function test_a_waiter_can_never_be_granted_the_power_to_void(): void
    {
        $this->actingAs_('owner');

        $this->putJson('/api/v1/roles/waiter', [
            'permissions' => ['orders.view', 'orders.create', 'pos.sell', 'pos.void'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.field', 'permissions');

        // Nothing stored: a partial write here would be the approval model
        // switched off for that restaurant with a validation error on screen.
        $this->assertSame([], TenantRoleOverlay::forTenant($this->tenant->fresh()));
    }

    public function test_a_restaurant_may_still_shape_its_own_roles(): void
    {
        $this->actingAs_('owner');

        $this->putJson('/api/v1/roles/cashier', [
            'permissions' => ['pos.sell', 'pos.view', 'orders.view', 'crm.view'],
        ])->assertOk();

        $cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cashier->assignRole('cashier');

        // The overlay is a diff against the shared baseline and it is enforced,
        // not merely drawn: `pos.drawer` was taken away here and nowhere else.
        $this->assertTrue($cashier->fresh()?->can('pos.sell'));
        $this->assertFalse($cashier->fresh()?->can('pos.drawer'));
    }

    public function test_one_restaurants_role_edit_does_not_reach_another(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Ikkinchi', 'slug' => 'ikkinchi-rest', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->actingAs_('owner');
        $this->putJson('/api/v1/roles/cashier', ['permissions' => ['pos.sell']])->assertOk();

        // Spatie's `roles` table has no team column, so writing the edit through
        // to it would have changed every restaurant on the platform at once.
        $elsewhere = User::factory()->create(['tenant_id' => $other->id]);
        $elsewhere->assignRole('cashier');

        app(TenantContext::class)->set($other);
        $this->assertTrue($elsewhere->fresh()?->can('pos.drawer'));
    }
}

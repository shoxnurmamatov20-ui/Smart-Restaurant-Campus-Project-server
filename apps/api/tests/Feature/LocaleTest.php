<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Localization\LocaleResolver;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * Language resolution.
 *
 * These assertions read real translated content back out of the API rather than
 * inspecting `app()->getLocale()`, because the thing that actually matters is
 * whether a Russian-speaking guest sees "Плов" on the QR menu. A locale that is
 * set correctly but never reaches the response is worth nothing.
 *
 * Note the explicit empty `Accept-Language`: Laravel's test client inherits
 * Symfony's default of `en-us,en;q=0.5`, so a test that sends nothing is really
 * sending "I prefer English". Requests meant to carry no language signal at all
 * have to say so.
 */
final class LocaleTest extends TestCase
{
    use RefreshDatabase;

    private const SILENT = ['Accept-Language' => ''];

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

        $category = MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_active' => true,
            'parent_id' => null,
            'name' => ['uz' => 'Issiq taomlar', 'ru' => 'Горячие блюда', 'en' => 'Hot dishes'],
        ]);

        MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
            'is_available' => true,
            'status' => 'active',
            'stopped_until' => null,
        ]);
    }

    /**
     * The dish title a guest would see on the QR menu for a given set of headers.
     *
     * @param array<string, string> $headers
     */
    private function guestSees(array $headers = []): string
    {
        $response = $this->withHeaders($headers + ['X-Tenant' => 'osh-markazi'])
            ->getJson('/api/v1/public/menu')
            ->assertOk();

        return (string) $response->json('data.0.items.0.title');
    }

    /**
     * The dish title a signed-in staff member would see in the POS.
     *
     * @param array<string, string> $headers
     */
    private function staffSees(array $headers = []): string
    {
        $response = $this->withHeaders($headers)
            ->getJson('/api/v1/menu/items')
            ->assertOk();

        return (string) $response->json('data.0.title');
    }

    private function signIn(?string $locale): User
    {
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'locale' => $locale,
        ]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    // ============ An outright request ============

    public function test_the_x_locale_header_switches_the_guest_menu(): void
    {
        $this->assertSame('Плов', $this->guestSees(['X-Locale' => 'ru']));
        $this->assertSame('Pilaf', $this->guestSees(['X-Locale' => 'en']));
        $this->assertSame('Osh', $this->guestSees(['X-Locale' => 'uz']));
    }

    public function test_the_header_is_case_insensitive(): void
    {
        $this->assertSame('Плов', $this->guestSees(['X-Locale' => 'RU']));
    }

    public function test_an_unknown_locale_is_ignored_rather_than_obeyed(): void
    {
        // Klingon is not on the menu. The request still has to answer in
        // something, so the next signal down — the browser — decides.
        $this->assertSame(
            'Плов',
            $this->guestSees(['X-Locale' => 'tlh', 'Accept-Language' => 'ru']),
        );
    }

    // ============ The browser's preference ============

    public function test_a_browser_accept_language_header_is_honoured(): void
    {
        $this->assertSame('Плов', $this->guestSees(['Accept-Language' => 'ru-RU,ru;q=0.9,en;q=0.8']));
    }

    public function test_accept_language_respects_quality_values_not_order(): void
    {
        // English is listed first but Russian is preferred — the q-value wins.
        $this->assertSame('Плов', $this->guestSees(['Accept-Language' => 'en;q=0.4,ru;q=0.9']));
    }

    public function test_an_unsupported_browser_language_is_skipped_for_a_supported_one(): void
    {
        // Not German, but English is next in line and we do speak it.
        $this->assertSame('Pilaf', $this->guestSees(['Accept-Language' => 'de-DE,de;q=0.9,en;q=0.5']));
    }

    public function test_a_wildcard_browser_preference_is_not_treated_as_a_language(): void
    {
        $this->assertSame('Osh', $this->guestSees(['Accept-Language' => '*']));
    }

    public function test_an_explicit_header_beats_the_browser_preference(): void
    {
        $this->assertSame(
            'Pilaf',
            $this->guestSees(['X-Locale' => 'en', 'Accept-Language' => 'ru,uz;q=0.9']),
        );
    }

    // ============ Stored preferences ============

    public function test_a_silent_guest_gets_the_restaurants_own_language(): void
    {
        $this->tenant->update(['locale' => 'ru']);

        $this->assertSame('Плов', $this->guestSees(self::SILENT));
    }

    public function test_a_staff_members_saved_language_beats_their_browser(): void
    {
        // The browser advertises Russian, but this person went into settings and
        // chose English. A deliberate choice outranks an OS default.
        $this->signIn('en');

        $this->assertSame('Pilaf', $this->staffSees(['Accept-Language' => 'ru-RU,ru;q=0.9']));
    }

    public function test_a_header_still_beats_the_saved_language(): void
    {
        // A language switcher in the UI must work even for a staff member whose
        // account says something else.
        $this->signIn('en');

        $this->assertSame('Плов', $this->staffSees(['X-Locale' => 'ru']));
    }

    public function test_a_staff_member_with_no_saved_language_follows_the_restaurant(): void
    {
        $this->tenant->update(['locale' => 'ru']);
        $this->signIn(null);

        $this->assertSame('Плов', $this->staffSees(self::SILENT));
    }

    public function test_a_staff_member_with_no_saved_language_still_honours_their_browser(): void
    {
        $this->tenant->update(['locale' => 'uz']);
        $this->signIn(null);

        $this->assertSame('Pilaf', $this->staffSees(['Accept-Language' => 'en-GB,en;q=0.9']));
    }

    // ============ Response contract ============

    public function test_the_response_states_which_language_it_chose(): void
    {
        $this->withHeaders(['X-Tenant' => 'osh-markazi', 'X-Locale' => 'ru'])
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertHeader('Content-Language', 'ru');
    }

    public function test_content_language_reflects_the_second_pass_too(): void
    {
        $this->tenant->update(['locale' => 'ru']);

        $this->withHeaders(['X-Tenant' => 'osh-markazi'] + self::SILENT)
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertHeader('Content-Language', 'ru');
    }

    // ============ Untranslated content ============

    public function test_a_missing_translation_falls_back_rather_than_leaving_a_blank(): void
    {
        MenuItem::query()->update(['name' => ['uz' => 'Somsa']]);

        // Asked for Russian, but only Uzbek was ever written — the guest sees
        // the dish, not an empty line on the menu.
        $this->assertSame('Somsa', $this->guestSees(['X-Locale' => 'ru']));
    }

    // ============ Resolver behaviour ============

    public function test_the_supported_list_is_the_single_switch_for_a_new_language(): void
    {
        $resolver = app(LocaleResolver::class);

        $this->assertSame(['uz', 'ru', 'en'], $resolver->supported());
        $this->assertTrue($resolver->isSupported('ru'));
        $this->assertFalse($resolver->isSupported('de'));
        $this->assertFalse($resolver->isSupported(null));
    }

    public function test_applying_an_unsupported_locale_is_refused_not_obeyed(): void
    {
        $resolver = app(LocaleResolver::class);
        $resolver->apply('de');

        $this->assertSame('uz', app()->getLocale());
    }

    public function test_first_supported_walks_the_candidate_list_in_order(): void
    {
        $resolver = app(LocaleResolver::class);

        $this->assertSame('ru', $resolver->firstSupported(null, 'de', 'ru', 'en'));
        $this->assertSame('uz', $resolver->firstSupported(null, 'de', null));
    }
}

<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\BotUser;
use Modules\TelegramBots\Models\CommandLog;
use Modules\TelegramBots\Models\Subscription;
use Tests\TestCase;

/**
 * The bridge between Laravel and the Python bot service.
 *
 * Everything here is called machine-to-machine over a shared secret, which is
 * exactly why it needs testing: there is no browser, no session and no human to
 * notice that a bot has started answering with another restaurant's menu.
 */
final class BotApiTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'test-internal-token-0123456789';

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        config()->set('telegrambots.internal_token', self::TOKEN);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
    }

    /**
     * @param array<string, string> $extra
     *
     * @return array<string, string>
     */
    private function internal(array $extra = []): array
    {
        return $extra + [
            'Authorization' => 'Bearer '.self::TOKEN,
            'X-Tenant' => 'osh-markazi',
            // The Python service states the guest's language per request via
            // X-Locale; it never sends a browser's Accept-Language. Cleared so
            // these tests do not inherit the test client's `en-us` default.
            'Accept-Language' => '',
        ];
    }

    private function bot(string $key = 'guest'): Bot
    {
        return Bot::query()->create([
            'tenant_id' => $this->tenant->id,
            'key' => $key,
            'name_uz' => 'Mehmon boti',
            'name_ru' => 'Гостевой бот',
            'name_en' => 'Guest bot',
            'purpose' => 'Guest ordering and notifications',
            'audience' => 'guest',
            'enabled' => true,
        ]);
    }

    // ============ The shared secret ============

    public function test_an_unauthenticated_call_is_refused(): void
    {
        $this->bot();

        $this->getJson('/api/v1/bots/guest/menu')->assertStatus(401);
    }

    public function test_a_wrong_token_is_refused(): void
    {
        $this->bot();

        $this->withHeaders(['Authorization' => 'Bearer nima-bu'])
            ->getJson('/api/v1/bots/guest/menu')
            ->assertStatus(401);
    }

    public function test_a_missing_server_token_fails_closed(): void
    {
        // An unset secret must never mean "let everyone in".
        config()->set('telegrambots.internal_token', null);
        $this->bot();

        $this->withHeaders($this->internal())
            ->getJson('/api/v1/bots/guest/menu')
            ->assertStatus(500);
    }

    // ============ Linking a Telegram account ============

    public function test_a_guest_is_linked_by_phone_number(): void
    {
        $this->bot();
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'phone' => '+998901112233',
            'name' => 'Aziz Karimov',
        ]);
        $user->assignRole('waiter');

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/users/link', [
                'telegram_id' => 555000111,
                'phone' => '+998901112233',
                'full_name' => 'Aziz Karimov',
                'username' => 'aziz',
            ])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.full_name', 'Aziz Karimov')
            ->assertJsonPath('user.roles.0', 'waiter');

        $this->assertDatabaseHas('tg_bot_users', [
            'telegram_id' => 555000111,
            'user_id' => $user->id,
        ]);
    }

    public function test_a_phone_number_without_a_plus_still_matches(): void
    {
        // Telegram hands over the number in whichever shape the phone had it.
        $this->bot();
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'phone' => '998901112233',
        ]);

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/users/link', [
                'telegram_id' => 555000112,
                'phone' => '998901112233',
                'full_name' => 'Aziz',
            ])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_an_unknown_phone_number_is_not_linked(): void
    {
        $this->bot();

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/users/link', [
                'telegram_id' => 555000113,
                'phone' => '+998900000000',
                'full_name' => 'Notanish',
            ])
            ->assertStatus(404);

        $this->assertSame(0, BotUser::query()->count());
    }

    public function test_linking_twice_updates_rather_than_duplicates(): void
    {
        $this->bot();
        User::factory()->create(['tenant_id' => $this->tenant->id, 'phone' => '+998901112233']);

        foreach (['Aziz', 'Aziz Karimov'] as $name) {
            $this->withHeaders($this->internal())
                ->postJson('/api/v1/bots/guest/users/link', [
                    'telegram_id' => 555000114,
                    'phone' => '+998901112233',
                    'full_name' => $name,
                ])->assertOk();
        }

        $this->assertSame(1, BotUser::query()->count());
        $this->assertSame('Aziz Karimov', BotUser::query()->firstOrFail()->full_name);
    }

    public function test_linking_validates_its_input(): void
    {
        $this->bot();

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/users/link', ['telegram_id' => 'not-a-number'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['telegram_id', 'phone', 'full_name']);
    }

    // ============ Looking a linked account up ============

    public function test_a_linked_account_can_be_looked_up_by_telegram_id(): void
    {
        $bot = $this->bot();
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Dilnoza']);
        BotUser::query()->create([
            'tenant_id' => $this->tenant->id,
            'bot_id' => $bot->id,
            'user_id' => $user->id,
            'telegram_id' => 777000111,
            'linked_at' => now(),
        ]);

        $this->withHeaders($this->internal())
            ->getJson('/api/v1/bots/guest/users/777000111')
            ->assertOk()
            ->assertJsonPath('user.full_name', 'Dilnoza');
    }

    public function test_an_unlinked_telegram_id_is_a_clean_404(): void
    {
        $this->bot();

        $this->withHeaders($this->internal())
            ->getJson('/api/v1/bots/guest/users/999999999')
            ->assertStatus(404);
    }

    // ============ Command analytics ============

    public function test_a_command_is_recorded_for_analytics(): void
    {
        $this->bot();

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/commands/log', [
                'telegram_id' => 555000111,
                'command' => '/menu',
                'chat_type' => 'private',
                'latency_ms' => 42,
                'ok' => true,
            ])
            ->assertSuccessful();

        $this->assertDatabaseHas('tg_command_logs', ['command' => '/menu', 'latency_ms' => 42]);
    }

    public function test_a_failed_command_records_why(): void
    {
        $this->bot();

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/commands/log', [
                'telegram_id' => 555000111,
                'command' => '/order',
                'chat_type' => 'private',
                'latency_ms' => 5000,
                'ok' => false,
                'error' => 'Timeout',
            ])
            ->assertSuccessful();

        $log = CommandLog::query()->firstOrFail();
        $this->assertFalse((bool) $log->ok);
        $this->assertSame('Timeout', $log->error);
    }

    // ============ The guest-facing menu ============

    public function test_the_bot_serves_the_live_menu(): void
    {
        $this->bot();
        $category = MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id, 'is_active' => true, 'parent_id' => null,
            'name' => ['uz' => 'Issiq taomlar', 'ru' => 'Горячие блюда', 'en' => 'Hot dishes'],
        ]);
        MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
            'price' => 4500000,
            'is_available' => true, 'status' => 'active', 'stopped_until' => null,
        ]);

        $this->withHeaders($this->internal())
            ->getJson('/api/v1/bots/guest/menu')
            ->assertOk()
            ->assertJsonPath('channel', 'dine_in')
            ->assertJsonPath('categories.0.title', 'Issiq taomlar')
            ->assertJsonPath('categories.0.items.0.title', 'Osh')
            ->assertJsonPath('categories.0.items.0.price_tiyin', 4500000);
    }

    public function test_the_bot_never_offers_a_dish_on_the_stop_list(): void
    {
        $this->bot();
        $category = MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id, 'is_active' => true, 'parent_id' => null,
        ]);
        MenuItem::factory()->stopped()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
        ]);

        // A guest ordering something the kitchen has just pulled is worse than
        // a short menu.
        $this->withHeaders($this->internal())
            ->getJson('/api/v1/bots/guest/menu')
            ->assertOk()
            ->assertJsonCount(0, 'categories');
    }

    public function test_the_menu_answers_in_the_requested_language(): void
    {
        $this->bot();
        $category = MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id, 'is_active' => true, 'parent_id' => null,
            'name' => ['uz' => 'Issiq taomlar', 'ru' => 'Горячие блюда', 'en' => 'Hot dishes'],
        ]);
        MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
            'is_available' => true, 'status' => 'active', 'stopped_until' => null,
        ]);

        $this->withHeaders($this->internal(['X-Locale' => 'ru']))
            ->getJson('/api/v1/bots/guest/menu')
            ->assertOk()
            ->assertJsonPath('categories.0.items.0.title', 'Плов');
    }

    // ============ Not yet wired up ============

    public function test_endpoints_still_waiting_on_their_module_say_so_rather_than_inventing_data(): void
    {
        // A guest shown an invented loyalty balance will come back and ask for
        // it. Reporting 501 is the honest answer until CRM is wired in.
        config()->set('telegrambots.mock_data', false);
        $this->bot();

        foreach (['me/loyalty', 'me/tables', 'me/ready', 'me/shift'] as $path) {
            $this->withHeaders($this->internal())
                ->getJson("/api/v1/bots/guest/{$path}")
                ->assertStatus(501)
                ->assertJsonPath('code', 'FEATURE_NOT_IMPLEMENTED');
        }
    }

    public function test_feedback_is_validated_before_anything_else(): void
    {
        $this->bot();

        $this->withHeaders($this->internal())
            ->postJson('/api/v1/bots/guest/feedback', ['score' => 9])
            ->assertStatus(422)
            ->assertJsonValidationErrors('score');
    }

    // ============ Tenant isolation ============

    public function test_a_bot_key_is_resolved_within_one_restaurant(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        // The neighbour has a bot with the same key — keys are unique per
        // restaurant, not per platform.
        app(TenantContext::class)->set($other);
        $theirBot = $this->botFor($other, 'guest');
        app(TenantContext::class)->set($this->tenant);

        $this->assertNotNull($theirBot);

        // Ours does not exist yet, so the lookup must fail rather than fall
        // through to theirs.
        $this->withHeaders($this->internal())
            ->getJson('/api/v1/bots/guest/menu')
            ->assertStatus(404);
    }

    public function test_a_subscription_belongs_to_one_restaurant(): void
    {
        $bot = $this->bot();
        $botUser = BotUser::query()->create([
            'tenant_id' => $this->tenant->id,
            'bot_id' => $bot->id,
            'telegram_id' => 888000111,
        ]);

        $subscription = Subscription::query()->create([
            'bot_user_id' => $botUser->id,
            'channel' => 'orders.ready',
            'enabled' => true,
        ]);

        // Stamped automatically by BelongsToTenant — a broadcast to "everyone
        // subscribed to orders.ready" must not reach a competitor's guests.
        $this->assertSame($this->tenant->id, $subscription->refresh()->tenant_id);

        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($other);

        $this->assertSame(0, Subscription::query()->forChannel('orders.ready')->count());
    }

    // ============ Admin CRUD ============

    public function test_the_module_exposes_no_generated_admin_crud(): void
    {
        // This used to assert the scaffold route answered 401 to an anonymous
        // caller, which was true and beside the point: signed in, it answered
        // *200 to anyone* — no `tenant`, no permission, a waiter included.
        // The route is gone; the bots a restaurant runs are managed from
        // apps/admin, and the dispatcher talks to /api/v1/bots/* behind
        // `internal.bots`.
        //
        // tests/Architecture/ModuleRouteGuardTest.php is the general form of
        // this assertion. Kept here too because this is where it went wrong.
        $this->getJson('/api/v1/telegrambots')->assertStatus(404);
    }

    private function botFor(Tenant $tenant, string $key): Bot
    {
        return Bot::query()->create([
            'tenant_id' => $tenant->id,
            'key' => $key,
            'name_uz' => 'Bot', 'name_ru' => 'Бот', 'name_en' => 'Bot',
            'purpose' => 'Test', 'audience' => 'guest', 'enabled' => true,
        ]);
    }
}

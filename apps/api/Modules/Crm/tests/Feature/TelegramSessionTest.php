<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Customer;
use Modules\TelegramBots\Models\Bot;
use Tests\TestCase;

/**
 * Signing in from inside Telegram — POST /api/v1/public/telegram/session.
 *
 * The two screens in the mini app that answer "who is holding this phone" —
 * the loyalty balance and the order tracker — drew sample data for a year,
 * because verifying Telegram's signature was thought to need something the
 * platform did not have. It had it: the restaurant's own bot token, stored
 * encrypted since the Telegram module was built.
 */
final class TelegramSessionTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = '123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function connectBot(string $token = self::TOKEN): Bot
    {
        $bot = Bot::query()->create([
            'tenant_id' => $this->tenant->id,
            'key' => 'guest-'.$this->tenant->id,
            'name_uz' => 'Menyu boti',
            'name_ru' => 'Меню-бот',
            'name_en' => 'Menu bot',
            'purpose' => 'menu',
            'audience' => 'guest',
            'module' => 'menu',
            'phase' => 1,
            'enabled' => true,
        ]);

        // `token` is an accessor over `encrypted_token`, not a fillable column
        // — a restaurant pastes it into the settings screen and it is written,
        // never mass-assigned.
        $bot->token = $token;
        $bot->save();

        return $bot;
    }

    private function signedInitData(int $userId = 8_123_456, ?int $authDate = null): string
    {
        $fields = [
            'auth_date' => (string) ($authDate ?? time()),
            'query_id' => 'AAF_test',
            'user' => json_encode(['id' => $userId, 'first_name' => 'Dilnoza', 'language_code' => 'uz']),
        ];

        ksort($fields);
        $check = implode("\n", array_map(static fn (string $k): string => $k.'='.$fields[$k], array_keys($fields)));
        $fields['hash'] = hash_hmac('sha256', $check, hash_hmac('sha256', self::TOKEN, 'WebAppData', true));

        return http_build_query($fields);
    }

    private function signIn(string $initData): TestResponse
    {
        return $this->postJson('/api/v1/public/telegram/session', ['init_data' => $initData], [
            'X-Tenant' => $this->tenant->slug,
            'Idempotency-Key' => (string) Str::uuid(),
        ]);
    }

    public function test_a_signed_payload_mints_a_guest_and_a_token(): void
    {
        $this->connectBot();

        $answer = $this->signIn($this->signedInitData())->assertCreated();

        $this->assertNotEmpty($answer->json('token'));
        $this->assertSame('Dilnoza', $answer->json('data.name'));

        $guest = Customer::query()->where('telegram_user_id', 8_123_456)->firstOrFail();
        $this->assertSame($this->tenant->id, $guest->tenant_id);
        // No phone: Telegram does not share one unless the guest taps to.
        $this->assertSame('', (string) $guest->phone);
    }

    public function test_the_same_telegram_account_comes_back_to_the_same_guest(): void
    {
        $this->connectBot();

        $this->signIn($this->signedInitData())->assertCreated();
        $this->signIn($this->signedInitData())->assertCreated();

        // Their points and their order history are theirs — one row, not two.
        $this->assertSame(1, Customer::query()->where('telegram_user_id', 8_123_456)->count());
    }

    public function test_a_forged_payload_gets_nothing(): void
    {
        $this->connectBot();

        $this->signIn('auth_date='.time().'&user=%7B%22id%22%3A1%7D&hash=deadbeef')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'telegram.invalid_init_data');

        $this->assertSame(0, Customer::query()->count());
    }

    public function test_yesterdays_payload_is_not_a_permanent_credential(): void
    {
        $this->connectBot();

        $this->signIn($this->signedInitData(authDate: time() - 90_000))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'telegram.invalid_init_data');
    }

    public function test_a_restaurant_with_no_bot_is_told_so(): void
    {
        $this->signIn($this->signedInitData())
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'telegram.not_configured');
    }

    public function test_a_disabled_bot_does_not_sign_anybody_in(): void
    {
        $this->connectBot()->forceFill(['enabled' => false])->save();

        $this->signIn($this->signedInitData())
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'telegram.not_configured');
    }
}

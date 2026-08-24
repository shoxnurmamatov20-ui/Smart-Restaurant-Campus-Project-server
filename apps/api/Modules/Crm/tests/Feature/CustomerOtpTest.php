<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Customer;
use Tests\TestCase;

/**
 * Signing a guest in with a phone number and an SMS code.
 *
 * Until this existed the customer app accepted any four digits and handed over
 * to a fixture identity — every person who typed any number reached the same
 * demo guest. So these tests are less about the happy path than about the four
 * things that make a four-digit secret defensible at all: the code is not in
 * the response, it works exactly once, five wrong tries shut the number, and
 * one send a minute is all anybody gets.
 */
final class CustomerOtpTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    /** The gateway, recording rather than sending. @var object{sent: list<array{phone: string, text: string}>} */
    private object $gateway;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        /*
         * The code is read back off the gateway, never out of the response.
         *
         * That is not a testing convenience, it is the production behaviour
         * being asserted: a test that took the code from the JSON body would
         * pass only in a world where the endpoint leaked it. Locally the same
         * text reaches `storage/logs` through LogSmsSender — see SmsSenderTest,
         * which covers the driver itself.
         */
        $this->gateway = new class implements SmsSender
        {
            /** @var list<array{phone: string, text: string}> */
            public array $sent = [];

            public function send(string $phone, string $text): SmsDelivery
            {
                $this->sent[] = ['phone' => $phone, 'text' => $text];

                return SmsDelivery::accepted('test-'.count($this->sent));
            }
        };

        $this->app->instance(SmsSender::class, $this->gateway);
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @param array<string, mixed> $body */
    private function ask(array $body = [], ?Tenant $at = null): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => ($at ?? $this->tenant)->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/public/auth/otp', ['phone' => '+998901234567', ...$body]);
    }

    /** @param array<string, mixed> $body */
    private function answer(array $body = [], ?Tenant $at = null): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => ($at ?? $this->tenant)->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/public/auth/otp/verify', ['phone' => '+998901234567', ...$body]);
    }

    /** The digits the platform actually put on somebody's phone. */
    private function codeFromTheSms(): string
    {
        $last = end($this->gateway->sent);

        if ($last === false) {
            return '';
        }

        preg_match('/\d{4,6}/', $last['text'], $found);

        return $found[0] ?? '';
    }

    // ============ Sending ============

    public function test_a_code_is_sent_and_never_returned(): void
    {
        $answer = $this->ask()->assertCreated();

        $this->assertNotSame('', $this->codeFromTheSms(), 'No SMS reached the gateway.');
        $this->assertSame('+998901234567', $this->gateway->sent[0]['phone']);

        // The whole payload, checked as a whole: a `code` key appearing here
        // later — behind a flag, in development, by accident — is the failure
        // this test exists for.
        $this->assertSame(
            ['expires_in', 'retry_after', 'code_length'],
            array_keys((array) $answer->json('data')),
        );
    }

    public function test_the_message_carries_the_code_and_its_life(): void
    {
        $this->ask()->assertCreated();

        $text = end($this->gateway->sent)['text'];

        $this->assertStringContainsString($this->codeFromTheSms(), $text);
        // Five minutes, said in the message, so a guest knows whether the code
        // in a notification from ten minutes ago is worth typing.
        $this->assertStringContainsString('5', $text);
    }

    public function test_a_number_that_is_not_uzbek_is_refused_before_anything_is_spent(): void
    {
        $this->ask(['phone' => '+7 495 123 45 67'])->assertStatus(422);

        $this->assertSame('', $this->codeFromTheSms(), 'A paid SMS went to a number we cannot reach.');
    }

    public function test_one_send_a_minute_per_number(): void
    {
        $this->ask()->assertCreated();

        $this->ask()->assertApiError('crm.otp_too_soon', field: 'phone');
    }

    public function test_the_wait_is_a_number_the_client_can_count_down_from(): void
    {
        $this->ask()->assertCreated();

        $refused = $this->ask();

        // Seconds in the meta rather than a sentence: the client holds three
        // languages and this one has to reach a Russian reader in Russian.
        $this->assertGreaterThan(0, (int) $refused->json('error.retry_after'));
    }

    public function test_a_second_number_is_not_blocked_by_the_first(): void
    {
        $this->ask()->assertCreated();

        $this->ask(['phone' => '+998907654321'])->assertCreated();
    }

    // ============ Verifying ============

    public function test_the_right_code_creates_the_guest_and_returns_a_token(): void
    {
        $this->ask()->assertCreated();

        $answer = $this->answer(['code' => $this->codeFromTheSms(), 'name' => 'Dilnoza Aliyeva'])
            ->assertCreated();

        $this->assertNotEmpty($answer->json('token'));
        $this->assertSame('+998901234567', $answer->json('data.phone'));
        $this->assertSame('Dilnoza Aliyeva', $answer->json('data.name'));

        $guest = Customer::query()->where('phone', '+998901234567')->first();
        $this->assertNotNull($guest);
        $this->assertSame($this->tenant->id, $guest->tenant_id);
    }

    public function test_the_token_carries_the_customer_ability_and_nothing_else(): void
    {
        $this->ask()->assertCreated();
        $this->answer(['code' => $this->codeFromTheSms()])->assertCreated();

        $guest = Customer::query()->where('phone', '+998901234567')->firstOrFail();
        $token = $guest->tokens()->firstOrFail();

        $this->assertSame(['customer'], $token->abilities);
        // Ninety days: a consumer app on a personal phone, and a customer
        // signed out every fortnight orders from a competitor instead.
        $this->assertNotNull($token->expires_at);
        $this->assertSame(90, (int) round(now()->diffInDays($token->expires_at, absolute: true)));
    }

    public function test_signing_in_again_finds_the_same_guest(): void
    {
        $this->ask()->assertCreated();
        $this->answer(['code' => $this->codeFromTheSms()])->assertCreated();

        // Past the one-a-minute limit the honest way.
        $this->travel(2)->minutes();

        $this->ask()->assertCreated();
        $this->answer(['code' => $this->codeFromTheSms()])->assertCreated();

        $this->assertSame(1, Customer::query()->where('phone', '+998901234567')->count());
    }

    public function test_a_name_already_on_file_is_not_overwritten(): void
    {
        Customer::factory()->create(['phone' => '+998901234567', 'name' => 'Dilnoza Aliyeva']);

        $this->ask()->assertCreated();
        $this->answer(['code' => $this->codeFromTheSms(), 'name' => 'dnzzz'])->assertCreated();

        $this->assertSame(
            'Dilnoza Aliyeva',
            Customer::query()->where('phone', '+998901234567')->value('name'),
        );
    }

    public function test_a_code_works_exactly_once(): void
    {
        $this->ask()->assertCreated();
        $code = $this->codeFromTheSms();

        $this->answer(['code' => $code])->assertCreated();
        $this->answer(['code' => $code])->assertApiError('crm.otp_expired', field: 'code');
    }

    public function test_a_wrong_code_is_refused(): void
    {
        $this->ask()->assertCreated();
        $wrong = $this->codeFromTheSms() === '1111' ? '2222' : '1111';

        $this->answer(['code' => $wrong])->assertApiError('crm.otp_wrong', field: 'code');
    }

    public function test_verifying_without_asking_first_says_expired_rather_than_wrong(): void
    {
        // Two different screens: "ask for a new code" and "check what you
        // typed". Answering `wrong` here sends a guest to retype digits that
        // could never have worked.
        $this->answer(['code' => '1234'])->assertApiError('crm.otp_expired', field: 'code');
    }

    public function test_five_wrong_codes_lock_the_number(): void
    {
        $this->ask()->assertCreated();
        $right = $this->codeFromTheSms();
        $wrong = $right === '1111' ? '2222' : '1111';

        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->answer(['code' => $wrong])->assertApiError('crm.otp_wrong');
        }

        $this->answer(['code' => $wrong])->assertApiError('crm.otp_locked', field: 'code');

        // And the correct code no longer helps: the lock is on the number, and
        // the code it was being guessed at went with it.
        $this->answer(['code' => $right])->assertApiError('crm.otp_locked');
    }

    public function test_a_wrong_guess_does_not_extend_the_codes_life(): void
    {
        $this->ask()->assertCreated();
        $right = $this->codeFromTheSms();

        $this->travel(4)->minutes();
        $this->answer(['code' => $right === '1111' ? '2222' : '1111'])->assertApiError('crm.otp_wrong');

        // The code was minted five minutes ago; a re-put that reset the TTL
        // would hand a guesser another five minutes on every attempt.
        $this->travel(2)->minutes();
        $this->answer(['code' => $right])->assertApiError('crm.otp_expired');
    }

    public function test_a_blocked_guest_gets_no_token_even_with_the_right_code(): void
    {
        Customer::factory()->create(['phone' => '+998901234567', 'is_active' => false]);

        $this->ask()->assertCreated();
        $this->answer(['code' => $this->codeFromTheSms()])->assertApiError('crm.customer_blocked');

        $this->assertSame(0, Customer::query()->where('phone', '+998901234567')->firstOrFail()->tokens()->count());
    }

    // ============ One restaurant cannot sign into another ============

    public function test_a_code_issued_at_one_restaurant_does_not_work_at_another(): void
    {
        $other = $this->restaurant('lagmon-uyi');

        $this->ask()->assertCreated();
        $code = $this->codeFromTheSms();

        // The same number, the same digits, a different restaurant: the OTP
        // store is scoped by tenant, so this reads as "no code outstanding".
        $this->answer(['code' => $code], at: $other)->assertApiError('crm.otp_expired');
    }

    public function test_a_guest_of_one_restaurant_is_not_a_guest_of_another(): void
    {
        $other = $this->restaurant('lagmon-uyi');

        $this->ask()->assertCreated();
        $this->answer(['code' => $this->codeFromTheSms()])->assertCreated();

        app(TenantContext::class)->set($other);
        $this->assertSame(0, Customer::query()->where('phone', '+998901234567')->count());

        app(TenantContext::class)->set($this->tenant);
        $this->assertSame(1, Customer::query()->where('phone', '+998901234567')->count());
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Contracts\Messaging\SmsSender;
use App\Support\Messaging\EskizSmsSender;
use App\Support\Messaging\LogSmsSender;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

/**
 * The two SMS drivers.
 *
 * No request in this file reaches Eskiz. `Http::fake()` stands in for the
 * gateway, which is the only responsible way to test something that charges per
 * message and delivers to real phones — and it is also the only way to test the
 * paths that matter, because "what happens when the token expired four minutes
 * ago" is not a state anybody can arrange against a live account.
 */
final class SmsGatewayTest extends TestCase
{
    private const BASE = 'https://notify.eskiz.uz';

    private function eskiz(): EskizSmsSender
    {
        return new EskizSmsSender(
            baseUrl: self::BASE,
            email: 'ops@restaurant.uz',
            password: 'secret',
            from: '4546',
        );
    }

    // ============ Choosing one ============

    public function test_a_laptop_gets_the_log_driver(): void
    {
        config(['services.sms.driver' => 'log']);

        $this->assertInstanceOf(LogSmsSender::class, $this->app->make(SmsSender::class));
    }

    public function test_a_driver_name_nobody_wrote_is_refused_out_loud(): void
    {
        config(['services.sms.driver' => 'twilio']);
        $this->app->forgetInstance(SmsSender::class);

        $this->expectException(InvalidArgumentException::class);
        $this->app->make(SmsSender::class);
    }

    public function test_eskiz_without_credentials_refuses_to_be_built(): void
    {
        /*
         * The whole point of the constructor check. Discovering the
         * configuration is empty at the moment a customer asks for a code turns
         * a deployment mistake into a silent outage where the endpoint answers
         * 200 and no message ever arrives; a boot that fails is a deploy that
         * fails, which is the cheapest place for this to go wrong.
         */
        $this->expectException(RuntimeException::class);
        // And it names which one, so a deploy log does not send somebody to
        // check all three.
        $this->expectExceptionMessageMatches('/SMS_ESKIZ_PASSWORD/');

        new EskizSmsSender(baseUrl: self::BASE, email: 'ops@restaurant.uz', password: '', from: '4546');
    }

    // ============ The log driver ============

    public function test_the_log_driver_writes_the_code_where_a_developer_can_read_it(): void
    {
        Log::shouldReceive('channel')->once()->andReturnSelf();
        Log::shouldReceive('info')->once()->withArgs(
            fn (string $event, array $context): bool => $event === 'sms.log_driver'
                && $context['to'] === '+998901234567'
                && $context['text'] === 'Kirish kodi: 4821.',
        );

        $delivery = (new LogSmsSender)->send('+998901234567', 'Kirish kodi: 4821.');

        // A real implementation of the contract, not a null one: whatever
        // stores the gateway's reference has something to store, so the shape a
        // caller handles does not change between environments.
        $this->assertTrue($delivery->accepted);
        $this->assertNotNull($delivery->reference);
    }

    // ============ Eskiz ============

    public function test_it_logs_in_once_and_sends(): void
    {
        Http::fake([
            self::BASE.'/api/auth/login' => Http::response(['data' => ['token' => 'jwt-1']]),
            self::BASE.'/api/message/sms/send' => Http::response(['id' => '9911', 'status' => 'waiting']),
        ]);

        $delivery = $this->eskiz()->send('+998901234567', 'Kirish kodi: 4821.');

        $this->assertTrue($delivery->accepted);
        // The gateway's own id, and the only thing that makes a support
        // conversation possible three days later.
        $this->assertSame('9911', $delivery->reference);

        Http::assertSent(fn ($request): bool => $request->url() === self::BASE.'/api/message/sms/send'
            && $request->hasHeader('Authorization', 'Bearer jwt-1'));
    }

    public function test_the_token_is_reused_rather_than_fetched_per_message(): void
    {
        Http::fake([
            self::BASE.'/api/auth/login' => Http::response(['data' => ['token' => 'jwt-1']]),
            self::BASE.'/api/message/sms/send' => Http::response(['id' => '1']),
        ]);

        $gateway = $this->eskiz();
        $gateway->send('+998901111111', 'a');
        $gateway->send('+998902222222', 'b');

        // Two sends, one login. Fetching a token per message would be two round
        // trips per sign-in code and would trip the login endpoint's own limit
        // on a busy evening.
        Http::assertSentCount(3);
    }

    public function test_a_revoked_token_is_replaced_invisibly_once(): void
    {
        $sends = 0;
        Http::fake(function ($request) use (&$sends) {
            if (str_contains($request->url(), '/auth/login')) {
                return Http::response(['data' => ['token' => 'jwt-fresh']]);
            }

            $sends++;

            // The first send is refused as if the cached token had been
            // revoked; the retry with a fresh one succeeds.
            return $sends === 1
                ? Http::response(['message' => 'Unauthorized'], 401)
                : Http::response(['id' => '7']);
        });

        Cache::put('sms.eskiz.token', 'jwt-stale', now()->addDay());

        $delivery = $this->eskiz()->send('+998901234567', 'Kirish kodi: 4821.');

        $this->assertTrue($delivery->accepted);
        $this->assertSame('7', $delivery->reference);
        $this->assertSame('jwt-fresh', Cache::get('sms.eskiz.token'));
    }

    public function test_a_refusal_is_an_answer_rather_than_an_exception(): void
    {
        Http::fake([
            self::BASE.'/api/auth/login' => Http::response(['data' => ['token' => 'jwt-1']]),
            self::BASE.'/api/message/sms/send' => Http::response(['message' => 'Not enough balance'], 400),
        ]);

        $delivery = $this->eskiz()->send('+998901234567', 'Kirish kodi: 4821.');

        // "No balance" is the gateway saying no, not the code being wrong. The
        // caller turns it into `crm.otp_undeliverable` and the screen tells the
        // guest the truth instead of showing "we sent you a code".
        $this->assertFalse($delivery->accepted);
        $this->assertSame('eskiz.http_400', $delivery->reason);
    }

    public function test_a_gateway_that_will_not_let_us_in_does_not_become_a_500(): void
    {
        Http::fake([
            self::BASE.'/api/auth/login' => Http::response(['message' => 'Bad credentials'], 401),
        ]);

        $delivery = $this->eskiz()->send('+998901234567', 'Kirish kodi: 4821.');

        $this->assertFalse($delivery->accepted);
        $this->assertSame('eskiz.unauthorised', $delivery->reason);
        // And nothing was sent: two guaranteed 401s buy nothing.
        Http::assertSentCount(1);
    }

    public function test_the_national_number_goes_without_its_plus(): void
    {
        Http::fake([
            self::BASE.'/api/auth/login' => Http::response(['data' => ['token' => 'jwt-1']]),
            self::BASE.'/api/message/sms/send' => Http::response(['id' => '1']),
        ]);

        $this->eskiz()->send('+998901234567', 'Kirish kodi: 4821.');

        Http::assertSent(function ($request): bool {
            if (! str_contains($request->url(), '/message/sms/send')) {
                return false;
            }

            $body = $request->body();

            // Eskiz wants `998901234567`, and a leading plus is silently
            // treated as an invalid number rather than refused.
            return is_string($body) && str_contains($body, '998901234567')
                && ! str_contains($body, '+998901234567');
        });
    }
}

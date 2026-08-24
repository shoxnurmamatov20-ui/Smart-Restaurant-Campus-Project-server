<?php

declare(strict_types=1);

namespace App\Support\Messaging;

use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Eskiz.uz — the gateway nearly every Uzbek business sends through.
 *
 * Two calls, and the first one is the awkward part: Eskiz has no API key. You
 * post an email and a password to `/api/auth/login`, get a JWT back, and send
 * with that. The token lives about a month, so fetching one per message would
 * be two round trips for every sign-in code and would hit the login endpoint's
 * own rate limit on a busy evening. It is cached, and the cache is invalidated
 * by the only signal the gateway gives — a 401 on the send.
 *
 * ---------------------------------------------------------------------------
 * Failing loudly at the right moment
 *
 * The constructor refuses to build without credentials. That is deliberate and
 * it is why `AppServiceProvider` resolves this driver eagerly in production:
 * the alternative — discovering the configuration is empty at the moment a
 * customer asks for a code — turns a deployment mistake into a silent outage
 * where the endpoint answers 200 and no message ever arrives. A boot that
 * fails is a deploy that fails, which is the cheapest place for this to go
 * wrong.
 *
 * ---------------------------------------------------------------------------
 * What is never written down
 *
 * The message body. A sign-in code is a credential for the next five minutes,
 * and this driver's logs go wherever the platform's logs go. The length is
 * recorded because a message truncated by a wrong `from` id looks identical to
 * a delivered one otherwise; the text is not.
 */
final class EskizSmsSender implements SmsSender
{
    /**
     * Eskiz's own tokens last 30 days. Cached for 24 days rather than 29 so a
     * token is replaced well before it expires: a token that dies mid-evening
     * costs one refused send per worker, and the refresh below only triggers
     * on a 401 it has already spent a request to discover.
     */
    private const TOKEN_TTL_DAYS = 24;

    private const TOKEN_CACHE_KEY = 'sms.eskiz.token';

    public function __construct(
        private readonly string $baseUrl,
        private readonly string $email,
        private readonly string $password,
        private readonly string $from,
        private readonly int $timeoutSeconds = 8,
    ) {
        if ($this->email === '' || $this->password === '' || $this->from === '') {
            /*
             * Named individually, because "SMS is misconfigured" sends whoever
             * reads it to check all three. A deploy log has to say which one.
             */
            $missing = implode(', ', array_keys(array_filter([
                'SMS_ESKIZ_EMAIL' => $this->email === '',
                'SMS_ESKIZ_PASSWORD' => $this->password === '',
                'SMS_FROM' => $this->from === '',
            ])));

            throw new RuntimeException(
                "The Eskiz SMS driver is selected but not configured: {$missing} is empty. "
                .'Set it, or set SMS_DRIVER=log for a machine that must not send real messages.',
            );
        }
    }

    public function send(string $phone, string $text): SmsDelivery
    {
        $token = $this->token();

        // The gateway would not let us in at all. Sending anyway buys two
        // guaranteed 401s and tells the caller the same thing this does.
        if ($token === '') {
            return SmsDelivery::refused('eskiz.unauthorised');
        }

        $outcome = $this->attempt($phone, $text, $token);

        /*
         * One retry, and only for 401.
         *
         * A cached token that the gateway has since revoked is the single
         * failure this can fix, and it fixes it invisibly — the alternative is
         * a customer whose code never arrives because a token expired four
         * minutes ago. Every other refusal is retried by the person pressing
         * "send again", which is the right retry policy for something that
         * costs money each time.
         */
        if ($outcome === null) {
            Cache::forget(self::TOKEN_CACHE_KEY);
            $fresh = $this->token();

            $outcome = $fresh === '' ? null : $this->attempt($phone, $text, $fresh);
        }

        return $outcome ?? SmsDelivery::refused('eskiz.unauthorised');
    }

    /** Null means "the gateway rejected the token"; anything else is an answer. */
    private function attempt(string $phone, string $text, string $token): ?SmsDelivery
    {
        try {
            $response = Http::baseUrl($this->baseUrl)
                ->withToken($token)
                ->acceptJson()
                ->timeout($this->timeoutSeconds)
                ->asMultipart()
                ->post('/api/message/sms/send', [
                    // Eskiz wants the national number with no plus.
                    ['name' => 'mobile_phone', 'contents' => ltrim($phone, '+')],
                    ['name' => 'message', 'contents' => $text],
                    ['name' => 'from', 'contents' => $this->from],
                ]);
        } catch (ConnectionException $offline) {
            Log::warning('sms.eskiz.unreachable', ['reason' => $offline->getMessage()]);

            return SmsDelivery::refused('eskiz.unreachable');
        }

        if ($response->status() === 401) {
            return null;
        }

        if ($response->failed()) {
            Log::warning('sms.eskiz.refused', [
                'status' => $response->status(),
                // The gateway's own words, which name the actual problem —
                // no balance, a `from` id that is not approved, a number
                // outside the test allow-list.
                'message' => (string) $response->json('message', ''),
                'length' => mb_strlen($text),
            ]);

            return SmsDelivery::refused('eskiz.http_'.$response->status());
        }

        return SmsDelivery::accepted($this->reference($response->json()));
    }

    /**
     * Eskiz answers a send with either `{"id": "..."}` or `{"data": {"id": ...}}`
     * depending on the account's plan, and neither is documented as stable.
     * A missing id is not a failure — the message went — so this reads both
     * shapes and shrugs rather than throwing.
     */
    private function reference(mixed $body): ?string
    {
        if (! is_array($body)) {
            return null;
        }

        $id = $body['id'] ?? (is_array($body['data'] ?? null) ? ($body['data']['id'] ?? null) : null);

        return is_scalar($id) ? (string) $id : null;
    }

    private function token(): string
    {
        $cached = Cache::get(self::TOKEN_CACHE_KEY);

        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        try {
            $response = Http::baseUrl($this->baseUrl)
                ->acceptJson()
                ->timeout($this->timeoutSeconds)
                ->asMultipart()
                ->post('/api/auth/login', [
                    ['name' => 'email', 'contents' => $this->email],
                    ['name' => 'password', 'contents' => $this->password],
                ]);
        } catch (ConnectionException $offline) {
            Log::warning('sms.eskiz.login_unreachable', ['reason' => $offline->getMessage()]);

            return '';
        }

        $token = $response->json('data.token');

        if (! is_string($token) || $token === '') {
            Log::warning('sms.eskiz.login_refused', ['status' => $response->status()]);

            // Empty rather than an exception: a gateway that will not let us in
            // is an outage, and an outage must not turn into a 500 on a screen
            // whose honest answer is "the code did not go, try again".
            return '';
        }

        Cache::put(self::TOKEN_CACHE_KEY, $token, now()->addDays(self::TOKEN_TTL_DAYS));

        return $token;
    }
}

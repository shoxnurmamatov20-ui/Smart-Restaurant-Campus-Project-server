<?php

declare(strict_types=1);

namespace App\Support\Auth;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Issuing a one-time code, and counting the wrong ones.
 *
 * Core rather than CRM's, for the same reason {@see PinCredentials} is core:
 * the code is a credential, the counting is the only thing that makes a
 * four-digit secret defensible, and the moment a second surface wants to sign
 * somebody in by phone — the marketplace, a courier app — a second counter
 * would double every attacker's budget.
 *
 * ---------------------------------------------------------------------------
 * Why the cache and not a table
 *
 * A code is worthless five minutes after it is written and there is nothing to
 * reconcile afterwards, so a row would exist only to be pruned. The cache
 * expires it for free, and — the part that matters — a Redis key is not in a
 * backup, not in a replica, and not in the dump somebody takes to debug
 * something else. A table of live sign-in codes is a table worth stealing.
 *
 * The code itself is never stored either way: what goes in is a bcrypt hash,
 * the same as a password. A cache an operator can read with `KEYS *` would
 * otherwise be a list of every account that could be entered in the next five
 * minutes.
 *
 * The key is a hash of the phone number for the same reason. Redis keys turn up
 * in `MONITOR` output, in slow-log entries and in metrics labels; a platform's
 * whole customer list should not be reconstructable from any of those.
 *
 * ---------------------------------------------------------------------------
 * Three counters, and they are three different questions
 *
 *   **How often may this number be sent to** — one a minute, five an hour.
 *   Every send is a paid SMS, so this one is about the restaurant's balance as
 *   much as about the guest's inbox.
 *
 *   **How many wrong guesses has this number made** — five, then the number is
 *   shut for fifteen minutes. Kept beside the code so a resend does not reset
 *   it; otherwise "send again" is an infinite guess budget with extra steps.
 *
 *   **Is this number shut right now** — its own key, so the lock outlives the
 *   code that was being guessed at.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not do
 *
 * It does not find, create or authorise anybody. It says a code was sent and
 * later that a code was right; whose account that is, whether they may have one,
 * and what token it buys belong to the surface that asked.
 */
final class OtpCredentials
{
    /** Why a check turned out the way it did, in the vocabulary a caller branches on. */
    public const OK = 'ok';

    /** No code outstanding — never asked for, already used, or expired. */
    public const EXPIRED = 'expired';

    public const WRONG = 'wrong';

    public const LOCKED = 'locked';

    /**
     * Mint a code for this number, unless it has had one too recently.
     *
     * Returns null when the send would be refused; the caller answers with
     * `retryAfter()` rather than sending. The code comes back in plain text
     * exactly once — this object keeps only the hash and cannot show it again,
     * which is what stops a "resend" endpoint from ever becoming a "read the
     * code" endpoint.
     *
     * @return array{code: string, expires_in: int}|null
     */
    public function issue(?int $tenantId, string $phone): ?array
    {
        if ($this->retryAfter($tenantId, $phone) > 0) {
            return null;
        }

        RateLimiter::hit($this->minuteKey($tenantId, $phone), 60);
        RateLimiter::hit($this->hourKey($tenantId, $phone), 3600);

        $code = $this->digits();
        $ttl = self::ttlSeconds();

        Cache::put($this->codeKey($tenantId, $phone), [
            'hash' => Hash::make($code),
            'attempts' => 0,
            // Carried in the payload because `Cache` has no "write without
            // touching the TTL": a wrong guess re-puts this row, and without a
            // deadline of its own that rewrite would hand the guesser another
            // five minutes on every attempt.
            'expires_at' => now()->getTimestamp() + $ttl,
        ], now()->addSeconds($ttl));

        return ['code' => $code, 'expires_in' => $ttl];
    }

    /**
     * Seconds until this number may be sent to again. 0 = now.
     *
     * Both windows are consulted and the longer wins: a guest who has used
     * their five for the hour must be told about the hour, not offered another
     * try in sixty seconds that will be refused.
     */
    public function retryAfter(?int $tenantId, string $phone): int
    {
        $minute = RateLimiter::tooManyAttempts($this->minuteKey($tenantId, $phone), self::perMinute())
            ? RateLimiter::availableIn($this->minuteKey($tenantId, $phone))
            : 0;

        $hour = RateLimiter::tooManyAttempts($this->hourKey($tenantId, $phone), self::perHour())
            ? RateLimiter::availableIn($this->hourKey($tenantId, $phone))
            : 0;

        return max($minute, $hour);
    }

    /**
     * Are these the digits we sent?
     *
     * A correct code is destroyed as it is accepted, so it works exactly once.
     * A replayed sign-in — the second tap on a slow connection, a request
     * repeated out of an offline queue — gets `expired` rather than a second
     * token, which is the honest answer: the first one already succeeded.
     *
     * @return array{status: string, retry_after_seconds: int|null}
     */
    public function verify(?int $tenantId, string $phone, string $code): array
    {
        $now = now()->getTimestamp();
        $lockKey = $this->lockKey($tenantId, $phone);
        $lockedUntil = Cache::get($lockKey);

        if (is_int($lockedUntil) && $lockedUntil > $now) {
            return ['status' => self::LOCKED, 'retry_after_seconds' => $lockedUntil - $now];
        }

        $key = $this->codeKey($tenantId, $phone);
        $stored = Cache::get($key);

        if (! is_array($stored) || ! is_string($stored['hash'] ?? null)) {
            return ['status' => self::EXPIRED, 'retry_after_seconds' => null];
        }

        /*
         * The deadline is enforced here, not left to the cache.
         *
         * A cache TTL is the backstop — it stops a dead code occupying memory —
         * but it is the wrong thing to rely on for correctness: every driver
         * measures it differently, Redis measures it against the machine's
         * clock rather than the application's, and the row is rewritten on
         * every wrong guess. Reading the deadline the row carries makes "five
         * minutes" mean five minutes on every driver and, more to the point,
         * makes it a rule that can be tested.
         */
        $expiresAt = $stored['expires_at'] ?? null;

        if (is_int($expiresAt) && $expiresAt <= $now) {
            Cache::forget($key);

            return ['status' => self::EXPIRED, 'retry_after_seconds' => null];
        }

        if (Hash::check($code, $stored['hash'])) {
            Cache::forget($key);
            Cache::forget($lockKey);

            return ['status' => self::OK, 'retry_after_seconds' => null];
        }

        $attempts = (int) ($stored['attempts'] ?? 0) + 1;

        if ($attempts >= self::maxAttempts()) {
            /*
             * The code goes with the lock. Leaving it alive would mean the
             * fifteen minutes are a pause in the guessing rather than the end
             * of it — the attacker comes back to the same four digits with a
             * fresh budget, and the honest guest has to ask for a new code
             * anyway because they have forgotten which one they were typing.
             */
            $seconds = self::lockMinutes() * 60;
            Cache::put($lockKey, $now + $seconds, now()->addSeconds($seconds));
            Cache::forget($key);

            return ['status' => self::LOCKED, 'retry_after_seconds' => $seconds];
        }

        /*
         * Re-put rather than increment, and with the remaining TTL rather than
         * a fresh one: a wrong guess must not extend the code's life. `Cache`
         * has no "keep the TTL" write, so the remainder is carried in the
         * payload — see `expiresAt`.
         */
        Cache::put($key, [
            'hash' => $stored['hash'],
            'attempts' => $attempts,
            'expires_at' => $stored['expires_at'] ?? null,
        ], $this->remaining($stored));

        return ['status' => self::WRONG, 'retry_after_seconds' => null];
    }

    public static function length(): int
    {
        // 4..6 — the design draws four cells; six is what a tenant with a
        // stricter risk appetite can ask for without a code change.
        return max(4, min(6, (int) config('auth.otp.length', 4)));
    }

    public static function ttlSeconds(): int
    {
        return max(60, (int) config('auth.otp.ttl_seconds', 300));
    }

    public static function maxAttempts(): int
    {
        return max(1, (int) config('auth.otp.max_attempts', 5));
    }

    public static function lockMinutes(): int
    {
        return max(1, (int) config('auth.otp.lock_minutes', 15));
    }

    private static function perMinute(): int
    {
        return max(1, (int) config('auth.otp.per_minute', 1));
    }

    private static function perHour(): int
    {
        return max(1, (int) config('auth.otp.per_hour', 5));
    }

    /**
     * How long the outstanding code has left.
     *
     * Read from the payload's own deadline. A row written before that key
     * existed (or by a store that lost it) falls back to the full TTL, which errs towards the guest
     * finishing their sign-in rather than towards a code that dies early.
     */
    private function remaining(array $stored): \DateTimeInterface
    {
        $expires = $stored['expires_at'] ?? null;

        return now()->addSeconds(
            is_int($expires) ? max(1, $expires - now()->getTimestamp()) : self::ttlSeconds(),
        );
    }

    /** Zero-padded, and from a cryptographic source — `rand()` is guessable. */
    private function digits(): string
    {
        $fixed = self::fixedCode();

        if ($fixed !== null) {
            return $fixed;
        }

        $length = self::length();

        return str_pad((string) random_int(0, (10 ** $length) - 1), $length, '0', STR_PAD_LEFT);
    }

    /**
     * The one code an automated test is allowed to know, or null.
     *
     * A browser test has to sign a guest in, and the code never travels back
     * over the wire — that is this class's first rule and it is not being
     * relaxed. Locally the code goes to `storage/logs` through `LogSmsSender`,
     * which a Playwright run has no business reading: the runner is not on the
     * same machine as the API in CI, and a test that parses a log file is a test
     * that fails when somebody changes a log line.
     *
     * So the alternative is a code that is fixed rather than secret, and the
     * whole of its safety is that it cannot exist outside a test. Two locks:
     *
     * **The environment**, checked first and not configurable. `local` and
     * `testing` only. An operator who sets `OTP_TEST_CODE` on a production box —
     * by copying a `.env` from a laptop, which is how this actually happens —
     * gets random codes anyway, and `OtpTestCodeTest` proves it.
     *
     * **The variable itself**, absent by default. Unset means random even on a
     * laptop, so a developer has to opt in per machine.
     *
     * The length has to match `auth.otp.length` exactly. A four-digit code
     * against a six-digit setting would be padded or truncated somewhere and the
     * failure would read as "the SMS code is wrong", which is the least helpful
     * sentence this class can produce.
     */
    private static function fixedCode(): ?string
    {
        if (! app()->environment(['local', 'testing'])) {
            return null;
        }

        $configured = config('auth.otp.test_code');

        if (! is_string($configured)) {
            return null;
        }

        $digits = preg_replace('/\D/', '', $configured) ?? '';

        return strlen($digits) === self::length() ? $digits : null;
    }

    private function codeKey(?int $tenantId, string $phone): string
    {
        return 'otp:code:'.$this->scope($tenantId, $phone);
    }

    private function lockKey(?int $tenantId, string $phone): string
    {
        return 'otp:lock:'.$this->scope($tenantId, $phone);
    }

    private function minuteKey(?int $tenantId, string $phone): string
    {
        return 'otp:min:'.$this->scope($tenantId, $phone);
    }

    private function hourKey(?int $tenantId, string $phone): string
    {
        return 'otp:hour:'.$this->scope($tenantId, $phone);
    }

    /**
     * One number at one restaurant.
     *
     * Scoped by tenant because the same person may hold an account at two
     * restaurants on this platform, and being locked out of one must not lock
     * them out of the other — the guess was not made against that account.
     */
    private function scope(?int $tenantId, string $phone): string
    {
        return ($tenantId ?? 0).':'.hash('sha256', $phone);
    }
}

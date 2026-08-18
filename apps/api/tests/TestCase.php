<?php

declare(strict_types=1);

namespace Tests;

use App\Http\Middleware\EnsureIdempotency;
use App\Support\Errors\ErrorCatalogue;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;

abstract class TestCase extends BaseTestCase
{
    /** Whether this process has already proved it is aimed at the test database. */
    private static bool $aimedAtTestDatabase = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->refuseToRunAgainstAnythingButTheTestDatabase();
        $this->registerErrorAssertions();
        $this->forgetRateLimits();
    }

    /**
     * The suite once ran against the live database, and nothing said so.
     *
     * A `bootstrap/cache/config.php` was left in the checkout from when this
     * tree served production. When that file exists Laravel loads neither .env
     * nor the config files — so every `env()` call inside them, including the
     * ones phpunit.xml feeds DB_DATABASE through, simply never ran. The suite
     * connected to the production database with APP_ENV=production, and the
     * only thing between RefreshDatabase's `migrate:fresh` and the day's real
     * orders was the production confirmation prompt declining silently.
     *
     * The tests did not crash. They ran, inside transactions, against live
     * data — and the only symptom was assertions counting rows the test never
     * created. That is why this check exists as code and not as a note: the
     * failure mode looks like flaky tests, not like danger.
     *
     * Checked once per process, before the first test's transaction opens.
     */
    private function refuseToRunAgainstAnythingButTheTestDatabase(): void
    {
        if (self::$aimedAtTestDatabase) {
            return;
        }

        $cached = $this->app->getCachedConfigPath();

        if (file_exists($cached)) {
            Assert::fail(
                "A cached config exists at {$cached} — it silences phpunit.xml's"
                .' environment entirely, so these tests would run against whatever'
                .' database the cache names. Run `php artisan config:clear` first.'
            );
        }

        $intended = $_ENV['DB_DATABASE'] ?? '';
        $actual = (string) config('database.connections.'.config('database.default').'.database');

        if ($intended === '' || $actual !== $intended || ! str_ends_with($actual, '_test')) {
            Assert::fail(
                "The suite is connected to '{$actual}' but phpunit.xml says"
                ." '{$intended}'. A test database name must end in '_test';"
                .' refusing to run a single test against anything else.'
            );
        }

        if (config('app.env') !== 'testing') {
            Assert::fail('APP_ENV resolved to '.config('app.env').', not testing.');
        }

        self::$aimedAtTestDatabase = true;
    }

    /**
     * Start each test with an empty cache.
     *
     * CACHE_STORE is `array`, which is per-PROCESS, and PHPUnit runs the whole
     * suite in one process — so a rate-limit counter set by one test is still
     * there for the next, and the fiftieth test to hit `throttle:auth` gets a
     * 429 for something it never did. RefreshDatabase resets the database
     * between tests and nothing was resetting this.
     *
     * The symptom is order-dependent, which is the worst kind: the suite passes
     * when run one file at a time and fails when run whole.
     */
    private function forgetRateLimits(): void
    {
        Cache::store('array')->flush();

        if (config('cache.default') !== 'array') {
            Cache::flush();
        }
    }

    /**
     * Give every mutating test request a one-time key.
     *
     * Production requires `Idempotency-Key` on every write, which is correct
     * and is the foundation of offline replay. Requiring every one of two
     * hundred existing tests to set it by hand would be two hundred lines of
     * noise testing nothing, and the first missing one would fail with 400
     * rather than the thing the test was about.
     *
     * So the harness supplies a fresh key per request, exactly as a real
     * client does. A test that wants to prove the requirement itself sets the
     * header to '' and gets the refusal.
     */
    public function json($method, $uri, array $data = [], array $headers = [], $options = 0): TestResponse
    {
        if (! in_array(strtoupper((string) $method), ['GET', 'HEAD', 'OPTIONS'], true)
            && ! array_key_exists(EnsureIdempotency::HEADER, $headers)) {
            $headers[EnsureIdempotency::HEADER] = (string) Str::uuid();
        }

        return parent::json($method, $uri, $data, $headers, $options);
    }

    /**
     * Assertions for the one error envelope (API.md §1).
     *
     * Laravel's own `assertJsonValidationErrors` reads `errors.<field>` at the
     * top level, which this API no longer has: everything a failure says now
     * lives under `error`, so that a client can tell a failure from a body by
     * looking at one key. These macros say the same things against the new
     * shape, and say them in terms of the CODE rather than the sentence —
     * a test that asserts on wording fails when the wording improves.
     */
    private function registerErrorAssertions(): void
    {
        if (TestResponse::hasMacro('assertApiError')) {
            return;
        }

        /*
         * The response is this error, with the status the catalogue assigns it.
         *
         * Asserting the status from the catalogue rather than from the test is
         * deliberate: it means a code cannot quietly answer 422 in one place
         * and 409 in another, which is the drift this envelope replaced.
         */
        TestResponse::macro('assertApiError', function (string $code, ?string $field = null): TestResponse {
            /** @var TestResponse $this */
            $this->assertStatus(ErrorCatalogue::get($code)->status);
            $this->assertJsonPath('error.code', $code);

            // All three languages, always — a Russian cashier and an Uzbek
            // waiter read the same response.
            foreach (['uz', 'ru', 'en'] as $locale) {
                $message = $this->json("error.message_{$locale}");
                Assert::assertIsString($message);
                Assert::assertNotSame('', $message);
            }

            if ($field !== null) {
                $this->assertJsonPath('error.field', $field);
            }

            return $this;
        });

        /**
         * A validation failure naming these fields.
         *
         * The field names stay meaningful — `email` failing is a different bug
         * from `password` failing — so they are asserted, but through the
         * envelope's `error.errors` bag rather than the old top-level one.
         */
        TestResponse::macro('assertApiValidationErrors', function (array|string $fields): TestResponse {
            /** @var TestResponse $this */
            $this->assertApiError('request.validation_failed');

            // Laravel's own assertJsonValidationErrors takes either, and the
            // call sites that moved here were written against it.
            $fields = is_string($fields) ? [$fields] : $fields;

            $bag = $this->json('error.errors');
            Assert::assertIsArray($bag);

            foreach ($fields as $field) {
                Assert::assertArrayHasKey(
                    $field,
                    $bag,
                    "Expected validation to fail on [{$field}]; it failed on ["
                        .implode(', ', array_keys($bag)).'].',
                );
            }

            return $this;
        });
    }
}

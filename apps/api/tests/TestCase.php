<?php

declare(strict_types=1);

namespace Tests;

use App\Support\Errors\ErrorCatalogue;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->registerErrorAssertions();
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
        TestResponse::macro('assertApiValidationErrors', function (array $fields): TestResponse {
            /** @var TestResponse $this */
            $this->assertApiError('request.validation_failed');

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

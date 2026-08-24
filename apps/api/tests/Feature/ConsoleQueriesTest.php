<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Spatie\QueryBuilder\Exceptions\InvalidQuery;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;
use Throwable;

/**
 * Every list the console asks for, asked of the real router.
 *
 * The web app reads the API through `apiGet('/orders/orders?filter[open]=1')`
 * strings, and the API accepts filters from an allow-list per controller. The
 * two are written by different hands in different languages, and when they
 * drift the failure is silent: `apiGet()` returns null on a 400, the screen
 * falls back to its fixtures, and the operator's order desk quietly shows the
 * design's eight tiles instead of the menu — which is what `/calls` did in
 * production with `filter[available]`, a key no controller ever allowed.
 *
 * So: scrape the console's sources for every GET it can send, fill the
 * placeholders with plausible values, and send each one here with the
 * exception handler off. Spatie's `InvalidQuery` — an unknown filter, sort or
 * include — is one of the two failures this test is about; a 404 for a made-up
 * id or a validator refusing a placeholder is somebody else's test.
 *
 * ---------------------------------------------------------------------------
 * The second failure: a path with no route behind it at all
 *
 * The first version only watched for `InvalidQuery`, which meant a client
 * asking for an endpoint that does not exist passed in silence — the request
 * 404s, the catch-all swallows it, and the screen falls back to fixtures
 * exactly as it does for a bad filter. So every path is matched against the
 * route collection first, where "no route" and "no record" are different
 * answers rather than the same status code.
 *
 * The phone is scraped from both halves of its tree. `apps/mobile/src` holds
 * the readers, `apps/mobile/app` holds the screens, and the screens call the
 * API too — `src` alone missed them.
 */
final class ConsoleQueriesTest extends TestCase
{
    use RefreshDatabase;

    /** Placeholders as they appear in the sources, and a value the API accepts. */
    private const PLACEHOLDERS = [
        '${period}' => 'week',
        '${encodeURIComponent(month)}' => '2026-08',
        '${kind}' => 'sales',
        '${encodeURIComponent(role)}' => 'owner',
        '${encodeURIComponent(session.role.id)}' => 'owner',
        '${today}' => '2026-08-22',
        '${todayIso()}' => '2026-08-22',
        '${isoDay(now, -1)}' => '2026-08-21',
        '${isoDay(now, 1)}' => '2026-08-23',
        '${query}' => '',
        '${status}' => 'new',
    ];

    public function test_every_query_the_console_sends_is_one_the_api_accepts(): void
    {
        $queries = $this->consoleQueries();

        if ($queries === []) {
            $this->markTestSkipped('apps/web/src is not beside this checkout');
        }

        $this->seed(DatabaseSeeder::class);

        $owner = User::query()->where('email', 'owner@demo.uz')->firstOrFail();
        Sanctum::actingAs($owner);
        $this->withoutExceptionHandling();

        $rejected = [];
        $unrouted = [];

        foreach ($queries as $path) {
            /*
             * Does a route exist at all? Asked of the collection rather than by
             * reading a status, because Laravel answers 404 both for "no such
             * endpoint" and for "no such record", and only the first is drift.
             */
            try {
                Route::getRoutes()->match(Request::create('/api/v1'.$path, 'GET'));
            } catch (NotFoundHttpException) {
                $unrouted[] = $path;

                continue;
            } catch (MethodNotAllowedHttpException) {
                // The path exists under another verb — a POST endpoint scraped
                // by a GET-shaped pattern. Not a missing route.
            }

            /*
             * A savepoint per request, and the test is worthless without it.
             *
             * `RefreshDatabase` runs the whole case inside one transaction, and
             * PostgreSQL aborts a transaction the moment any statement in it
             * fails: every statement after that answers `25P02 — current
             * transaction is aborted` until somebody rolls back. One query with
             * a placeholder id that violates a constraint was therefore enough
             * to poison the rest of the loop, and because a `QueryException` is
             * not an `InvalidQuery` it landed in the catch-all below. The test
             * went green having genuinely checked the first few of a hundred and
             * sixty paths, which is the worst kind of pass: defending nothing and
             * reporting that it was.
             *
             * `beginTransaction` inside an open one issues `SAVEPOINT`, and
             * `rollBack` issues `ROLLBACK TO SAVEPOINT` — which PostgreSQL
             * accepts even in the aborted state, and which puts the connection
             * back to work for the next path.
             */
            DB::beginTransaction();

            try {
                $this->getJson('/api/v1'.$path, ['X-Tenant' => 'demo-restaurant']);
            } catch (InvalidQuery $e) {
                $rejected[] = $path.' — '.$e->getMessage();
            } catch (Throwable) {
                // A placeholder id nothing matches, a value a validator refuses:
                // not a drift between the console and the router.
            } finally {
                DB::rollBack();
            }
        }

        $this->assertSame(
            [],
            $unrouted,
            "A client asks for an endpoint the router does not have:\n".implode("\n", $unrouted),
        );
        $this->assertSame([], $rejected, "The console sends queries the API rejects:\n".implode("\n", $rejected));
    }

    /**
     * The console's `apiGet('/…')`, the staff app's `crewGet('/…')` and the
     * phone's `get('/…')` — three clients, one router.
     *
     * `crewGet` was missed for a long time and it is the one with the sharpest
     * version of this failure: it reads through the *shift* session rather than
     * the console's, and every screen behind it falls back to a fixture on a
     * refusal. A filter the API stopped allowing would leave a waiter looking at
     * six demo dishes with no error anywhere — which is the exact shape this
     * test was written to make impossible.
     *
     * A list of pairs rather than a map keyed by directory: two patterns now run
     * over `../web/src`, and a map would have silently kept one of them.
     *
     * @return list<string>
     */
    private function consoleQueries(): array
    {
        $found = [];

        foreach ([
            ['../web/src', '/apiGet(?:<[^(]*?>)?\(\s*([`\'"])([^`\'"]+)\1/s'],
            ['../web/src', '/\bcrewGet(?:<[^(]*?>)?\(\s*([`\'"])(\/[^`\'"]+)\1/s'],
            ['../mobile/src', '/\bget(?:<[^(]*?>)?\(\s*([`\'"])(\/[^`\'"]+)\1/s'],
            ['../mobile/app', '/\bget(?:<[^(]*?>)?\(\s*([`\'"])(\/[^`\'"]+)\1/s'],
        ] as [$dir, $pattern]) {
            $root = realpath(base_path($dir));

            if ($root === false) {
                continue;
            }

            $found += $this->queriesIn($root, $pattern);
        }

        return array_keys($found);
    }

    /** @return array<string, true> */
    private function queriesIn(string $root, string $pattern): array
    {
        $found = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root));

        /** @var \SplFileInfo $file */
        foreach ($files as $file) {
            if (! preg_match('/\.tsx?$/', $file->getFilename()) || str_contains($file->getFilename(), '.test.')) {
                continue;
            }

            $source = (string) file_get_contents($file->getPathname());

            if (preg_match_all($pattern, $source, $matches) === 0) {
                continue;
            }

            foreach ($matches[2] as $raw) {
                $path = strtr(trim($raw), self::PLACEHOLDERS);
                // Whatever is left is an id or a value of somebody's: `1` is as
                // good a guess as any, and a 404 is not what this test reads.
                $path = (string) preg_replace('/\$\{[^}]*\}/', '1', $path);

                if (str_starts_with($path, '/')) {
                    $found[$path] = true;
                }
            }
        }

        return $found;
    }
}

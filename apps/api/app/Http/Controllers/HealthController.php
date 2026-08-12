<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\StoredDomainEvent;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Is this node alive, and is it fit to be sent traffic?
 *
 * Two different questions, and answering them with one endpoint is how a
 * restaurant loses a lunch service. Liveness that fails when the database
 * blinks gets the container killed and restarted, which fixes nothing and
 * removes capacity; readiness that only checks the PHP process goes green while
 * every request 500s.
 *
 *   GET /api/health/live   — is the process itself working? (restart me if not)
 *   GET /api/health/ready  — can I serve a request? (stop routing to me if not)
 *   GET /api/health        — everything, for a human or a dashboard
 */
final class HealthController extends Controller
{
    /** A backlog beyond this means side effects are silently not happening. */
    private const OUTBOX_BACKLOG_LIMIT = 500;

    /**
     * Liveness — deliberately dependency-free.
     *
     * Answering at all is the whole check. If this fails, the process is wedged
     * and restarting it is the right response; a database outage is not.
     */
    public function live(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'service' => 'restaurant-campus-api',
            'time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Readiness — everything a request actually needs.
     *
     * Anything red here means "route traffic elsewhere", not "restart me".
     */
    public function ready(): JsonResponse
    {
        return $this->respond($this->criticalChecks(), detailed: false);
    }

    /** The full picture, including things that are worth knowing but not fatal. */
    public function show(): JsonResponse
    {
        return $this->respond([...$this->criticalChecks(), ...$this->advisoryChecks()], detailed: true);
    }

    /**
     * Dependencies a request cannot be served without.
     *
     * @return array<string, array{ok: bool, detail: string, ms: float, critical: bool}>
     */
    private function criticalChecks(): array
    {
        return [
            'database' => $this->probe(static function (): string {
                DB::connection()->select('select 1');

                return 'reachable';
            }),

            'cache' => $this->probe(static function (): string {
                // Written and read back: a cache that accepts writes and returns
                // nothing is the failure mode that actually happens, and a
                // connection check would miss it entirely.
                $key = 'health:'.bin2hex(random_bytes(4));
                Cache::put($key, 'ok', 5);
                $value = Cache::get($key);
                Cache::forget($key);

                if ($value !== 'ok') {
                    throw new RuntimeException('cache did not return what it stored');
                }

                return 'read-write';
            }),

            'migrations' => $this->probe(static function (): string {
                // A node running last release's schema against this release's
                // code fails in ways no other check catches — and it fails on
                // the first real request, not on deploy.
                /** @var Migrator $migrator */
                $migrator = app('migrator');

                if (! $migrator->repositoryExists()) {
                    throw new RuntimeException('never migrated');
                }

                // array_merge, not `+`: the union operator would drop the
                // default path whenever a module registered one at index 0.
                $files = $migrator->getMigrationFiles(
                    array_merge($migrator->paths(), [database_path('migrations')]),
                );

                $pending = count(array_diff(array_keys($files), $migrator->getRepository()->getRan()));

                if ($pending > 0) {
                    throw new RuntimeException("{$pending} pending");
                }

                return 'up to date';
            }),
        ];
    }

    /**
     * Worth alerting on, but not a reason to pull the node out of rotation.
     *
     * @return array<string, array{ok: bool, detail: string, ms: float, critical: bool}>
     */
    private function advisoryChecks(): array
    {
        return [
            'queue' => $this->probe(static function (): string {
                $size = Queue::size();

                return "{$size} waiting";
            }, critical: false),

            'storage' => $this->probe(static function (): string {
                // The local volume specifically, not `filesystems.default`.
                // The default is MinIO/S3 in production, and probing it here
                // would put an unbounded network round-trip on the request path:
                // a slow object store would make the health endpoint itself time
                // out and take the node down with it. Object-store reachability
                // belongs in an ops check with its own timeout.
                //
                // The local disk still matters — sessions, logs, queued payloads
                // and temporary uploads all land on it, and a full volume is
                // invisible until something tries to write.
                $disk = Storage::disk('local');
                $path = 'health/'.bin2hex(random_bytes(4)).'.txt';

                $disk->put($path, 'ok');
                $written = $disk->get($path);
                $disk->delete($path);

                if ($written !== 'ok') {
                    throw new RuntimeException('storage did not return what it stored');
                }

                return 'writable';
            }, critical: false),

            'outbox' => $this->probe(static function (): string {
                $abandoned = StoredDomainEvent::query()->abandoned()->count();
                $pending = StoredDomainEvent::query()->pending()->count();

                if ($abandoned > 0) {
                    // Every one of these is a side effect that silently did not
                    // happen — a paid bill the kitchen never heard about.
                    throw new RuntimeException("{$abandoned} undelivered");
                }

                if ($pending > self::OUTBOX_BACKLOG_LIMIT) {
                    throw new RuntimeException("{$pending} backlogged");
                }

                return "{$pending} pending";
            }, critical: false),
        ];
    }

    /**
     * @param array<string, array{ok: bool, detail: string, ms: float, critical: bool}> $checks
     */
    private function respond(array $checks, bool $detailed): JsonResponse
    {
        $failedCritical = collect($checks)->contains(
            static fn (array $check): bool => $check['critical'] && ! $check['ok'],
        );
        $failedAdvisory = collect($checks)->contains(
            static fn (array $check): bool => ! $check['critical'] && ! $check['ok'],
        );

        $status = match (true) {
            $failedCritical => 'unhealthy',
            $failedAdvisory => 'degraded',
            default => 'ok',
        };

        $body = [
            'status' => $status,
            'service' => 'restaurant-campus-api',
            'time' => now()->toIso8601String(),
            'checks' => $checks,
        ];

        if ($detailed) {
            $body['version'] = config('app.version', '0.0.0');
            $body['environment'] = config('app.env');
        }

        // Only a critical failure is a 503. A degraded node still serves
        // requests correctly, and taking it out of rotation would turn a
        // background problem into an outage.
        return response()->json($body, $failedCritical
            ? Response::HTTP_SERVICE_UNAVAILABLE
            : Response::HTTP_OK);
    }

    /**
     * Run one probe, converting any failure into a reportable result.
     *
     * The exception message is deliberately not echoed: health endpoints are
     * reachable without auth, and connection errors carry hostnames, usernames
     * and ports.
     *
     * @param callable(): string $check
     *
     * @return array{ok: bool, detail: string, ms: float, critical: bool}
     */
    private function probe(callable $check, bool $critical = true): array
    {
        $started = microtime(true);

        try {
            $detail = $check();
            $ok = true;
        } catch (Throwable) {
            $detail = 'unreachable';
            $ok = false;
        }

        return [
            'ok' => $ok,
            'detail' => $detail,
            'ms' => round((microtime(true) - $started) * 1000, 1),
            'critical' => $critical,
        ];
    }
}

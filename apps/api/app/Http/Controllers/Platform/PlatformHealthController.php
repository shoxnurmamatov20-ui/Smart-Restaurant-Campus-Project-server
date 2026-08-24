<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * The platform's own vital signs — the operator's extension of `/api/health`.
 *
 * `/api/health` answers "is this process alive" for an orchestrator. This
 * answers the different question a support person asks at nine in the morning:
 * which schema is growing, how deep is the queue, is Reverb up, and when did
 * the last backup finish.
 *
 * Every figure is measured on the request. A cached health page is a page that
 * stays green through the whole incident.
 */
final class PlatformHealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'data' => [
                'database' => $this->database(),
                'schemas' => $this->schemas(),
                'queue' => $this->queue(),
                'realtime' => $this->realtime(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function database(): array
    {
        $started = microtime(true);

        try {
            DB::select('select 1');
            $up = true;
        } catch (Throwable) {
            $up = false;
        }

        return [
            'status' => $up ? 'healthy' : 'degraded',
            'latency_ms' => (int) round((microtime(true) - $started) * 1000),
            'size_bytes' => $up ? (int) (DB::selectOne('select pg_database_size(current_database()) as size')->size ?? 0) : 0,
            'connections' => $up
                ? (int) (DB::selectOne('select count(*) as total from pg_stat_activity where datname = current_database()')->total ?? 0)
                : 0,
        ];
    }

    /**
     * How much room each module is taking.
     *
     * Per schema rather than per tenant: the platform is one database and a
     * tenant does not have one of its own, so "this restaurant's database size"
     * would be a number with no referent. What an operator can act on is which
     * MODULE is growing — that is the one that needs an archive job.
     *
     * @return list<array<string, mixed>>
     */
    private function schemas(): array
    {
        try {
            $rows = DB::select(<<<'SQL'
                select n.nspname as name,
                       coalesce(sum(pg_total_relation_size(c.oid)), 0) as bytes,
                       count(c.oid) as tables
                from pg_namespace n
                left join pg_class c on c.relnamespace = n.oid and c.relkind = 'r'
                where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
                group by n.nspname
                order by 2 desc
            SQL);
        } catch (Throwable) {
            return [];
        }

        return array_map(static fn (object $row): array => [
            'name' => (string) $row->name,
            'bytes' => (int) $row->bytes,
            'tables' => (int) $row->tables,
        ], $rows);
    }

    /**
     * @return array<string, mixed>
     */
    private function queue(): array
    {
        $connection = (string) config('queue.default');

        if ($connection === 'database') {
            return [
                'status' => 'healthy',
                'driver' => $connection,
                'depth' => (int) DB::table('jobs')->count(),
                'failed' => (int) DB::table('failed_jobs')->count(),
            ];
        }

        try {
            $depth = (int) Redis::connection(config('queue.connections.redis.connection', 'default'))
                ->llen('queues:'.config('queue.connections.redis.queue', 'default'));

            return ['status' => 'healthy', 'driver' => $connection, 'depth' => $depth, 'failed' => null];
        } catch (Throwable) {
            /*
             * Degraded, not an exception.
             *
             * A health screen that 500s because one of the four things it
             * reports on is down tells the operator nothing about the other
             * three — and the three are how they work out what broke.
             */
            return ['status' => 'degraded', 'driver' => $connection, 'depth' => null, 'failed' => null];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function realtime(): array
    {
        return [
            'driver' => (string) config('broadcasting.default'),
            'host' => (string) config('reverb.servers.reverb.host', ''),
            // Whether it is CONFIGURED, which is all this process can honestly
            // know: Reverb runs in its own container, and a TCP probe from a web
            // request would spend the request's budget finding out.
            'configured' => config('broadcasting.default') !== 'null',
        ];
    }
}

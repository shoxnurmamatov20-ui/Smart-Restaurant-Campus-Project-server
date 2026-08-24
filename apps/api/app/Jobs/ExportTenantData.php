<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Tenant;
use App\Models\TenantExport;
use App\Support\Tenancy\DatabaseTenancy;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Everything this platform holds about one restaurant, in one zip.
 *
 * The console asked for this and said why it could not be an endpoint: "a
 * synchronous endpoint would time out on the first customer with a year of
 * orders behind it". So it is a job — one row per table, walked in chunks,
 * written to a file, handed back as a link that expires.
 *
 * ---------------------------------------------------------------------------
 * The tables are discovered, never listed
 *
 * The walk asks the information schema which tables carry `tenant_id`, which
 * is the same question `RowLevelSecurityTest` asks to prove they are all
 * guarded. A hard-coded list would be correct on the day it was written and
 * quietly wrong from the next module onwards — and "quietly wrong" here means
 * a restaurant is told it has received everything we hold while a table is
 * missing from the archive. Discovery makes the eleventh module's tables
 * appear without anybody remembering this file exists.
 *
 * ---------------------------------------------------------------------------
 * Two belts, and the second one is not optional
 *
 * The walk runs inside `focusDuring()` so row-level security is on and scoped
 * to this restaurant — a queue worker has no request behind it and therefore
 * no `app.tenant_id`, which fails CLOSED and would silently produce an archive
 * of nothing.
 *
 * Every query ALSO carries an explicit `where tenant_id = ?`, and that is the
 * belt that actually matters: `public.users`, `pos.terminals` and
 * `staff.devices` are exempt from the policy by name — authentication has to
 * read them before any tenant is known — so a walk trusting the policy alone
 * would write every user account on the platform into one restaurant's
 * archive. The policy is the safety net; the predicate is the rule.
 *
 * ---------------------------------------------------------------------------
 * Secrets do not leave the building
 *
 * An archive is a file that gets mailed, copied to a laptop and forwarded. The
 * columns that authenticate somebody — password hashes, Sanctum and Expo
 * tokens, PIN hashes, TOTP secrets — are redacted by NAME rather than by a
 * per-table list, for the same reason the tables are discovered rather than
 * listed: a list stops covering new modules on the day they are written, and
 * the failure mode is a credential in a customer's downloads folder.
 */
final class ExportTenantData implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * One attempt.
     *
     * A retry would re-walk every table and write a second archive of the same
     * data, which is expensive and — because the first attempt's file is
     * already on disk under its own timestamp — leaves an orphan nobody sweeps.
     * A failed export is a row saying so and a button that asks again.
     */
    public int $tries = 1;

    /** Half an hour. A chain with a year of orders is minutes, not seconds. */
    public int $timeout = 1800;

    /**
     * A worker that kills this on timeout must still mark the row.
     *
     * Without it a job killed mid-walk leaves `state = running` forever, and
     * the console shows a spinner that will never stop. See `failed()`.
     */
    public bool $failOnTimeout = true;

    /** Rows read per round trip. A year of orders must not become a year of memory. */
    private const CHUNK = 1000;

    /**
     * Column names whose value never belongs in an archive.
     *
     * Exact names first, then suffixes — `_token` catches `device_token`,
     * `remember_token` and whatever the next module calls its own.
     *
     * @var list<string>
     */
    private const SECRET_COLUMNS = [
        'password', 'token', 'secret', 'pin', 'signature',
        'two_factor_secret', 'two_factor_recovery_codes', 'pairing_code',
    ];

    /** @var list<string> */
    private const SECRET_SUFFIXES = ['_token', '_secret', '_hash', '_password'];

    /** What a redacted value is replaced with, so a reader can see something was there. */
    private const REDACTED = '[redacted]';

    /**
     * The id, deliberately, and not the model.
     *
     * `SerializesModels` re-resolves an Eloquent model on the worker, and a
     * worker holds no tenancy: row-level security answers zero rows and the job
     * dies with ModelNotFoundException before it can record why. An integer
     * survives the queue and is resolved below, once, with the policies open.
     */
    public function __construct(private readonly int $exportId) {}

    public function handle(DatabaseTenancy $tenancy): void
    {
        $export = $tenancy->withoutTenancy(
            fn (): ?TenantExport => TenantExport::query()->withoutGlobalScopes()->find($this->exportId),
        );

        // The restaurant was deleted while this waited in the queue, taking the
        // row with it (cascade). Nothing to build and nobody to tell.
        if ($export === null) {
            return;
        }

        $tenancy->withoutTenancy(function () use ($export): void {
            $export->forceFill(['state' => TenantExport::RUNNING])->save();
        });

        try {
            /** @var array{path: string, size: int, tables: int, rows: int} $written */
            $written = $tenancy->focusDuring(
                $export->tenant_id,
                fn (): array => $this->writeArchive($export->tenant_id),
            );

            $tenancy->withoutTenancy(function () use ($export, $written): void {
                $completedAt = CarbonImmutable::now();

                $export->forceFill([
                    'state' => TenantExport::READY,
                    'path' => $written['path'],
                    'size_bytes' => $written['size'],
                    'tables' => $written['tables'],
                    'rows_count' => $written['rows'],
                    'error' => null,
                    'completed_at' => $completedAt,
                    'expires_at' => $completedAt->addHours(TenantExport::LIFETIME_HOURS),
                ])->save();
            });
        } catch (Throwable $failure) {
            /*
             * Recorded, reported, and NOT rethrown.
             *
             * The row is the record an operator reads, and it is written before
             * anything else can happen. Rethrowing would add nothing to it and
             * would, on the sync driver, hand the exception back to the HTTP
             * request that queued the export — turning "your archive failed"
             * into a 500 on a request that succeeded. `report()` still puts the
             * trace in front of whoever watches the logs.
             */
            $tenancy->withoutTenancy(function () use ($export, $failure): void {
                $export->forceFill([
                    'state' => TenantExport::FAILED,
                    'error' => Str::limit($failure->getMessage(), 480),
                    'completed_at' => CarbonImmutable::now(),
                ])->save();
            });

            report($failure);
        }
    }

    /**
     * The worker gave up on us — a timeout, an out-of-memory, a released job.
     *
     * None of those reach the catch block above, because none of them are
     * thrown inside `handle()`. Without this the row stays `running` and the
     * console spins forever on an export that stopped existing.
     */
    public function failed(?Throwable $failure): void
    {
        app(DatabaseTenancy::class)->withoutTenancy(function () use ($failure): void {
            $export = TenantExport::query()->withoutGlobalScopes()->find($this->exportId);

            if ($export === null || ! $export->isRunning()) {
                return;
            }

            $export->forceFill([
                'state' => TenantExport::FAILED,
                'error' => Str::limit($failure?->getMessage() ?? 'The worker stopped before the archive was finished.', 480),
                'completed_at' => CarbonImmutable::now(),
            ])->save();
        });
    }

    /**
     * Walk every table this restaurant owns and zip the result.
     *
     * @return array{path: string, size: int, tables: int, rows: int}
     */
    private function writeArchive(int $tenantId): array
    {
        $stamp = CarbonImmutable::now()->format('Ymd-His');
        $relative = "exports/{$tenantId}/{$stamp}.zip";
        $absolute = storage_path('app/'.$relative);

        /*
         * Built beside the real path, moved onto it only when it is finished.
         *
         * A `ready` row that points at a truncated zip is worse than a failed
         * one: the operator downloads it, it opens, and half the restaurant's
         * history is missing with nothing saying so. ZipArchive also flushes
         * from its destructor, so an exception mid-walk WOULD leave a
         * half-built file at whatever path it was opened on. It is opened on
         * this one instead, and the finally below removes it.
         */
        $building = $absolute.'.building';

        /*
         * Members are staged as files rather than built as strings.
         *
         * `ZipArchive::addFromString()` needs the whole member in memory, which
         * for `orders.orders` on a busy chain is the exact failure this job
         * exists to avoid. `addFile()` streams from disk — but it does not read
         * the file until `close()`, so the staging directory has to outlive the
         * loop and is removed afterwards.
         */
        $staging = storage_path("app/exports/{$tenantId}/.staging-{$stamp}");

        File::ensureDirectoryExists(dirname($absolute));
        File::ensureDirectoryExists($staging);

        $zip = new ZipArchive;

        if ($zip->open($building, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException("The archive could not be opened for writing at {$relative}.");
        }

        $closed = false;

        try {
            $columns = $this->columnsByTable();
            $keys = $this->primaryKeys();

            $manifest = [];
            $rows = 0;

            foreach ($columns as $table => $types) {
                $redacted = array_values(array_filter(
                    array_keys($types),
                    static fn (string $column): bool => self::isSecret($column),
                ));

                $member = $table.'.json';
                $staged = $staging.'/'.$member;

                $written = $this->writeTable($table, $tenantId, $types, $keys[$table] ?? [], $staged);

                $zip->addFile($staged, $member);

                $manifest[] = [
                    'table' => $table,
                    'rows' => $written,
                    'redacted_columns' => $redacted,
                ];

                $rows += $written;
            }

            $zip->addFromString('manifest.json', $this->manifest($tenantId, $manifest, $rows));

            // Set before the call, not after: from here the object is spent
            // either way, and calling close() on a closed archive warns.
            $closed = true;
            $zip->close();

            if (! is_file($building)) {
                throw new RuntimeException("The archive could not be finished at {$relative}.");
            }

            File::move($building, $absolute);
        } catch (Throwable $failure) {
            /*
             * Discard what was staged inside the archive before letting the
             * exception out. ZipArchive flushes from its destructor, so an
             * abandoned object would write the half-built file back onto the
             * path the finally below is about to clear.
             */
            if (! $closed) {
                $zip->unchangeAll();
                $zip->close();
            }

            throw $failure;
        } finally {
            // Whatever happened, neither the staged members nor a half-built
            // archive stay on disk. Both are no-ops on the successful path.
            File::deleteDirectory($staging);
            File::delete($building);
        }

        clearstatcache(true, $absolute);

        return [
            'path' => $relative,
            'size' => (int) filesize($absolute),
            'tables' => count($manifest),
            'rows' => $rows,
        ];
    }

    /**
     * One table, chunked, as a JSON array on disk.
     *
     * A real JSON array rather than newline-delimited objects, because the
     * archive is read by a person with a text editor at least as often as by a
     * program, and `json_decode` on a member has to just work.
     *
     * @param  array<string, string>  $types  column => PostgreSQL data type
     * @param  list<string>  $keyOrder  the table's primary key columns
     */
    private function writeTable(string $table, int $tenantId, array $types, array $keyOrder, string $path): int
    {
        File::ensureDirectoryExists(dirname($path));

        $handle = fopen($path, 'wb');

        if ($handle === false) {
            throw new RuntimeException("Could not stage {$table}.");
        }

        $written = 0;

        try {
            fwrite($handle, "[\n");

            foreach ($this->readInChunks($table, $tenantId, $keyOrder) as $row) {
                $encoded = json_encode(
                    $this->present((array) $row, $types),
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                );

                fwrite($handle, ($written === 0 ? '  ' : ",\n  ").$encoded);
                $written++;
            }

            fwrite($handle, "\n]\n");
        } finally {
            fclose($handle);
        }

        return $written;
    }

    /**
     * Rows of one table, a page at a time.
     *
     * Keyset pagination on the primary key where there is a single-column one
     * — every table on this platform but `public.idempotency_keys` uses `id`,
     * and that one is keyed by `key`, which keysets just as well. OFFSET would
     * re-scan everything it has already skipped, which on the largest table in
     * the archive is the walk getting slower the further it gets.
     *
     * A composite key falls back to OFFSET (correct, merely slower), and a
     * table with no key at all is read in one go — there is none today, and a
     * table with no primary key is a schema problem before it is an export
     * problem.
     *
     * @param  list<string>  $keyOrder
     * @return iterable<int, object>
     */
    private function readInChunks(string $table, int $tenantId, array $keyOrder): iterable
    {
        // The predicate the three RLS-exempt tables depend on. See the class
        // docblock: without it this walk exports the whole platform's users.
        $base = fn () => DB::table($table)->where('tenant_id', $tenantId);

        if (count($keyOrder) === 1) {
            $key = $keyOrder[0];
            $after = null;

            while (true) {
                $page = $base()
                    ->when($after !== null, fn ($query) => $query->where($key, '>', $after))
                    ->orderBy($key)
                    ->limit(self::CHUNK)
                    ->get();

                $last = $page->last();

                // The last row of the page IS the cursor for the next one, so
                // an empty page and an exhausted table are the same condition.
                if ($last === null) {
                    return;
                }

                foreach ($page as $row) {
                    yield $row;
                }

                $after = $last->{$key};
            }
        }

        if ($keyOrder === []) {
            yield from $base()->get();

            return;
        }

        $offset = 0;

        while (true) {
            $query = $base();

            foreach ($keyOrder as $column) {
                $query->orderBy($column);
            }

            $page = $query->offset($offset)->limit(self::CHUNK)->get();

            if ($page->isEmpty()) {
                return;
            }

            foreach ($page as $row) {
                yield $row;
            }

            $offset += self::CHUNK;
        }
    }

    /**
     * One row, as it should appear in the archive.
     *
     * Two transformations, both of which exist because the archive is read by
     * a person. `jsonb` arrives from PDO as a string, so a dish name would
     * appear as `"{\"uz\": \"Osh\"}"` — JSON quoted inside JSON — and is
     * decoded back into an object. Secret columns are replaced rather than
     * dropped, so the reader can tell the difference between "we hold nothing
     * here" and "we are not printing this".
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, string>  $types
     * @return array<string, mixed>
     */
    private function present(array $row, array $types): array
    {
        foreach ($row as $column => $value) {
            if (self::isSecret((string) $column)) {
                $row[$column] = $value === null ? null : self::REDACTED;

                continue;
            }

            $type = $types[$column] ?? '';

            if (is_string($value) && ($type === 'json' || $type === 'jsonb')) {
                $decoded = json_decode($value, true);

                if (json_last_error() === JSON_ERROR_NONE) {
                    $row[$column] = $decoded;
                }
            }
        }

        return $row;
    }

    /** Whether a column's NAME says it holds a credential. */
    private static function isSecret(string $column): bool
    {
        if (in_array($column, self::SECRET_COLUMNS, true)) {
            return true;
        }

        foreach (self::SECRET_SUFFIXES as $suffix) {
            if (str_ends_with($column, $suffix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Every table carrying `tenant_id`, with its columns and their types.
     *
     * One round trip rather than one per table, and the same question
     * `RowLevelSecurityTest` asks — deliberately, so the set of tables in an
     * archive and the set of tables under the policy cannot drift apart.
     *
     * @return array<string, array<string, string>> "schema.table" => column => type
     */
    private function columnsByTable(): array
    {
        /** @var list<object{table_schema: string, table_name: string, column_name: string, data_type: string}> $rows */
        $rows = DB::select(<<<'SQL'
            select c.table_schema, c.table_name, c.column_name, c.data_type
            from information_schema.columns c
            join information_schema.tables t
              on t.table_schema = c.table_schema and t.table_name = c.table_name
            where t.table_type = 'BASE TABLE'
              and c.table_schema not in ('pg_catalog', 'information_schema')
              and exists (
                select 1 from information_schema.columns k
                where k.table_schema = c.table_schema
                  and k.table_name = c.table_name
                  and k.column_name = 'tenant_id'
              )
            order by c.table_schema, c.table_name, c.ordinal_position
        SQL);

        $tables = [];

        foreach ($rows as $row) {
            $tables[$row->table_schema.'.'.$row->table_name][$row->column_name] = $row->data_type;
        }

        return $tables;
    }

    /**
     * Each table's primary key columns, in key order.
     *
     * @return array<string, list<string>> "schema.table" => [column, …]
     */
    private function primaryKeys(): array
    {
        /** @var list<object{table_schema: string, table_name: string, column_name: string}> $rows */
        $rows = DB::select(<<<'SQL'
            select n.nspname as table_schema, c.relname as table_name, a.attname as column_name
            from pg_index i
            join pg_class c on c.oid = i.indrelid
            join pg_namespace n on n.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
            where i.indisprimary
              and n.nspname not in ('pg_catalog', 'information_schema')
            order by n.nspname, c.relname, array_position(i.indkey::int2[], a.attnum)
        SQL);

        $keys = [];

        foreach ($rows as $row) {
            $keys[$row->table_schema.'.'.$row->table_name][] = $row->column_name;
        }

        return $keys;
    }

    /**
     * What the archive says about itself.
     *
     * The one member a human opens first. It answers the only question that
     * makes "ready" mean anything — which tables were walked and how many rows
     * came out of each — and it states the redaction policy out loud, so a
     * reader who finds `[redacted]` where a password hash used to be knows it
     * was a decision rather than a corrupt file.
     *
     * @param  list<array{table: string, rows: int, redacted_columns: list<string>}>  $tables
     */
    private function manifest(int $tenantId, array $tables, int $rows): string
    {
        $tenant = Tenant::query()->find($tenantId);

        return (string) json_encode([
            'generated_at' => CarbonImmutable::now()->toIso8601String(),
            'tenant' => [
                'id' => $tenantId,
                'name' => $tenant?->name,
                'slug' => $tenant?->slug,
            ],
            'format' => 'One JSON array per table, named {schema}.{table}.json.',
            'redaction' => 'Columns holding a credential are written as "'.self::REDACTED
                .'". Named per table below.',
            'totals' => [
                'tables' => count($tables),
                'rows' => $rows,
            ],
            'tables' => $tables,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

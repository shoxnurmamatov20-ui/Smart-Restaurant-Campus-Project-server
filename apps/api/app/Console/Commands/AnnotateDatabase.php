<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Modules\TableOwnership;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Writes each table's owning module into the database itself, as a comment.
 *
 * Each module already lives in its own PostgreSQL schema, so the tree in pgAdmin
 * shows the modular structure on its own. This adds the last mile: a comment on
 * every table naming the module that owns it, so a table read out of context —
 * in a query plan, a slow-query log, a support ticket — still says where it
 * belongs.
 *
 *   php artisan db:annotate          # apply
 *   php artisan db:annotate --dry    # just show the map
 */
final class AnnotateDatabase extends Command
{
    protected $signature = 'db:annotate
                            {--dry : Print the module → tables map without writing anything}';

    protected $description = 'Label every table in the database with the module that owns it';

    public function handle(TableOwnership $ownership): int
    {
        $byModule = $ownership->byModule()->sortKeys();
        $schemas = $ownership->schemas();

        $this->newLine();
        $this->line('  <fg=gray>Modul</>            <fg=gray>Schema</>       <fg=gray>Jadvallar</>');

        foreach ($byModule as $module => $tables) {
            $this->line(sprintf(
                '  <info>%-16s</info> <comment>%-12s</comment> <fg=gray>%2d</>  %s',
                $module,
                $schemas->get($module, '—'),
                $tables->count(),
                $this->wrap($tables->map(static fn (string $table): string => str_contains($table, '.')
                    ? explode('.', $table)[1]
                    : $table)),
            ));
        }

        $this->newLine();

        if ($this->option('dry')) {
            return self::SUCCESS;
        }

        // The platform runs on PostgreSQL everywhere, tests included, so this
        // is a guard against a misconfigured connection rather than a supported
        // alternative.
        if (DB::getDriverName() !== 'pgsql') {
            $this->warn('  '.DB::getDriverName().' — jadval izohlari faqat PostgreSQL uchun.');

            return self::SUCCESS;
        }

        $written = 0;
        $missing = [];

        foreach ($ownership->map() as $table => $module) {
            if (! Schema::hasTable($table)) {
                $missing[] = $table;

                continue;
            }

            DB::statement(sprintf(
                'COMMENT ON TABLE %s IS %s',
                DB::getQueryGrammar()->wrapTable($table),
                DB::getPdo()->quote("{$module} moduli · {$table}"),
            ));

            $written++;
        }

        $this->info("  ✅ {$written} ta jadvalga moduli yozildi.");

        if ($missing !== []) {
            // A migration declares it but the database does not have it — almost
            // always a pending migration.
            $this->warn('  ⚠️  Bazada topilmadi: '.implode(', ', $missing));
        }

        $this->line('  <fg=gray>pgAdmin → Schemas → {modul} → Tables → Comment ustuni</>');
        $this->newLine();

        return self::SUCCESS;
    }

    /**
     * @param Collection<int, string> $tables
     */
    private function wrap(Collection $tables): string
    {
        return $tables->implode(', ');
    }
}

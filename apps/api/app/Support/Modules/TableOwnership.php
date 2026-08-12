<?php

declare(strict_types=1);

namespace App\Support\Modules;

use Illuminate\Support\Collection;

/**
 * Which module owns which table, and which PostgreSQL schema it lives in.
 *
 * Derived from the migrations themselves — the module whose migration ran
 * `Schema::create('menu.menu_items')` owns that table, and declares its schema
 * in the same breath — so the map cannot drift from reality the way a
 * hand-maintained list would.
 *
 * The platform gives every module its own schema (see the 0000_01_01_000000
 * migration). This class is what lets the rest of the codebase check that the
 * arrangement still holds without hard-coding it anywhere.
 */
final class TableOwnership
{
    /** @var Collection<string, string>|null qualified table → module */
    private ?Collection $map = null;

    /**
     * Qualified table name (`menu.menu_items`) → owning module (`Menu`).
     *
     * @return Collection<string, string>
     */
    public function map(): Collection
    {
        if ($this->map !== null) {
            return $this->map;
        }

        /** @var array<string, string> $owners */
        $owners = [];

        foreach ($this->createStatementsIn(database_path('migrations')) as $table) {
            $owners[$this->qualify($table)] = 'Core';
        }

        foreach (glob(base_path('Modules/*'), GLOB_ONLYDIR) ?: [] as $modulePath) {
            $module = basename($modulePath);

            foreach ($this->createStatementsIn($modulePath.'/database/migrations') as $table) {
                $owners[$this->qualify($table)] = $module;
            }
        }

        ksort($owners);

        return $this->map = collect($owners);
    }

    /**
     * Tables grouped by module.
     *
     * @return Collection<string, Collection<int, string>>
     */
    public function byModule(): Collection
    {
        return $this->map()
            ->keys()
            ->groupBy(fn (string $table): string => $this->map()->get($table, 'Core'))
            ->map(static fn (Collection $tables): Collection => $tables->sort()->values());
    }

    /**
     * Schema each module keeps its tables in.
     *
     * A module with tables in more than one schema would show up here as the
     * last one seen; `ModuleBoundaryTest` is what refuses to let that happen.
     *
     * @return Collection<string, string>
     */
    public function schemas(): Collection
    {
        return $this->map()
            ->keys()
            ->groupBy(fn (string $table): string => $this->map()->get($table, 'Core'))
            ->map(static fn (Collection $tables): string => (string) $tables
                ->map(static fn (string $table): string => str_contains($table, '.')
                    ? explode('.', $table)[0]
                    : 'public')
                ->unique()
                ->sort()
                ->implode(', '));
    }

    /** Accepts either `menu_items` or `menu.menu_items`. */
    public function ownerOf(string $table): string
    {
        $map = $this->map();

        if ($map->has($table)) {
            return (string) $map->get($table);
        }

        $bare = str_contains($table, '.') ? explode('.', $table)[1] : $table;

        foreach ($map as $qualified => $module) {
            if (str_ends_with($qualified, ".{$bare}") || $qualified === $bare) {
                return $module;
            }
        }

        return 'Core';
    }

    /**
     * Table names created by the migrations in one directory, exactly as
     * written — qualified or not.
     *
     * @return array<int, string>
     */
    private function createStatementsIn(string $directory): array
    {
        if (! is_dir($directory)) {
            return [];
        }

        $tables = [];

        foreach (glob($directory.'/*.php') ?: [] as $file) {
            $source = (string) file_get_contents($file);

            if (preg_match_all("/Schema::create\(\s*'([a-z0-9_.]+)'/", $source, $matches) > 0) {
                foreach ($matches[1] as $table) {
                    $tables[] = $table;
                }
            }
        }

        return $tables;
    }

    /** An unqualified table belongs to `public` — that is what search_path does. */
    private function qualify(string $table): string
    {
        return str_contains($table, '.') ? $table : "public.{$table}";
    }
}

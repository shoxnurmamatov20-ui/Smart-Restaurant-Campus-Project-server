<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Models\Branch;
use App\Support\Tenancy\BranchContext;
use Illuminate\Support\Facades\DB;
use Modules\Analytics\Models\DailyFact;

/**
 * The report builder's query: a whitelist over the read model, never a passthrough.
 *
 * ---------------------------------------------------------------------------
 * Why this reads `analytics.daily_facts` and nothing else
 *
 * The builder's own TODO framed the problem exactly: *"the four bases here span
 * Orders, Finance, Inventory and Staff, and `ModuleBoundaryTest` forbids
 * Analytics from importing three of the four, so this is a set of contracts
 * rather than a join."*
 *
 * There is a fourth answer it did not list, and it is the one the module had
 * already built for this: the projection. `daily_facts` exists precisely
 * because labour and waste live behind boundaries Analytics may not cross —
 * they are pushed in nightly by `analytics:rollup` through
 * `App\Contracts\Staff\Roster` and `App\Contracts\Inventory\StockReport`. So
 * all four bases are answerable from one table, with no new edge, no contract
 * per column and no join. What it costs is honesty about the grain: this
 * builder groups a business by day, week, month or venue, and it cannot group
 * by dish or by employee, because the projection does not hold either.
 *
 * That constraint is stated rather than hidden. `catalogue()` is what the
 * console reads to draw the picker, so a column the projection cannot answer is
 * a column nobody is offered.
 *
 * ---------------------------------------------------------------------------
 * No SQL is ever built from user input
 *
 * `$base`, every column and `$group_by` are matched against the constants
 * below and anything unmatched is dropped before a query is built. The
 * aggregate expressions are literals in this file — never interpolated from a
 * request — which is what makes "a query builder over a whitelist" different
 * from "a query console with a filter".
 *
 * Ratios are computed after aggregation, never averaged. The mean of thirty
 * daily labour shares is not a month's labour share, and a report that quoted
 * it would be wrong in the direction of whichever day was quietest.
 */
final class CustomReports
{
    /** What a report can be about. Four, and the console's own keys. */
    public const BASES = ['sales', 'fin', 'stock', 'staff'];

    /** How rows are grouped. Also the console's own. */
    public const GROUPS = ['day', 'week', 'month', 'branch'];

    /**
     * Which columns each base offers, and what kind of number each is.
     *
     * The type is not decoration: `CsvReport` divides money columns by a
     * hundred on the way out, and a spreadsheet handed `45000000` for a
     * 450 000 so'm total is a file an accountant either misreads or refuses.
     *
     * @var array<string, array<string, string>>
     */
    private const COLUMNS = [
        'sales' => [
            'date' => 'text',
            'branch' => 'text',
            'orders' => 'count',
            'guests' => 'count',
            'revenue' => 'money',
            'average_cheque' => 'money',
            'discounts' => 'money',
        ],
        'fin' => [
            'date' => 'text',
            'branch' => 'text',
            'revenue' => 'money',
            'takings' => 'money',
            'cogs' => 'money',
            'expenses' => 'money',
            'gross_profit' => 'money',
            'net_profit' => 'money',
        ],
        'stock' => [
            'date' => 'text',
            'branch' => 'text',
            'cogs' => 'money',
            'waste' => 'money',
            'revenue' => 'money',
            'food_cost_percent' => 'percent',
            'waste_percent' => 'percent',
        ],
        'staff' => [
            'date' => 'text',
            'branch' => 'text',
            'labour' => 'money',
            'revenue' => 'money',
            'orders' => 'count',
            'labour_percent' => 'percent',
        ],
    ];

    /**
     * The stored columns each derived one needs.
     *
     * A gross profit is revenue minus cost of goods, so asking for it has to
     * fetch both even though neither was chosen. Without this the sum arrives
     * as zero and the report is quietly wrong rather than loudly broken.
     *
     * @var array<string, list<string>>
     */
    private const DERIVED = [
        'average_cheque' => ['revenue_tiyin', 'orders_count'],
        'gross_profit' => ['revenue_tiyin', 'cogs_tiyin'],
        'net_profit' => ['revenue_tiyin', 'cogs_tiyin', 'expenses_tiyin', 'labour_tiyin'],
        'food_cost_percent' => ['revenue_tiyin', 'cogs_tiyin'],
        'waste_percent' => ['revenue_tiyin', 'waste_tiyin'],
        'labour_percent' => ['revenue_tiyin', 'labour_tiyin'],
    ];

    /** Which stored column a plain figure sums. */
    private const SUMS = [
        'orders' => 'orders_count',
        'guests' => 'guests_count',
        'revenue' => 'revenue_tiyin',
        'takings' => 'takings_tiyin',
        'discounts' => 'discounts_tiyin',
        'expenses' => 'expenses_tiyin',
        'cogs' => 'cogs_tiyin',
        'waste' => 'waste_tiyin',
        'labour' => 'labour_tiyin',
    ];

    public function __construct(private readonly BranchContext $branches) {}

    /**
     * What a base offers, for the console's column picker.
     *
     * Shipped rather than re-declared in TypeScript, the same argument
     * `SettingsController` makes for the settings schema: two copies of a
     * whitelist drift, and the drift shows up as a 422 on a column the picker
     * offered.
     *
     * @return array<string, array<string, string>>
     */
    public static function catalogue(): array
    {
        return self::COLUMNS;
    }

    public static function offers(string $base, string $column): bool
    {
        return isset(self::COLUMNS[$base][$column]);
    }

    /**
     * Run one.
     *
     * @param list<string> $columns
     *
     * @return array<string, mixed> the same `{columns, rows, totals}` envelope
     *                              the five standard reports answer, which is
     *                              what lets the viewer and the CSV writer be
     *                              reused unchanged
     */
    public function build(string $base, array $columns, string $groupBy, ReportWindow $window): array
    {
        $chosen = array_values(array_filter(
            $columns,
            static fn (string $column): bool => isset(self::COLUMNS[$base][$column]),
        ));

        if ($chosen === []) {
            $chosen = array_slice(array_keys(self::COLUMNS[$base]), 0, 3);
        }

        $rows = $this->aggregate($chosen, $groupBy, $window);

        return [
            'kind' => 'custom',
            'base' => $base,
            'group_by' => $groupBy,
            'window' => $window->toArray(),
            'available' => true,
            'columns' => array_map(
                static fn (string $key): array => ['key' => $key, 'type' => self::COLUMNS[$base][$key]],
                $chosen,
            ),
            'rows' => $rows,
            'totals' => $this->totals($base, $chosen, $rows),
        ];
    }

    /**
     * @param list<string> $chosen
     *
     * @return list<array<string, mixed>>
     */
    private function aggregate(array $chosen, string $groupBy, ReportWindow $window): array
    {
        // Which stored columns have to be fetched: the ones asked for, plus
        // whatever the derived ones are built out of.
        $needed = [];

        foreach ($chosen as $column) {
            foreach (self::DERIVED[$column] ?? [] as $source) {
                $needed[$source] = true;
            }

            if (isset(self::SUMS[$column])) {
                $needed[self::SUMS[$column]] = true;
            }
        }

        $byBranch = $groupBy === 'branch';

        $query = DailyFact::query()
            ->whereBetween('business_date', [$window->from, $window->to]);

        /*
         * The one thing that would double every figure on this report.
         *
         * `daily_facts` holds a row per venue AND a roll-up row per restaurant
         * with a null branch. Summing both counts every so'm twice. Grouping by
         * venue reads the per-venue rows; grouping by time reads the roll-up,
         * unless the request is scoped to one venue — in which case
         * `BelongsToBranch` has already narrowed it to that venue's rows and
         * excluded the roll-up for us.
         */
        if ($byBranch) {
            $query->whereNotNull('branch_id');
        } elseif (! $this->branches->hasBranch()) {
            $query->rollup();
        }

        $bucket = match ($groupBy) {
            'week' => "to_char(date_trunc('week', business_date), 'IYYY-\"W\"IW')",
            'month' => "to_char(business_date, 'YYYY-MM')",
            'branch' => 'branch_id::text',
            default => "to_char(business_date, 'YYYY-MM-DD')",
        };

        $selects = [DB::raw("{$bucket} as bucket")];

        foreach (array_keys($needed) as $stored) {
            $selects[] = DB::raw("coalesce(sum({$stored}), 0) as {$stored}");
        }

        /*
         * `toBase()` rather than `get()` on the model: this is an aggregate,
         * not a row, and hydrating a DailyFact out of `sum(revenue_tiyin)`
         * would run every cast against a column that is no longer that column.
         * It applies the global scopes first — the tenant filter and the branch
         * filter — which is the whole reason it is not `DB::table()`.
         */
        /** @var list<object> $raw */
        $raw = $query->toBase()
            ->select($selects)
            ->groupByRaw($bucket)
            ->orderByRaw($bucket)
            ->get()
            ->all();

        $branchNames = $byBranch ? $this->branchNames() : [];

        return array_map(function (object $row) use ($chosen, $byBranch, $branchNames): array {
            $stored = (array) $row;
            $bucket = (string) ($stored['bucket'] ?? '');
            $out = [];

            foreach ($chosen as $column) {
                $out[$column] = match ($column) {
                    'date' => $byBranch ? '' : $bucket,
                    'branch' => $byBranch ? ($branchNames[$bucket] ?? $bucket) : '',
                    default => $this->figure($column, $stored),
                };
            }

            return $out;
        }, $raw);
    }

    /**
     * One cell, from the sums the database returned.
     *
     * @param array<string, mixed> $stored
     */
    private function figure(string $column, array $stored): int
    {
        $of = static fn (string $key): int => (int) ($stored[$key] ?? 0);

        return match ($column) {
            'average_cheque' => $of('orders_count') > 0
                ? intdiv($of('revenue_tiyin'), $of('orders_count'))
                : 0,
            'gross_profit' => $of('revenue_tiyin') - $of('cogs_tiyin'),
            'net_profit' => $of('revenue_tiyin') - $of('cogs_tiyin')
                - $of('expenses_tiyin') - $of('labour_tiyin'),
            'food_cost_percent' => $this->share($of('cogs_tiyin'), $of('revenue_tiyin')),
            'waste_percent' => $this->share($of('waste_tiyin'), $of('revenue_tiyin')),
            'labour_percent' => $this->share($of('labour_tiyin'), $of('revenue_tiyin')),
            default => $of(self::SUMS[$column] ?? $column),
        };
    }

    /** A percentage of a total that may be nothing. */
    private function share(int $part, int $whole): int
    {
        return $whole > 0 ? (int) round($part * 100 / $whole) : 0;
    }

    /**
     * Column totals, for the numeric columns only.
     *
     * A percent column is recomputed from its own sources rather than summed,
     * for the reason `StandardReports` gives: the sum of nine margins is not a
     * margin, and a footer reading 612% gets laughed at once and quoted in a
     * meeting afterwards. An average cheque is the same shape of mistake.
     *
     * @param list<string> $chosen
     * @param list<array<string, mixed>> $rows
     *
     * @return array<string, int>
     */
    private function totals(string $base, array $chosen, array $rows): array
    {
        $totals = [];

        foreach ($chosen as $column) {
            $type = self::COLUMNS[$base][$column] ?? 'text';

            if ($type === 'text') {
                continue;
            }

            if ($type === 'percent' || $column === 'average_cheque') {
                // Deliberately absent rather than wrong. The viewer prints an
                // em dash where a footer has no figure.
                continue;
            }

            $totals[$column] = (int) array_sum(array_map(
                static fn (array $row): int => (int) ($row[$column] ?? 0),
                $rows,
            ));
        }

        return $totals;
    }

    /**
     * Venue ids to names, for the branch grouping.
     *
     * Read through the model so the tenant scope applies — a name looked up by
     * raw id would answer for another restaurant's venue the moment two of them
     * hold the same id, and they will.
     *
     * @return array<string, string>
     */
    private function branchNames(): array
    {
        return Branch::query()
            ->pluck('name', 'id')
            ->mapWithKeys(static fn (string $name, int|string $id): array => [(string) $id => $name])
            ->all();
    }
}

<?php

declare(strict_types=1);

use App\Support\Tenancy\BusinessDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Store the trading day, stop deriving it.
 *
 * DECISIONS Q3: a restaurant's day runs 06:00 → 06:00, and every report groups
 * by `business_date`, never by `created_at`. That has been computed per query
 * so far, which is correct arithmetic and four impossible features:
 *
 *   - the partial index of DATABASE.md §19, which needs a column to index;
 *   - the daily_branch_metrics rollup, which needs a column to group by;
 *   - the day_closes primary key (tenant, branch, business_date);
 *   - and reject_closed_period(), which is a DATABASE trigger and cannot call
 *     back into PHP to ask which trading day a row belongs to.
 *
 * The backfill runs through the same helper that computes it at read time, so
 * historical rows land where the reports have been putting them all along.
 */
return new class extends Migration
{
    /** @var array<string, string> table => the timestamp the day is derived from */
    private const TABLES = [
        'orders.orders' => 'placed_at',
        'finance.payments' => 'paid_at',
        'finance.expenses' => 'spent_at',
        'inventory.stock_movements' => 'happened_at',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table => $source) {
            Schema::table($table, function (Blueprint $blueprint) use ($table): void {
                $blueprint->date('business_date')->nullable()->after('tenant_id');

                // Every report groups by (tenant, business_date); the branch
                // narrows it to one venue, which is the shape of a Z-report.
                $blueprint->index(
                    ['tenant_id', 'business_date'],
                    str_replace('.', '_', $table).'_tenant_business_date_index',
                );
            });

            $this->backfill($table, $source);
        }
    }

    public function down(): void
    {
        foreach (array_keys(self::TABLES) as $table) {
            Schema::table($table, function (Blueprint $blueprint) use ($table): void {
                $blueprint->dropIndex(str_replace('.', '_', $table).'_tenant_business_date_index');
                $blueprint->dropColumn('business_date');
            });
        }
    }

    /**
     * Walk the table in chunks and stamp each row.
     *
     * Chunked rather than one UPDATE, because the boundary depends on the
     * tenant's timezone and start hour, which SQL does not know — and because
     * a single statement over a year of orders holds a lock nobody wants
     * during service.
     */
    private function backfill(string $table, string $source): void
    {
        $businessDay = app(BusinessDay::class);

        DB::table($table)
            ->select('id', $source, 'created_at')
            ->orderBy('id')
            ->chunk(500, function ($rows) use ($table, $source, $businessDay): void {
                foreach ($rows as $row) {
                    // `placed_at` is null on a draft that was never fired, and
                    // `paid_at` on a payment still pending — fall back to when
                    // the row appeared, which is the best the data supports.
                    $at = $row->{$source} ?? $row->created_at;

                    if ($at === null) {
                        continue;
                    }

                    DB::table($table)->where('id', $row->id)->update([
                        'business_date' => $businessDay->dateFor(
                            CarbonImmutable::parse($at),
                        ),
                    ]);
                }
            });
    }
};

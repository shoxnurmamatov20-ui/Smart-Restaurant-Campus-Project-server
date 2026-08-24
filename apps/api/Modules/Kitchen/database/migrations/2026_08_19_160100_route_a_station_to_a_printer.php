<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which printer the grill's dockets come out of.
 *
 * Nullable on purpose, and the fallback matters more than the column: a station
 * with no printer of its own uses the branch's default kitchen printer. Most
 * restaurants have one printer at the pass and five stations pointing at it,
 * and forcing every one of them to be configured before anything prints would
 * mean a venue that goes live on a Friday night prints nothing at all.
 *
 * `nullOnDelete`, not cascade. Unplugging a printer must not delete the station
 * — the grill still exists, it just has no paper, which is exactly what the
 * status bar is there to say.
 *
 * `branch_id` is not added here: `2026_08_13_000200_add_branch_id_to_scoped_tables`
 * already gave it to every station, along with the tickets, the halls and the
 * till shifts. The plan's P8 line asks for both; only this half was outstanding.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen.kitchen_stations', function (Blueprint $table): void {
            $table->foreignId('printer_id')->nullable()->after('branch_id')
                ->constrained('kitchen.printers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('kitchen.kitchen_stations', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('printer_id');
        });
    }
};

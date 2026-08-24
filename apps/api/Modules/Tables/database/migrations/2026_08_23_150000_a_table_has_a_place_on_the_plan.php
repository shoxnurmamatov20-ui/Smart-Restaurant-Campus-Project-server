<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a table sits on the plan.
 *
 * The floor screen draws tiles in whatever order the rows came back — id order,
 * in practice — so a room that a host reads left to right, window to kitchen,
 * is drawn in the order somebody happened to type it in. Every restaurant then
 * fixes it the same way: by renaming tables until the numbers sort correctly,
 * which breaks as soon as one is added between two others.
 *
 * ---------------------------------------------------------------------------
 * A place in a sequence, not an (x, y)
 *
 * The design's plan is a wrapping grid of equal tiles rather than a scale
 * drawing of the room, so what a tile needs is a POSITION in its hall and not a
 * coordinate. Coordinates would be the honest column for a drag-and-drop canvas
 * over a floor plan image — a different screen, with a background, a zoom and a
 * table shape — and a schema that promised them while the console drew a grid
 * would be a promise nothing could keep.
 *
 * Zero is "unplaced", which is every row that exists today. The board falls
 * back to the label for those, so a restaurant that never opens the editor sees
 * exactly what it sees now.
 *
 * `hall_id` is already updatable, so moving a table between rooms needed no
 * column — only a screen. The two together are what "edit layout" means.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tables.restaurant_tables', function (Blueprint $table): void {
            $table->unsignedSmallInteger('position')->default(0)->after('kind')
                ->comment('Where the tile sits within its hall; 0 means unplaced');
        });

        Schema::table('tables.restaurant_tables', function (Blueprint $table): void {
            // "The plan for this room, in order" — the floor screen's only
            // query, and the one the console repeats on every realtime nudge.
            $table->index(['tenant_id', 'hall_id', 'position'], 'restaurant_tables_plan_order');
        });
    }

    public function down(): void
    {
        Schema::table('tables.restaurant_tables', function (Blueprint $table): void {
            $table->dropIndex('restaurant_tables_plan_order');
            $table->dropColumn('position');
        });
    }
};

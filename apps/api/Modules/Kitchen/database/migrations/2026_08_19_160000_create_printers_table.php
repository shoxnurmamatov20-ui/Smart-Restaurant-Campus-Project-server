<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The pieces of hardware a service actually runs on.
 *
 * A printer is a physical object bolted to a wall in one room, which is why it
 * carries `branch_id` and not merely `tenant_id`: a chain's Chilonzor grill
 * must never be handed a docket for a table in Termiz, and the only thing
 * standing between those two is this column.
 *
 * **Why this table lives in the kitchen's schema.** It is the pass that needs
 * paper most, and the plan already ties a printer to a station. The till's
 * receipt printer and its cash drawer are in here too, which reads oddly for
 * about a minute and then stops: they are the same class of device, spoken to
 * the same way, dying the same way, and a second registry would mean two places
 * to look when a waiter says "nothing is printing". Pos never imports any of
 * this — it goes through App\Contracts\Printing\PrintSpooler, the same way it
 * reaches bills and money. If the estate ever grows past what a kitchen module
 * should own, the tables move to a Printing module and the contract does not
 * change, which is the whole reason the contract is there.
 *
 * `columns` rather than a millimetre width, because a renderer wraps text at a
 * character count and nothing else. 48 is an 80 mm roll in Font A; some Chinese
 * boards run 42, and a 58 mm roll is 32. Getting it wrong does not fail — it
 * wraps a receipt into unreadable confetti — so it is per device and not a
 * constant.
 */
return new class extends Migration
{
    private const TABLE = 'kitchen.printers';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::create(self::TABLE, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->string('code', 32)->comment('Stable handle used in config and logs, e.g. grill-1');
            $table->string('name', 120);

            // What it is for, not what it is. A station routes to a `kitchen`
            // printer; a settlement routes to a `receipt` one. Nothing else in
            // the platform has to know the difference between two thermal
            // printers that are physically identical.
            $table->string('role', 16)->default('kitchen')->comment('kitchen | receipt | label');

            // How the bytes get there. `agent` is the local daemon pulling this
            // branch's queue; `network` is a printer with its own IP that the
            // agent opens a socket to. Both go through the agent — nothing in
            // this application ever opens a socket to a printer itself, because
            // a printer that stops answering must not be able to hold a web
            // worker open while a waiter waits for a bill.
            $table->string('connection', 16)->default('agent')->comment('agent | network');
            $table->string('target', 190)->nullable()->comment('10.0.0.31:9100, /dev/usb/lp0, or a share name');

            $table->unsignedSmallInteger('columns')->default(48)->comment('48 = 80mm Font A; 42 and 32 are real too');
            $table->string('codepage', 16)->default('cp866')->comment('cp866 | cp1251 | ascii');

            $table->boolean('cuts')->default(true)->comment('Has a guillotine');
            // The drawer is wired to the printer, not to the computer: it opens
            // because a receipt printer was told to kick pin 2. So "can this
            // till open its drawer" is a property of a printer.
            $table->boolean('opens_drawer')->default(false);
            $table->unsignedTinyInteger('copies')->default(1);

            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false)->comment('Picked when nothing names a printer');

            // Liveness, written by the agent's heartbeat and by job outcomes.
            // These three columns are the whole answer the status bar renders.
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('failing_since')->nullable()->comment('First failure of the current run of them');
            $table->string('last_error', 255)->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'code']);
            // The routing lookup: "the active receipt printer for this venue".
            $table->index(['tenant_id', 'branch_id', 'role', 'is_active']);
        });

        // Row-level security, because the migration that armed the other forty
        // tables ran before this one existed and will not run again.
        // RowLevelSecurityTest fails on any table carrying tenant_id without it.
        DB::statement('alter table '.self::TABLE.' enable row level security');
        DB::statement('alter table '.self::TABLE.' force row level security');
        DB::statement('drop policy if exists tenant_isolation on '.self::TABLE);
        DB::statement(
            'create policy tenant_isolation on '.self::TABLE.' for all'
            .' using ('.self::RULE.') with check ('.self::RULE.')',
        );
    }

    public function down(): void
    {
        DB::statement('drop policy if exists tenant_isolation on '.self::TABLE);
        Schema::dropIfExists(self::TABLE);
    }
};

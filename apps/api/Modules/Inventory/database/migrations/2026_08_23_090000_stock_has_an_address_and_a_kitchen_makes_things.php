<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The table `2026_08_22_110000` named and postponed, plus the half-made goods.
 *
 * ---------------------------------------------------------------------------
 * `stock_levels`: a balance that knows where it is
 *
 * The previous migration put a `store` label on the ingredient — main, kitchen,
 * bar — and said in as many words why that is a label rather than an address:
 * *"A shelf label is a place inside a venue; it is not a venue."* It then named
 * what a venue would need: *"per-branch stock levels … need their own tables
 * rather than a column"*.
 *
 * This is that table, and the reason it could not be postponed further is the
 * transfer form on the operations screen. Its own comment states the failure
 * exactly: post the two legs of a five-venue transfer against one tenant-wide
 * balance and `-25 kg` plus `+25 kg` net to zero on the same row — *"the ledger
 * would show a transfer happened and the shelf would be unchanged, which is
 * worse than the button doing nothing, because it looks like it worked."*
 *
 * **What this table is NOT.** It is not a replacement for
 * `ingredients.stock_quantity`. That column stays the restaurant's total and
 * stays authoritative — every movement still writes it, `lowStock()` still
 * compares against it, and a restaurant with one venue never has to care that
 * this table exists. `stock_levels` is the breakdown: the same movements,
 * attributed. A transfer nets to zero on the total, which is correct — the
 * business still owns 25 kg — and moves two rows here, which is the part the
 * storekeeper was missing.
 *
 * `branch_id` is NOT NULL here, unlike everywhere else on the platform. The
 * usual rule is "no branch means every branch", and a roll-up row in a table
 * whose only purpose is to say *which* venue would be a row that means the
 * opposite of the table. Stock booked with no branch in context simply moves
 * the tenant total and writes nothing here, which is exactly what a
 * single-venue restaurant does all day.
 *
 * ---------------------------------------------------------------------------
 * `prep_items` and `prep_components`: what the kitchen makes before service
 *
 * Zirvak, broth, dough, mince. A restaurant buys none of them and consumes all
 * of them, and until now the platform could only describe the two ends: a sack
 * of flour arrives, a plate of manti leaves. The twelve kilos of dough in
 * between existed on the operations screen as a fixture and nowhere else, which
 * means every food cost quoting a dough line was quoting a number typed into a
 * browser.
 *
 * Two decisions worth stating:
 *
 *  - **`loss_percent` is on the item, not on the batch.** Water boils off at a
 *    rate the recipe decides, not the cook — eight litres of stock reduced to
 *    six and a half still cost what eight litres of beef and onion cost, and
 *    the yield is what a dish should be costed against. `stock-ops-data.ts`
 *    already computes it this way and this column is where its number moves to.
 *  - **`on_hand` is one number, not one per venue.** Prep is made in the
 *    kitchen that will serve it and never travels; a per-branch balance for a
 *    tray of dough would be five rows, four of them permanently zero. When a
 *    chain genuinely preps centrally, that is a transfer of a prep item and it
 *    needs this table to have grown a `stock_levels` sibling — not a column.
 *
 * ---------------------------------------------------------------------------
 * `stock_transfers` and `stock_transfer_lines`
 *
 * Three statuses and all three are reachable, which is the test a status column
 * has to pass: `draft` is written and nothing moves, `sent` posts the out-leg
 * at the origin, `received` posts the in-leg at the destination. The gap
 * between the last two is not bureaucracy — it is the van, and stock inside it
 * belongs to neither shelf. That is what the `delivered` chip on the operations
 * screen has always been drawn for.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * Where a movement happened.
         *
         * Nullable, because most of the platform's stock history predates the
         * question and because a single-venue restaurant never answers it. The
         * model reads it through `BelongsToBranch`, so an unset branch is a
         * roll-up over every venue rather than a filter that hides rows.
         */
        Schema::table('inventory.stock_movements', function (Blueprint $table): void {
            $table->foreignId('branch_id')->nullable()->after('tenant_id')
                ->constrained('public.branches')->nullOnDelete();
        });

        Schema::create('inventory.stock_levels', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('public.branches')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('inventory.ingredients')->cascadeOnDelete();
            $table->integer('quantity')->default(0)
                ->comment('Base units on this venue’s shelf. Signed: a negative is an unposted consumption');
            $table->timestamps();

            // One balance per product per venue — the upsert key, and the
            // reason two tabs posting the same transfer cannot make two rows.
            $table->unique(['tenant_id', 'branch_id', 'ingredient_id'], 'stock_levels_one_per_venue');
            // "What is on this venue's shelves" — the storekeeper's whole
            // screen, and the only other query shape this table sees.
            $table->index(['tenant_id', 'branch_id']);
        });

        Schema::create('inventory.prep_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('code', 32)->comment('zirvak | broth | dough — what the recipe card refers to');
            // Trilingual like every guest- and staff-visible name on the
            // platform (CLAUDE.md, binding convention 10).
            $table->jsonb('name');
            $table->string('unit', 8)->default('g')->comment('g | ml — the base unit a batch is measured in');
            $table->unsignedInteger('batch_quantity')->comment('What one batch yields BEFORE loss, in base units');
            $table->unsignedSmallInteger('loss_percent')->default(0)->comment('Water, trim, evaporation');
            $table->unsignedSmallInteger('shelf_life_days')->default(1);
            $table->integer('on_hand')->default(0)->comment('Usable base units in the kitchen right now');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'is_active']);
        });

        Schema::create('inventory.prep_components', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('prep_item_id')->constrained('inventory.prep_items')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('inventory.ingredients')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->comment('Base units of the ingredient in ONE batch');
            $table->timestamps();

            // A component appears once per card. Listing beef twice is two
            // lines a cook has to add up, and a card nobody can audit.
            $table->unique(['prep_item_id', 'ingredient_id']);
        });

        Schema::create('inventory.stock_transfers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->string('number', 32)->comment('TRF-000148 — what both venues quote on the phone');
            $table->foreignId('from_branch_id')->constrained('public.branches')->cascadeOnDelete();
            $table->foreignId('to_branch_id')->constrained('public.branches')->cascadeOnDelete();
            $table->string('status', 16)->default('draft')->comment('draft | sent | received');
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('public.users')->nullOnDelete();
            $table->datetime('sent_at')->nullable();
            $table->datetime('received_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
            // The destination's "what is coming to me" query. The origin reads
            // the tenant+status index above, which already leads with what it
            // filters on.
            $table->index(['tenant_id', 'to_branch_id', 'status']);
        });

        Schema::create('inventory.stock_transfer_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('stock_transfer_id')->constrained('inventory.stock_transfers')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('inventory.ingredients')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->comment('Base units moved. Unsigned: direction is the transfer’s');
            /*
             * What one base unit was worth when it left.
             *
             * Frozen on the line rather than read from the ingredient, because
             * a transfer is what one venue charges another and the price moves
             * every delivery. A report run in November against today's cost
             * would restate what Chilonzor billed Termiz in August.
             */
            $table->unsignedBigInteger('unit_cost_tiyin')->default(0);
            $table->timestamps();

            $table->unique(['stock_transfer_id', 'ingredient_id']);
        });

        RowLevelSecurity::guard(
            'inventory.stock_levels',
            'inventory.prep_items',
            'inventory.prep_components',
            'inventory.stock_transfers',
            'inventory.stock_transfer_lines',
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory.stock_transfer_lines');
        Schema::dropIfExists('inventory.stock_transfers');
        Schema::dropIfExists('inventory.prep_components');
        Schema::dropIfExists('inventory.prep_items');
        Schema::dropIfExists('inventory.stock_levels');

        Schema::table('inventory.stock_movements', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};

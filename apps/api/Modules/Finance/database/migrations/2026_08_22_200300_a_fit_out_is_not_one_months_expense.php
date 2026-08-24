<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the restaurant bought once and uses for years.
 *
 * A combi oven costs about as much as a month of wages and lasts seven years.
 * Booked as an expense it wipes out the month it was bought in and flatters the
 * eighty-three months after it — so an owner reading a P&L sees one catastrophic
 * March and a suspiciously profitable year, and neither figure is true. Spreading
 * the cost over the life is the whole reason this register exists, and it is why
 * the P&L has an "Amortizatsiya" line with nothing behind it today.
 *
 * ---------------------------------------------------------------------------
 * Straight line, and only straight line
 *
 * `cost ÷ useful_life_months`, taken whole from the month after acquisition
 * until the cost is recovered. Declining balance and units-of-production exist
 * and neither is what a restaurant's accountant uses for a fryer; a `method`
 * column offering three choices, two of which nobody picks and no code
 * implements, would be a promise on a screen.
 *
 * The last month gets the remainder rather than the quotient. 7 000 000 over 60
 * months is 116 666 with a 40-tiyin tail, and sixty equal instalments leave the
 * asset at 40 tiyin forever — which shows up years later as a register that will
 * not close.
 *
 * ---------------------------------------------------------------------------
 * Nothing is posted anywhere
 *
 * Depreciation is COMPUTED from these rows when a statement asks for it
 * (`Modules\Finance\Services\Depreciation`), not written into `finance.expenses`
 * every month by a scheduled job. Two reasons, and the second is the one that
 * decides it: a monthly posting job that runs twice books the charge twice, and
 * a restaurant that corrects a purchase price afterwards would have to unwind
 * every posting since. Derived, a corrected cost restates itself.
 *
 * `disposed_on` stops the clock. A fryer sold in March depreciates through
 * February and not one month further, and the row stays — an asset that vanished
 * from the register would take its history off every statement it appeared on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.fixed_assets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * Which venue holds it, and why this one IS per branch when an
             * accounting period is not.
             *
             * A period is a filing and a business files once. An oven stands in
             * one kitchen: a manager comparing two venues' running costs needs
             * the depreciation to land where the asset is, and an owner closing a
             * branch needs to know what walks out with it.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            $table->string('name', 160);

            /*
             * What it is. `equipment` (the oven), `furniture` (the tables),
             * `fit_out` (the room itself — wiring, extraction, the bar) and
             * `vehicle` (the delivery van). Four, because the useful lives
             * differ by years and because that is the split an owner already
             * has in their head.
             */
            $table->string('category', 24)->default('equipment');

            $table->date('acquired_on');
            $table->unsignedBigInteger('cost')->comment('Purchase price in tiyin (1 UZS = 100 tiyin)');

            /*
             * The salvage value, in tiyin.
             *
             * What the thing is expected to be worth at the end of its life —
             * usually zero for a restaurant, not zero for a van. Depreciation is
             * over `cost − residual`, so a van that will sell for a quarter of
             * its price does not depreciate that quarter away and then reappear
             * as a profit on the day it is sold.
             */
            $table->unsignedBigInteger('residual')->default(0);

            $table->unsignedSmallInteger('useful_life_months');

            // Sold, scrapped or written off. Depreciation stops the month it
            // happened; the row stays, because the history on every statement it
            // already appeared in has to keep adding up.
            $table->date('disposed_on')->nullable();
            $table->string('note', 255)->nullable();

            $table->timestamps();

            // "This restaurant's live assets, this venue" — the register's own
            // query, and the one the monthly charge is summed over.
            $table->index(['tenant_id', 'branch_id', 'disposed_on']);
        });

        RowLevelSecurity::guard('finance.fixed_assets');
    }

    public function down(): void
    {
        Schema::dropIfExists('finance.fixed_assets');
    }
};

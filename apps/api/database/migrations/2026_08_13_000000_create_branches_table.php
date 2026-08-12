<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A branch is one venue of one restaurant business.
 *
 * The platform reads Tenant → Branch → Terminal. Until now it stopped at the
 * tenant: "Osh Markazi with four branches is a single tenant" was true, but
 * nothing recorded which of the four a table, an order or a till belonged to.
 * Every screen in the product assumes otherwise — the top bar carries a branch
 * switcher, a manager is scoped to one venue while the owner spans all of them,
 * and stock transfers move goods between two of them.
 *
 * It lives in `public`, next to tenants and users, because it is core: several
 * modules point at it and none of them owns it. `pos.terminals` already
 * carried a `branch_id` with the comment "no FK: branches are not owned by
 * Pos" — this is the table that column was waiting for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.branches', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained('public.tenants')->cascadeOnDelete();

            $table->string('name', 120);
            /** Unique per restaurant, not globally: two chains may both have a "Chilonzor". */
            $table->string('slug', 64);
            $table->string('code', 16)->nullable()
                ->comment('Short human code used on receipts and in exports, e.g. CHZ');

            $table->string('city', 80)->nullable();
            $table->string('address', 255)->nullable();
            $table->string('phone', 32)->nullable();

            /**
             * A chain can cross time zones — Termiz and Tashkent do not, but a
             * business day boundary is decided per venue and the reporting has
             * to agree with the clock on the wall.
             */
            $table->string('timezone', 64)->default('Asia/Tashkent');

            $table->string('status', 16)->default('active')
                ->comment('active | suspended | archived');

            $table->date('opened_at')->nullable();

            /** Service charge, VAT, business-day start — per venue, so not columns. */
            $table->json('settings')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('public.branches');
    }
};

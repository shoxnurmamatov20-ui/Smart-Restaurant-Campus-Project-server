<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many people looked at the restaurant's website, and at what.
 *
 * The console's Site → Traffic tab drew a whole dashboard — "4 820 visits this
 * week, +18.4%", a 6.1% conversion rate, a source breakdown and a page ranking
 * — for a platform where nothing counted a visit. Not an endpoint that was
 * missing: a fact. The tab now says so on a live console, and this is the
 * counter that lets it stop saying it.
 *
 * ---------------------------------------------------------------------------
 * A daily aggregate, not a row per hit
 *
 * One row per (restaurant, day, path), incremented. A visit log would be the
 * flexible choice and the wrong one here: the question this table exists to
 * answer is "how did the week go", nobody on the platform is ever shown an
 * individual visit, and a table that grows by every page view on every
 * restaurant's site is a table somebody has to write a retention policy for
 * before the first quarter is out.
 *
 * It also means nothing personal is stored. No address, no fingerprint, no
 * session id — the counter goes up and that is the whole record. A restaurant's
 * marketing figure should not need a cookie banner to exist.
 *
 * ---------------------------------------------------------------------------
 * First-party, and that is the point
 *
 * The alternative was a script tag from somebody else's analytics product,
 * which means the restaurant's traffic figures live outside the platform, the
 * console cannot draw them, and a page that is meant to be fast loads a third
 * party before it renders. Counting our own is three columns.
 *
 * `day` is a date column so the read is an equality or a range on an index —
 * `whereDate()` is forbidden by name in this codebase, and a marketing tab
 * scanning the whole table would be exactly the query that rule exists for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_visits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            $table->date('day');
            /*
             * Which page. `/` is the site's front page and is what a render of
             * `(site)/r/{slug}` reports; a surface that knows its own path
             * sends it. Short, because anything long enough to worry about is a
             * query string, and a query string is not a page.
             */
            $table->string('path', 120)->default('/');
            $table->unsignedBigInteger('visits')->default(0);

            $table->timestamps();

            // The upsert key. Without it two renders in the same millisecond
            // make two rows and the week reads double.
            $table->unique(['tenant_id', 'day', 'path'], 'site_visits_one_row_per_page_per_day');
            // "This restaurant's last thirty days" — the only read there is.
            $table->index(['tenant_id', 'day']);
        });

        RowLevelSecurity::guard('site_visits');
    }

    public function down(): void
    {
        RowLevelSecurity::release('site_visits');
        Schema::dropIfExists('site_visits');
    }
};

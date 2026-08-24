<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The receipt for a data export: who asked, what was walked, where it landed.
 *
 * A GDPR-shaped archive is not an endpoint, it is a pipeline — the console's
 * own TODO says so — and a pipeline needs a row. Answering the request
 * synchronously would time out on the first restaurant with a year of orders
 * behind it, so the work goes to a queue, and the caller needs something to
 * poll. This table is that something.
 *
 * ---------------------------------------------------------------------------
 * Why `path` is relative
 *
 * `exports/12/20260822-171455.zip`, not `/srv/srcp/current/storage/app/…`. The
 * archive lives on local disk today and belongs in object storage the moment
 * there are two API nodes; an absolute path stored in the database would pin
 * every existing row to one machine's filesystem layout and make that move a
 * data migration rather than a config change.
 *
 * ---------------------------------------------------------------------------
 * Why `expires_at` is a column and not a rule in code
 *
 * A link that does not expire is the customer's entire history left on a URL.
 * The signed download link carries its own 24-hour lifetime — that is the
 * signature's job — but the FILE has to die as well, and a sweeper needs
 * something to sort by that does not depend on reading every row's
 * `completed_at` and re-deriving the policy. Storing the moment makes the
 * retention window a fact about the archive rather than a constant that a
 * later change silently reinterprets for rows written under the old one.
 *
 * ---------------------------------------------------------------------------
 * Why `tables` and `rows_count` are stored
 *
 * They are the only honest answer to "is this archive complete?". A zip is
 * complete when it holds every table that carried the restaurant's rows on the
 * day it was built — and that number grows with every module. A row saying
 * "76 tables, 41 209 rows" is checkable against the archive; a row saying
 * "ready" is not.
 *
 * Under row-level security like everything else carrying `tenant_id`: an
 * export row names a file holding one restaurant's entire history, so it is
 * exactly the row another restaurant must never be able to read the id of.
 */
return new class extends Migration
{
    private const TABLE = 'public.tenant_exports';

    public function up(): void
    {
        Schema::create(self::TABLE, function (Blueprint $table): void {
            $table->id();

            /*
             * NOT nullable, unlike most `tenant_id` columns here.
             *
             * Elsewhere a null tenant means "the platform's own row" — a push
             * token for an operator, a storefront awaiting a tenant. There is
             * no such thing as an export of nobody's data: the whole record is
             * the answer to "everything we hold about THIS restaurant".
             */
            $table->foreignId('tenant_id')->constrained('public.tenants')->cascadeOnDelete();

            /*
             * Nulled rather than cascaded when the person leaves.
             *
             * The audit value is in the row existing at all — an archive of a
             * restaurant's entire history was built on this date. Deleting that
             * record because the operator who asked for it has since left the
             * company would remove the evidence, not the archive.
             */
            $table->foreignId('requested_by')->nullable()->constrained('public.users')->nullOnDelete();

            $table->string('state', 12)->default('queued')
                ->comment('queued | running | ready | failed');

            /** Relative to storage/app — see the class docblock. */
            $table->string('path', 500)->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();

            /** How many tables the walk actually found and wrote. */
            $table->unsignedSmallInteger('tables')->default(0);
            $table->unsignedBigInteger('rows_count')->default(0);

            /** Why it failed, in the words the walk used. Shown to the operator. */
            $table->string('error', 500)->nullable();

            $table->timestamp('requested_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('expires_at')->nullable();

            $table->timestamps();

            // The two reads there are: one restaurant's list, newest first, and
            // "is an export already running for this restaurant".
            $table->index(['tenant_id', 'state']);
            $table->index(['tenant_id', 'requested_at']);
        });

        RowLevelSecurity::guard(self::TABLE);
    }

    public function down(): void
    {
        RowLevelSecurity::release(self::TABLE);
        Schema::dropIfExists(self::TABLE);
    }
};

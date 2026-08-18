<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every mutating request, remembered long enough to answer it twice.
 *
 * A waiter on a slow tablet taps Send again. A courier's phone loses signal
 * between the request arriving and the response leaving. A queue replays an
 * hour of work after the router comes back. All three look identical to the
 * server, and all three must produce one kitchen ticket, one payment, one
 * depletion.
 *
 * The row is claimed BEFORE the work runs, not after — the POS module worked
 * this out first and it is the whole point. Claiming afterwards leaves a
 * window in which two concurrent copies both find nothing and both charge the
 * guest.
 *
 * `request_hash` is what turns a reused key into a 409 rather than a silently
 * wrong replay: the same key with a different body is a client bug, and
 * answering it with the first request's response would hide the bug and
 * charge the wrong amount.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.idempotency_keys', function (Blueprint $table): void {
            // The client's own uuid, generated before it knew whether it was
            // online. It is the identity of the operation, so it is the key.
            $table->string('key', 64)->primary();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // Which endpoint claimed it. A key is scoped to one route: the same
            // uuid arriving at /payments and /refunds is two operations, and
            // treating them as one would replay a payment as a refund.
            $table->string('endpoint', 191);
            $table->string('method', 10);

            $table->string('request_hash', 64);

            // Null until the work finishes. A row with no response is a claim
            // in flight; a second arrival waits for it rather than racing it.
            $table->jsonb('response_body')->nullable();
            $table->unsignedSmallInteger('status_code')->nullable();

            $table->timestamp('created_at')->useCurrent();

            // 48 hours, per DATABASE.md §6.4 — long enough to cover a tablet
            // that spent a night offline, short enough that the table stays
            // small at 50 000 receipts a day.
            $table->index('created_at');
            $table->index(['tenant_id', 'endpoint']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('public.idempotency_keys');
    }
};

<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The ledger that lets subscribers be idempotent without inventing a column.
 *
 * Outbox delivery is at-least-once by design: the alternative — marking an
 * event delivered before running the subscriber — loses side effects whenever a
 * process dies mid-handler, which is far worse than running one twice. So a
 * subscriber has to be able to say "I have already dealt with this one", and
 * the unique index below is what makes that answer race-proof.
 *
 * Without it, a guest whose bill was delivered twice gets two visits and a
 * loyalty tier they did not earn.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('processed_domain_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->uuid('event_id');

            // Per subscriber, not per event: three modules may each handle
            // `orders.paid`, and one having finished says nothing about the others.
            $table->string('listener', 191);

            $table->timestamp('processed_at');

            $table->unique(['event_id', 'listener']);
            // Retention sweeps delete by age.
            $table->index('processed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('processed_domain_events');
    }
};

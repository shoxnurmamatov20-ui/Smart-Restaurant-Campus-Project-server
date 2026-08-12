<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The transactional outbox — how one module tells the others something happened.
 *
 * A row lands here inside the same transaction as the business change, so
 * "the order was paid" and "everyone was told the order was paid" either both
 * happen or neither does. Firing an in-memory event instead would lose the
 * notification whenever the process dies between commit and dispatch, and a
 * restaurant would have a paid bill the kitchen never heard about.
 *
 * Columns follow the envelope in docs/architecture/events-and-analytics.md so
 * moving this to Kafka later needs no change to any module.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('domain_events', function (Blueprint $table): void {
            $table->bigIncrements('id');

            // Consumers deduplicate on this: at-least-once delivery means a
            // listener can legitimately see the same event twice.
            $table->uuid('event_id')->unique();

            $table->unsignedBigInteger('tenant_id')->nullable()
                ->comment('Which restaurant this happened in; null for platform-wide events');

            $table->string('name', 100)->comment('Past tense, dotted: orders.paid, kitchen.ticket_ready');
            $table->string('module', 50);
            $table->unsignedSmallInteger('schema_version')->default(1);

            $table->unsignedBigInteger('actor_id')->nullable()
                ->comment('The person behind it; null for system-driven events');

            $table->string('aggregate_type', 120)->nullable();
            $table->unsignedBigInteger('aggregate_id')->nullable();

            $table->json('payload');

            $table->timestamp('occurred_at');

            // Delivery bookkeeping. `available_at` is what makes a retry wait
            // instead of hammering a broken listener in a tight loop.
            $table->timestamp('published_at')->nullable();
            $table->timestamp('available_at')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('last_error')->nullable();

            $table->timestamps();

            // The sweeper's query: undelivered, due, oldest first.
            $table->index(['published_at', 'available_at', 'id'], 'domain_events_pending_index');
            $table->index(['tenant_id', 'name']);
            $table->index(['aggregate_type', 'aggregate_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domain_events');
    }
};

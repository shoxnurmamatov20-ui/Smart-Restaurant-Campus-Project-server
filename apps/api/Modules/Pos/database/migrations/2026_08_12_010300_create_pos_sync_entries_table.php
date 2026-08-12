<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The offline guarantee, in one unique index.
 *
 * A till has to keep selling when the network drops, which means it queues
 * writes locally and replays them later — and a replay is indistinguishable
 * from a retry, a double-tap, or a request whose response was lost on the way
 * back. Every one of those must produce exactly one bill and exactly one
 * payment.
 *
 * `unique(terminal_id, local_id)` is what makes that true. The device stamps
 * every write with a uuid it generated itself; the second arrival of that uuid
 * does not run the work again, it returns what the first one returned.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos.sync_entries', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('terminal_id')->constrained('pos.terminals')->cascadeOnDelete();

            $table->uuid('local_id')->comment('Generated on the device, before it knew whether it was online');
            $table->unsignedBigInteger('local_seq')->default(0)
                ->comment('Device-local order, so a replay applies in the sequence it happened');

            $table->string('action', 64)->comment('bill.open, bill.line.add, bill.tender, …');
            $table->json('payload')->nullable();

            $table->string('status', 16)->default('pending')
                ->comment('pending|accepted|failed');
            $table->json('result')->nullable()->comment('What the first attempt returned — replayed verbatim');
            $table->text('error')->nullable();

            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            // The whole guarantee.
            $table->unique(['terminal_id', 'local_id']);
            $table->index(['tenant_id', 'terminal_id', 'local_seq']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos.sync_entries');
    }
};

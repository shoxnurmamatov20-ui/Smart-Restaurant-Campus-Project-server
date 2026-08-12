<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The fraud ledger.
 *
 * Almost every way to steal from a restaurant till ends in the same shape: the
 * guest pays, and then the line comes off the bill. This table is what makes
 * that shape visible — who asked, who agreed, for how much, and why, with the
 * request and the decision as separate acts by separate people.
 *
 * It is deliberately append-mostly: an approval is never edited, only decided,
 * and a decided one cannot be spent twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos.approvals', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('terminal_id')->constrained('pos.terminals')->cascadeOnDelete();
            $table->foreignId('session_id')->constrained('pos.terminal_sessions')->cascadeOnDelete();

            $table->string('action', 32)
                ->comment('void_line|void_order|discount|price_override|reopen_bill|refund|drawer_open|comp');

            // What it is about. Cross-module ids, so no foreign key.
            $table->string('subject_type', 32)->nullable()->comment('bill|line|payment|drawer');
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->unsignedBigInteger('amount')->nullable()->comment('Tiyin — how much is at stake');

            $table->string('reason', 255);

            $table->foreignId('requested_by_user_id')->constrained('public.users')->cascadeOnDelete();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('public.users')->nullOnDelete();

            $table->string('status', 16)->default('pending')->comment('pending|approved|rejected|expired|used');
            $table->string('method', 16)->nullable()->comment('pin|remote — how the manager answered');

            $table->timestamp('requested_at');
            $table->timestamp('decided_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();

            $table->timestamps();

            // The manager's queue, and the "is this one still good?" lookup.
            $table->index(['tenant_id', 'status', 'expires_at']);
            $table->index(['tenant_id', 'subject_type', 'subject_id']);
            $table->index(['tenant_id', 'requested_by_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos.approvals');
    }
};

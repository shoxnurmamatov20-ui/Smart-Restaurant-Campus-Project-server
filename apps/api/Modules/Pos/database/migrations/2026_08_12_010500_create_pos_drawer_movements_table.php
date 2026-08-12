<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Physical cash moving in and out of a drawer.
 *
 * Finance owns the ledger and always will; this table is the till-level detail
 * Finance has no business knowing — which terminal, which session, who opened
 * the drawer and on whose authority. Every movement that takes money *out* also
 * writes a cash expense in Finance through the TillLedger contract, which is
 * what keeps the Z-report honest without anybody editing its arithmetic.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos.drawer_movements', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('terminal_id')->constrained('pos.terminals')->cascadeOnDelete();
            $table->foreignId('session_id')->constrained('pos.terminal_sessions')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();

            // Finance owns these two; plain ids across the boundary.
            $table->unsignedBigInteger('cash_shift_id')->comment('finance.cash_shifts id — no FK');
            $table->unsignedBigInteger('finance_expense_id')->nullable()
                ->comment('finance.expenses id written for an outgoing movement');

            $table->string('kind', 24)
                ->comment('opening_float|cash_in|cash_out|collection|tip_out|correction');

            // Positive amount plus an explicit direction, rather than a signed
            // number: an auditor reading this table should not have to infer
            // which way the money went from a minus sign.
            $table->unsignedBigInteger('amount')->comment('Tiyin, always positive');
            $table->string('direction', 3)->comment('in|out');

            $table->string('reason', 255);

            $table->foreignId('approval_id')->nullable()->constrained('pos.approvals')->nullOnDelete();

            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['tenant_id', 'cash_shift_id']);
            $table->index(['tenant_id', 'terminal_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos.drawer_movements');
    }
};

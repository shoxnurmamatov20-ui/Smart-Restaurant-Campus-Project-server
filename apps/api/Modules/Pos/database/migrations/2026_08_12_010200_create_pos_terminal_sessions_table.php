<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `terminal_sessions`, not `sessions`.
 *
 * `public.sessions` already exists — it is Laravel's own — and a bare
 * `sessions` in a validation rule or a test assertion resolves through the
 * search_path to that one. Two tables with the same short name in one search
 * path is a bug waiting for a hurried afternoon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos.terminal_sessions', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('terminal_id')->constrained('pos.terminals')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();

            // Finance owns the cash shift; this is a plain id across a module
            // boundary, so no foreign key.
            $table->unsignedBigInteger('cash_shift_id')->nullable()
                ->comment('finance.cash_shifts id — no FK, another module owns it');

            // The Sanctum token minted for this session. Closing the session
            // deletes the token, which is what makes "log out" mean something.
            $table->unsignedBigInteger('access_token_id')->nullable();

            $table->timestamp('opened_at');
            $table->timestamp('last_activity_at');
            $table->timestamp('closed_at')->nullable();
            $table->string('closed_reason', 16)->nullable()
                ->comment('logout|timeout|takeover|shift_close');

            $table->string('ip', 45)->nullable();

            $table->timestamps();

            // "Who is on this till right now" is the hottest read in the module.
            $table->index(['tenant_id', 'terminal_id', 'closed_at']);
            $table->index(['tenant_id', 'user_id', 'closed_at']);
            $table->index('access_token_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos.terminal_sessions');
    }
};

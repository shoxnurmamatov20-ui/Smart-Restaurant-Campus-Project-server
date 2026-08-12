<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos.terminals', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // Branch lives outside this module, so it is a plain id with no
            // foreign key — the same rule Orders follows for tables and guests.
            $table->unsignedBigInteger('branch_id')->nullable()
                ->comment('Filial id — no FK: branches are not owned by Pos');

            $table->string('code', 32)->comment('Kassa kodi, restoran ichida yagona: KASSA-1');
            $table->string('name', 120);

            $table->string('mode', 20)->default('table_service')
                ->comment('table_service|quick_service|bar|counter');
            $table->string('status', 16)->default('active')
                ->comment('active|disabled|maintenance');

            /*
             * Pairing.
             *
             * Only the hash is stored, and the lookup happens before any user is
             * signed in — a terminal has no credentials until it pairs, so the
             * code has to be findable across every restaurant. That rules out a
             * salted hash, which is why the code is long enough (32^8) that an
             * unsalted one is still not worth attacking, and why it dies in ten
             * minutes.
             */
            $table->char('pairing_code_hash', 64)->nullable()
                ->comment('sha256 of the one-time code — never the code itself');
            $table->timestamp('pairing_expires_at')->nullable();
            $table->timestamp('paired_at')->nullable();

            $table->string('device_fingerprint', 128)->nullable();
            $table->string('app_version', 32)->nullable();
            $table->timestamp('last_seen_at')->nullable();

            $table->unsignedBigInteger('pos_layout_id')->nullable()
                ->comment('Tez tugmalar maketi — pos.layouts, set in a later migration');

            $table->json('settings')->nullable()
                ->comment('printer routing, drawer, fiscal serial, rounding, per-role discount limits');

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'mode']);

            // The pairing lookup runs on every attempt from an unauthenticated
            // device, so it must not be a sequential scan.
            $table->index('pairing_code_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos.terminals');
    }
};

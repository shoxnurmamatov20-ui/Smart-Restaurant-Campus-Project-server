<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos.pins', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            // Users are core, not another module — a foreign key is correct here.
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();

            /*
             * A four-digit secret is only defensible because of the two columns
             * below it. The PIN exists so a waiter can switch user in under a
             * second, twenty times an hour; the lockout is what stops that being
             * the same as no password at all.
             */
            $table->string('pin_hash', 255);
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();

            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('rotated_at')->nullable();

            $table->timestamps();

            // One PIN per person per restaurant. Enrolling someone at the till
            // is exactly the act of giving them one.
            $table->unique(['tenant_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos.pins');
    }
};

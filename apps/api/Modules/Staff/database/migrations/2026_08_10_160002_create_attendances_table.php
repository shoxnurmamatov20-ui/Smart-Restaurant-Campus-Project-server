<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.attendances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained('staff.staff_members')->cascadeOnDelete();
            $table->datetime('checked_in_at');
            $table->datetime('checked_out_at')->nullable();
            $table->string('method', 16)->default('pin')->comment('face');
            $table->unsignedInteger('minutes_worked')->default(0);
            $table->boolean('is_late')->default(false);
            $table->string('note', 255)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'staff_member_id', 'checked_in_at']);
            $table->index(['tenant_id', 'checked_in_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff.attendances');
    }
};

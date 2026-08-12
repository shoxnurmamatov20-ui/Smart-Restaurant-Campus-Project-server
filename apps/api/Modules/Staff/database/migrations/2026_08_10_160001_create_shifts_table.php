<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.shifts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained('staff.staff_members')->cascadeOnDelete();
            $table->datetime('starts_at');
            $table->datetime('ends_at');
            $table->string('role', 64)->nullable();
            $table->string('status', 16)->default('planned')->comment('planned');
            $table->string('note', 255)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'starts_at']);
            $table->index(['tenant_id', 'staff_member_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff.shifts');
    }
};
